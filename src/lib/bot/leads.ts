import { prisma } from "@/lib/prisma";
import { sendMessage } from "@/lib/telegram";
import { formatMoney } from "@/lib/bot/users";
import { resolveProductPayouts } from "@/lib/productDefaults";

export const LEAD_STATUSES = [
  "processing",
  "awaiting_payout",
  "paid",
  "rejected",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export function normalizeLeadStatus(status: string): LeadStatus | string {
  if (status === "new" || status === "duplicate") return "processing";
  if (status === "approved") return "awaiting_payout";
  return status;
}

export function supportDmUrl() {
  const raw =
    process.env.TELEGRAM_SUPPORT_USERNAME?.replace(/^@/, "").trim() ||
    "f3n1byt666";
  return `https://t.me/${raw}`;
}

export async function ensureHoldColumn() {
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "BotLead" ADD COLUMN IF NOT EXISTS "holdUntilOrderComplete" BOOLEAN NOT NULL DEFAULT false`
    );
  } catch {
    /* ignore */
  }
}

export async function creditOnce(opts: {
  userId: string;
  amount: number;
  leadId: string;
  type: string;
  comment: string;
  telegramId?: string | null;
  notify?: string;
}) {
  if (!opts.amount) return false;
  const existing = await prisma.ledgerTx.findFirst({
    where: { leadId: opts.leadId, type: opts.type, userId: opts.userId },
  });
  if (existing) return false;
  await prisma.$transaction([
    prisma.botUser.update({
      where: { id: opts.userId },
      data: { balance: { increment: opts.amount } },
    }),
    prisma.ledgerTx.create({
      data: {
        userId: opts.userId,
        amount: opts.amount,
        type: opts.type,
        leadId: opts.leadId,
        comment: opts.comment,
      },
    }),
  ]);
  if (opts.telegramId && opts.notify) {
    try {
      await sendMessage(opts.telegramId, opts.notify);
    } catch {
      /* blocked */
    }
  }
  return true;
}

function isReadyStatus(status: string) {
  const st = normalizeLeadStatus(status);
  return st === "awaiting_payout" || st === "paid";
}

function isClaimableStatus(status: string) {
  return normalizeLeadStatus(status) === "awaiting_payout";
}

async function orderLineCount(orderId: string | null | undefined) {
  if (!orderId) return 1;
  return prisma.botLead.count({ where: { orderId } });
}

/** Credit subscriber for one lead line and mark paid (idempotent via creditOnce). */
export async function creditSubscriberLine(lead: {
  id: string;
  clientId: string;
  product: { title: string };
  client: { telegramId: string };
  subscriberAmount: number | null;
}) {
  const amount = Math.max(0, Number(lead.subscriberAmount || 0));
  if (!amount) {
    await prisma.botLead.update({
      where: { id: lead.id },
      data: { status: "paid", holdUntilOrderComplete: false },
    });
    return { credited: 0 };
  }
  const did = await creditOnce({
    userId: lead.clientId,
    amount,
    leadId: lead.id,
    type: "credit_sub",
    comment: `Выплата ${lead.product.title}`,
    telegramId: lead.client.telegramId,
    notify:
      `✅ ${lead.product.title}: вам ${formatMoney(amount)}.\n` +
      `Начислено на баланс. Можно вывод в кабинете или ЛС.`,
  });
  await prisma.botLead.update({
    where: { id: lead.id },
    data: { status: "paid", holdUntilOrderComplete: false },
  });
  return { credited: did ? amount : 0 };
}

/** If every non-rejected line is ready and hold was set — auto-credit all unpaid ready lines. */
export async function maybeAutoReleaseOrder(orderId: string | null | undefined) {
  if (!orderId) return;
  await ensureHoldColumn();
  const lines = await prisma.botLead.findMany({
    where: { orderId },
    include: { product: true, client: true },
  });
  if (lines.length <= 1) return;

  const active = lines.filter(
    (l) => normalizeLeadStatus(l.status) !== "rejected"
  );
  if (active.length === 0) return;

  const allReady = active.every((l) => isReadyStatus(l.status));
  if (!allReady) return;

  const heldUnpaid = active.filter(
    (l) =>
      l.holdUntilOrderComplete &&
      normalizeLeadStatus(l.status) === "awaiting_payout"
  );
  // Also release if all are ready and any were held, or if subscriber waited
  if (heldUnpaid.length === 0) {
    // No hold flag — do not auto-credit (user may still tap «Забрать»)
    return;
  }

  let total = 0;
  for (const lead of active) {
    if (normalizeLeadStatus(lead.status) !== "awaiting_payout") continue;
    const r = await creditSubscriberLine(lead);
    total += r.credited;
  }
  if (total > 0) {
    const client = active[0].client;
    try {
      await sendMessage(
        client.telegramId,
        `💸 Чек готов целиком: начислено ${formatMoney(total)}.`
      );
    } catch {
      /* blocked */
    }
  }
}

export async function claimReadyOrderLines(opts: {
  clientId: string;
  orderId: string;
}) {
  await ensureHoldColumn();
  const lines = await prisma.botLead.findMany({
    where: { orderId: opts.orderId, clientId: opts.clientId },
    include: { product: true, client: true },
  });
  if (lines.length === 0) return { error: "чек не найден" as const };

  const ready = lines.filter((l) => isClaimableStatus(l.status));
  if (ready.length === 0) {
    return { error: "нет готовых позиций" as const };
  }

  let total = 0;
  const claimed: string[] = [];
  for (const lead of ready) {
    const r = await creditSubscriberLine(lead);
    total += r.credited;
    claimed.push(lead.id);
  }
  return { ok: true as const, claimed: claimed.length, amount: total };
}

export async function holdOrderUntilComplete(opts: {
  clientId: string;
  orderId: string;
}) {
  await ensureHoldColumn();
  const lines = await prisma.botLead.findMany({
    where: { orderId: opts.orderId, clientId: opts.clientId },
  });
  if (lines.length === 0) return { error: "чек не найден" as const };
  if (lines.length <= 1) {
    return { error: "для одной позиции ожидание чека не нужно" as const };
  }

  const ready = lines.filter((l) => isClaimableStatus(l.status));
  if (ready.length === 0) {
    return { error: "нет готовых позиций" as const };
  }

  await prisma.botLead.updateMany({
    where: { id: { in: ready.map((l) => l.id) } },
    data: { holdUntilOrderComplete: true },
  });

  // If everything is already ready, release immediately
  await maybeAutoReleaseOrder(opts.orderId);

  return { ok: true as const, held: ready.length };
}

export async function setLeadStatus(opts: {
  leadId: string;
  status: string;
  subscriberAmount?: number;
  comment?: string;
}) {
  await ensureHoldColumn();
  const next = normalizeLeadStatus(opts.status) as string;
  if (!LEAD_STATUSES.includes(next as LeadStatus)) {
    return { error: "bad status" as const };
  }
  const full = await prisma.botLead.findUnique({
    where: { id: opts.leadId },
    include: { product: true, referrer: true, client: true },
  });
  if (!full) return { error: "not found" as const };

  const prev = normalizeLeadStatus(full.status);
  const split = resolveProductPayouts(
    full.product.subscriberPrice,
    full.product.reward
  );
  let subAmount =
    opts.subscriberAmount !== undefined && Number.isFinite(opts.subscriberAmount)
      ? Math.max(0, Number(opts.subscriberAmount))
      : full.subscriberAmount ?? split.subscriber;
  let premAmount = full.premiumAmount ?? split.traffer;
  // Admin left the old full CPA in the field — apply 10/45/45.
  if (
    split.legacy &&
    opts.subscriberAmount !== undefined &&
    Math.abs(Number(opts.subscriberAmount) - split.bankCpa) < 0.01
  ) {
    subAmount = split.subscriber;
    premAmount = split.traffer;
  }

  const data: {
    status: string;
    adminComment?: string;
    approvedAt?: Date | null;
    subscriberAmount?: number;
    premiumAmount?: number;
  } = { status: next };
  if (opts.comment !== undefined) data.adminComment = opts.comment;

  if (next === "awaiting_payout" || next === "paid") {
    data.subscriberAmount = subAmount;
    data.premiumAmount = premAmount;
    if (!full.approvedAt) data.approvedAt = new Date();
  }

  await prisma.botLead.update({ where: { id: full.id }, data });

  const multi =
    (await orderLineCount(full.orderId)) > 1 && Boolean(full.orderId);

  if (next === "awaiting_payout" || next === "paid") {
    if (full.referrerId && premAmount) {
      await creditOnce({
        userId: full.referrerId,
        amount: premAmount,
        leadId: full.id,
        type: "credit_lead",
        comment: `Премия ${full.product.title}`,
        telegramId: full.referrer?.telegramId,
        notify: `✅ ${full.product.title}: премия ${formatMoney(premAmount)}.`,
      });
    }

    // Multi-line чек: defer subscriber credit on awaiting_payout (claim / wait UX).
    // Admin «Выплачено» (paid) still credits immediately.
    // Single-line: keep auto-credit on awaiting_payout/paid.
    const shouldCreditSub =
      Boolean(subAmount) && (!multi || next === "paid");

    if (shouldCreditSub) {
      await creditOnce({
        userId: full.clientId,
        amount: subAmount,
        leadId: full.id,
        type: "credit_sub",
        comment: `Выплата ${full.product.title}`,
        telegramId: full.client.telegramId,
        notify:
          `✅ ${full.product.title}: вам ${formatMoney(subAmount)}.\n` +
          (next === "paid"
            ? `Статус: выплачено.`
            : `Статус: ждём выплату. Можно написать в ЛС или оставить заявку на вывод в кабинете.`),
      });
      if (next === "paid") {
        await prisma.botLead.update({
          where: { id: full.id },
          data: { holdUntilOrderComplete: false },
        });
      }
    } else if (multi && next === "awaiting_payout" && subAmount) {
      try {
        await sendMessage(
          full.client.telegramId,
          `🔔 ${full.product.title}: готово ${formatMoney(subAmount)}.\n` +
            `В чеке ещё есть позиции — заберите готовое сейчас или ждите весь чек в кабинете.`
        );
      } catch {
        /* blocked */
      }
      await maybeAutoReleaseOrder(full.orderId);
    }
  }

  if (next === "rejected" && prev !== "rejected") {
    try {
      await sendMessage(
        full.client.telegramId,
        `❌ Заявка отклонена: ${full.product.title}. ${opts.comment || ""}`.trim()
      );
    } catch {
      /* blocked */
    }
    if (full.referrer) {
      try {
        await sendMessage(
          full.referrer.telegramId,
          `❌ Заявка отклонена: ${full.product.title}.`
        );
      } catch {
        /* blocked */
      }
    }
    // Rejecting a line may complete the order for held siblings
    await maybeAutoReleaseOrder(full.orderId);
  }

  if (next === "paid" && prev !== "paid" && !multi) {
    try {
      await sendMessage(
        full.client.telegramId,
        `💸 ${full.product.title}: статус «выплачено». Если ещё не получили — напишите в ЛС или оставьте заявку на вывод.`
      );
    } catch {
      /* blocked */
    }
  }

  return { ok: true as const };
}
