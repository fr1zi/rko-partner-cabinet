import { prisma } from "@/lib/prisma";
import { sendMessage } from "@/lib/telegram";
import { formatMoney } from "@/lib/bot/users";
import {
  isAdminRefAttribution,
  resolveProductPayouts,
} from "@/lib/productDefaults";

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

/**
 * Ensure BotLead columns added in schema but not yet migrated on prod.
 * MUST run before any prisma.botLead query — Prisma SELECTs these fields.
 */
export async function ensureBotLeadColumns() {
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "BotLead" ADD COLUMN IF NOT EXISTS "orderId" TEXT`
    );
  } catch {
    /* ignore */
  }
  try {
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "BotLead_orderId_idx" ON "BotLead"("orderId")`
    );
  } catch {
    /* ignore */
  }
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "BotLead" ADD COLUMN IF NOT EXISTS "holdUntilOrderComplete" BOOLEAN NOT NULL DEFAULT false`
    );
  } catch {
    /* ignore */
  }
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "BotLead" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`
    );
  } catch {
    /* ignore */
  }
}

/** @deprecated alias — use ensureBotLeadColumns */
export async function ensureHoldColumn() {
  return ensureBotLeadColumns();
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

/** Reverse a prior credit_lead / credit_sub for a lead (idempotent). */
async function reverseCreditOnce(opts: {
  userId: string;
  leadId: string;
  creditType: string;
  reverseType: string;
  comment: string;
  telegramId?: string | null;
  notify?: string;
}) {
  const credit = await prisma.ledgerTx.findFirst({
    where: {
      leadId: opts.leadId,
      type: opts.creditType,
      userId: opts.userId,
    },
  });
  if (!credit || !(Number(credit.amount) > 0)) return false;
  const already = await prisma.ledgerTx.findFirst({
    where: {
      leadId: opts.leadId,
      type: opts.reverseType,
      userId: opts.userId,
    },
  });
  if (already) return false;
  const amt = Math.abs(Number(credit.amount));
  await prisma.$transaction([
    prisma.botUser.update({
      where: { id: opts.userId },
      data: { balance: { decrement: amt } },
    }),
    prisma.ledgerTx.create({
      data: {
        userId: opts.userId,
        amount: -amt,
        type: opts.reverseType,
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
  const adminRef = isAdminRefAttribution({
    referrerId: full.referrerId,
    referrerRole: full.referrer?.role,
    inviteLinkName: full.client.inviteLinkName,
  });
  const split = resolveProductPayouts(
    full.product.subscriberPrice,
    full.product.reward,
    { adminRef }
  );
  let subAmount =
    opts.subscriberAmount !== undefined && Number.isFinite(opts.subscriberAmount)
      ? Math.max(0, Number(opts.subscriberAmount))
      : full.subscriberAmount ?? split.subscriber;
  let premAmount = adminRef ? 0 : full.premiumAmount ?? split.traffer;
  // Admin left the old full CPA in the field — apply split (10/45/45 or 0/45/55).
  if (
    split.legacy &&
    opts.subscriberAmount !== undefined &&
    Math.abs(Number(opts.subscriberAmount) - split.bankCpa) < 0.01
  ) {
    subAmount = split.subscriber;
    premAmount = split.traffer;
  }
  if (adminRef) premAmount = 0;

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

  if (next === "awaiting_payout" || next === "paid") {
    // Admin-ref / admin referrer: no traffer credit (owner keeps 55%, not on leaderboard)
    const canCreditTraffer =
      !adminRef &&
      Boolean(full.referrerId) &&
      premAmount > 0 &&
      (full.referrer?.role || "").toLowerCase() !== "admin";
    if (canCreditTraffer && full.referrerId) {
      // No notify here — status DM below is the single message path
      await creditOnce({
        userId: full.referrerId,
        amount: premAmount,
        leadId: full.id,
        type: "credit_lead",
        comment: `Премия ${full.product.title}`,
        telegramId: full.referrer?.telegramId,
      });
    }

    // Always credit subscriber immediately (same as single-line).
    // Multi-line hold / claim-ready UX removed as unsafe.
    // No credit notify — status DM below avoids double spam.
    if (subAmount) {
      await creditOnce({
        userId: full.clientId,
        amount: subAmount,
        leadId: full.id,
        type: "credit_sub",
        comment: `Выплата ${full.product.title}`,
        telegramId: full.client.telegramId,
      });
      await prisma.botLead.update({
        where: { id: full.id },
        data: { holdUntilOrderComplete: false },
      });
    }
  }

  // Status DMs only on real transition; one short line each (no creditOnce spam)
  if (
    prev !== next &&
    (next === "awaiting_payout" || next === "paid" || next === "rejected")
  ) {
    const productLabel = full.product.title;
    const amountLabel = formatMoney(subAmount);
    let clientMsg = "";
    if (next === "awaiting_payout") {
      clientMsg = `✅ ${productLabel}: одобрено, ждём выплату ${amountLabel}`;
    } else if (next === "paid") {
      clientMsg = `💸 ${productLabel}: выплачено`;
    } else {
      const c = String(opts.comment || "").trim();
      clientMsg = c
        ? `❌ ${productLabel}: отказ. ${c}`
        : `❌ ${productLabel}: отказ.`;
    }
    try {
      await sendMessage(full.client.telegramId, clientMsg);
    } catch {
      /* blocked */
    }

    const notifyReferrer =
      !adminRef &&
      full.referrer &&
      (full.referrer.role || "").toLowerCase() !== "admin";
    if (notifyReferrer && full.referrer) {
      const handle = full.client.username
        ? `@${String(full.client.username).replace(/^@/, "")}`
        : `id ${full.client.telegramId}`;
      const statusRu =
        next === "awaiting_payout"
          ? "ждём выплату"
          : next === "paid"
            ? "выплачено"
            : "отказ";
      const refMsg = `Реферал ${handle}: ${productLabel} → ${statusRu}`;
      try {
        await sendMessage(full.referrer.telegramId, refMsg);
      } catch {
        /* blocked */
      }
    }
  }

  return { ok: true as const };
}

/**
 * Soft-remove a product line from a чек: status rejected + adminComment,
 * reverse any traffer/subscriber credits, DM the client with the reason.
 */
export async function removeOrderLine(opts: {
  leadId: string;
  reason: string;
}) {
  await ensureHoldColumn();
  const reason = String(opts.reason || "").trim();
  if (!reason) {
    return { error: "укажите причину" as const };
  }

  const full = await prisma.botLead.findUnique({
    where: { id: opts.leadId },
    include: { product: true, referrer: true, client: true },
  });
  if (!full) return { error: "not found" as const };

  const prev = normalizeLeadStatus(full.status);
  const productLabel = full.product.bank
    ? `${full.product.title} · ${full.product.bank}`
    : full.product.title;
  const comment = `Удалено из чека: ${reason}`;

  if (prev !== "rejected") {
    await prisma.botLead.update({
      where: { id: full.id },
      data: {
        status: "rejected",
        adminComment: comment,
        holdUntilOrderComplete: false,
      },
    });
  } else {
    await prisma.botLead.update({
      where: { id: full.id },
      data: { adminComment: comment, holdUntilOrderComplete: false },
    });
  }

  // Reverse traffer premium if already credited
  if (full.referrerId) {
    await reverseCreditOnce({
      userId: full.referrerId,
      leadId: full.id,
      creditType: "credit_lead",
      reverseType: "debit_reverse_lead",
      comment: `Сторно премии: ${productLabel}`,
      telegramId: full.referrer?.telegramId,
      notify: `↩️ Премия по «${productLabel}» отменена — позицию удалили из чека.`,
    });
  }

  // Reverse subscriber credit if already paid out
  await reverseCreditOnce({
    userId: full.clientId,
    leadId: full.id,
    creditType: "credit_sub",
    reverseType: "debit_reverse_sub",
    comment: `Сторно выплаты: ${productLabel}`,
  });

  try {
    await sendMessage(
      full.client.telegramId,
      `🗑 Позиция удалена из вашего чека: ${productLabel}.\n` +
        `Причина: ${reason}`
    );
  } catch {
    /* blocked */
  }

  await maybeAutoReleaseOrder(full.orderId);
  return { ok: true as const };
}
