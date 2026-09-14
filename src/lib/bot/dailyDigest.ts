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
  timeLabel: string;
  newLeads: number;
  paidOrAwaiting: number;
  rejectedToday: number;
  newWithdrawals: number;
  pendingWithdrawals: number;
  companyProfit: number;
  companyProfitLabel: string;
  companyProfitMonth: number;
  companyProfitMonthLabel: string;
  openProcessing: number;
  yesterdayLeads: number;
  yesterdayProfitLabel: string;
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

/** Live day dashboard for admins — today so far (MSK) + month + yesterday. */
export async function buildAndSendDailyDigest(): Promise<DailyDigestSummary> {
  await ensureHoldColumn();
  const today = moscowDayBounds(0);
  const yesterday = moscowDayBounds(-1);
  const monthYmd = today.ymd.slice(0, 7) + "-01";
  const monthStartMsk = new Date(`${monthYmd}T00:00:00+03:00`);
  const timeLabel = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  const [
    newLeads,
    paidOrAwaiting,
    rejectedToday,
    newWithdrawals,
    pendingWithdrawals,
    openProcessing,
    profitToday,
    profitMonth,
    yesterdayLeads,
    profitYesterday,
  ] = await Promise.all([
    prisma.botLead.count({
      where: { createdAt: { gte: today.start, lt: today.end } },
    }),
    prisma.botLead.count({
      where: {
        status: { in: ["paid", "awaiting_payout"] },
        OR: [
          { approvedAt: { gte: today.start, lt: today.end } },
          {
            AND: [
              { approvedAt: null },
              { createdAt: { gte: today.start, lt: today.end } },
            ],
          },
        ],
      },
    }),
    prisma.botLead.count({
      where: {
        status: "rejected",
        createdAt: { gte: today.start, lt: today.end },
      },
    }),
    prisma.withdrawal.count({
      where: { createdAt: { gte: today.start, lt: today.end } },
    }),
    prisma.withdrawal.count({ where: { status: "new" } }),
    prisma.botLead.count({ where: { status: "processing" } }),
    companyProfitForRange(today.start, today.end),
    companyProfitForRange(monthStartMsk, today.end),
    prisma.botLead.count({
      where: { createdAt: { gte: yesterday.start, lt: yesterday.end } },
    }),
    companyProfitForRange(yesterday.start, yesterday.end),
  ]);

  const companyProfitLabel = formatMoney(profitToday);
  const monthProfitLabel = formatMoney(profitMonth);
  const yesterdayProfitLabel = formatMoney(profitYesterday);
  const text =
    `📊 <b>Дашборд дня</b> · ${today.ymd} · ${timeLabel} МСК\n\n` +
    `<b>Сегодня на сейчас</b>\n` +
    `📥 Новых позиций: <b>${newLeads}</b>\n` +
    `✅ Одобрено / к выплате: <b>${paidOrAwaiting}</b>\n` +
    `❌ Отказов: <b>${rejectedToday}</b>\n` +
    `💸 Заявок на вывод: <b>${newWithdrawals}</b>\n` +
    `⏳ Выводы в очереди: <b>${pendingWithdrawals}</b>\n` +
    `🔄 В обработке всего: <b>${openProcessing}</b>\n` +
    `💰 Прибыль сегодня: <b>${companyProfitLabel}</b>\n` +
    `📅 Прибыль за месяц: <b>${monthProfitLabel}</b>\n\n` +
    `<b>Вчера</b> (${yesterday.ymd})\n` +
    `📥 Позиций: <b>${yesterdayLeads}</b> · 💰 <b>${yesterdayProfitLabel}</b>`;

  await sendToAdmins(text);

  return {
    date: today.ymd,
    timeLabel,
    newLeads,
    paidOrAwaiting,
    rejectedToday,
    newWithdrawals,
    pendingWithdrawals,
    companyProfit: profitToday,
    companyProfitLabel,
    companyProfitMonth: profitMonth,
    companyProfitMonthLabel: monthProfitLabel,
    openProcessing,
    yesterdayLeads,
    yesterdayProfitLabel,
    sent: true,
  };
}
