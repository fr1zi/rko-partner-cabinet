import { prisma } from "@/lib/prisma";
import { sendMessage } from "@/lib/telegram";
import { formatMoney } from "@/lib/bot/users";

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

async function creditOnce(opts: {
  userId: string;
  amount: number;
  leadId: string;
  type: string;
  comment: string;
  telegramId?: string | null;
  notify?: string;
}) {
  if (!opts.amount) return;
  const existing = await prisma.ledgerTx.findFirst({
    where: { leadId: opts.leadId, type: opts.type, userId: opts.userId },
  });
  if (existing) return;
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
}

export async function setLeadStatus(opts: {
  leadId: string;
  status: string;
  subscriberAmount?: number;
  comment?: string;
}) {
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
  const subAmount =
    opts.subscriberAmount !== undefined && Number.isFinite(opts.subscriberAmount)
      ? Math.max(0, Number(opts.subscriberAmount))
      : full.subscriberAmount ?? full.product.subscriberPrice ?? 0;
  const premAmount = full.premiumAmount ?? full.product.reward ?? 0;

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
    if (subAmount) {
      await creditOnce({
        userId: full.clientId,
        amount: subAmount,
        leadId: full.id,
        type: "credit_sub",
        comment: `Выплата ${full.product.title}`,
        telegramId: full.client.telegramId,
        notify:
          `✅ ${full.product.title}: вам ${formatMoney(subAmount)}.\n` +
          `Статус: ждём выплату. Можно написать в ЛС или оставить заявку на вывод в кабинете.`,
      });
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
  }

  if (next === "paid" && prev !== "paid") {
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
