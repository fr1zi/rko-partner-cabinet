import { prisma } from "@/lib/prisma";
import { sendToAdmins } from "@/lib/telegram";
import { formatMoney } from "@/lib/bot/users";
import {
  isAdminRefAttribution,
  ownerMarginFromPayouts,
} from "@/lib/productDefaults";
import { ensureHoldColumn } from "@/lib/bot/leads";

/** Moscow calendar day bounds as UTC Date range [start, end). */
export function moscowDayBounds(offsetDays = 0): {
  start: Date;
  end: Date;
  ymd: string;
} {
  const now = new Date();
  const todayYmd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const todayStart = new Date(`${todayYmd}T00:00:00+03:00`);
  const start = new Date(
    todayStart.getTime() + offsetDays * 24 * 60 * 60 * 1000
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(start);
  return { start, end, ymd };
}

export type DailyDigestSummary = {
  date: string;
  newLeads: number;
  newWithdrawals: number;
  pendingWithdrawals: number;
  companyProfit: number;
  companyProfitLabel: string;
  openProcessing: number;
  sent: boolean;
};

async function companyProfitForRange(
  start: Date,
  end: Date
): Promise<number> {
  const leads = await prisma.botLead.findMany({
    where: {
      status: { in: ["paid", "awaiting_payout"] },
      OR: [
        { approvedAt: { gte: start, lt: end } },
        {
          AND: [
            { approvedAt: null },
            { createdAt: { gte: start, lt: end } },
          ],
        },
      ],
    },
    include: {
      product: { select: { reward: true, subscriberPrice: true } },
      referrer: { select: { role: true } },
      client: { select: { inviteLinkName: true } },
    },
  });

  let profit = 0;
  for (const l of leads) {
    const adminRef = isAdminRefAttribution({
      referrerId: l.referrerId,
      referrerRole: l.referrer?.role,
      inviteLinkName: l.client.inviteLinkName,
    });
    const sub = Math.max(
      0,
      Number(l.subscriberAmount ?? l.product.subscriberPrice ?? 0) || 0
    );
    const prem = adminRef
      ? 0
      : Math.max(0, Number(l.premiumAmount ?? l.product.reward ?? 0) || 0);
    profit += ownerMarginFromPayouts(sub, prem);
  }
  return profit;
}

export async function buildAndSendDailyDigest(): Promise<DailyDigestSummary> {
  await ensureHoldColumn();
  const { start, end, ymd } = moscowDayBounds(-1);

  const [newLeads, newWithdrawals, pendingWithdrawals, openProcessing, profit] =
    await Promise.all([
      prisma.botLead.count({
        where: { createdAt: { gte: start, lt: end } },
      }),
      prisma.withdrawal.count({
        where: { createdAt: { gte: start, lt: end } },
      }),
      prisma.withdrawal.count({ where: { status: "new" } }),
      prisma.botLead.count({ where: { status: "processing" } }),
      companyProfitForRange(start, end),
    ]);

  const companyProfitLabel = formatMoney(profit);
  const text =
    `☀️ <b>Утренний дайджест</b> · ${ymd} (МСК)\n\n` +
    `📥 Новых заявок: <b>${newLeads}</b>\n` +
    `💸 Выводов вчера: <b>${newWithdrawals}</b>\n` +
    `⏳ Выводов в ожидании: <b>${pendingWithdrawals}</b>\n` +
    `💰 Прибыль компании: <b>${companyProfitLabel}</b>\n` +
    `🔄 В обработке: <b>${openProcessing}</b>`;

  await sendToAdmins(text);

  return {
    date: ymd,
    newLeads,
    newWithdrawals,
    pendingWithdrawals,
    companyProfit: profit,
    companyProfitLabel,
    openProcessing,
    sent: true,
  };
}
