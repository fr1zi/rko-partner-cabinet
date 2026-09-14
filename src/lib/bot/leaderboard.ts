import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/bot/users";
import {
  estimateBankCpa,
  isAdminRefAttribution,
  ownerMarginFromPayouts,
} from "@/lib/productDefaults";
import { ensureHoldColumn } from "@/lib/bot/leads";

export type LeaderboardEntry = {
  rank: number;
  userId: string;
  username: string | null;
  telegramId: string;
  earned: number;
  earnedLabel: string;
  leadsPaid: number;
};

export type LeaderboardMeta = {
  speech: string;
  prize: string;
  periodDays: number;
  periodStart: string;
  periodEndsAt: string | null;
  daysLeft: number | null;
};

const DEFAULT_SPEECH =
  "Кто в топе по премиям — тот ближе к награде. Крутите трафик, закрывайте РКО и забирайте место на пьедестале.";
const DEFAULT_PRIZE = "Награда за 1 место — пишет админ в настройках лидерборда.";

async function ensureLbColumns() {
  // Safe for Postgres/Neon when schema was extended but DB not pushed yet.
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "lbSpeech" TEXT NOT NULL DEFAULT '${DEFAULT_SPEECH.replace(/'/g, "''")}'`
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "lbPrize" TEXT NOT NULL DEFAULT '${DEFAULT_PRIZE.replace(/'/g, "''")}'`
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "lbPeriodDays" INTEGER NOT NULL DEFAULT 30`
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "lbPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`
    );
  } catch {
    /* ignore — table may not exist yet in local empty DBs */
  }
}

export async function getLeaderboardSettings() {
  await ensureLbColumns();
  let s = await prisma.settings.findUnique({ where: { id: "default" } });
  if (!s) {
    s = await prisma.settings.create({
      data: {
        id: "default",
        lbSpeech: DEFAULT_SPEECH,
        lbPrize: DEFAULT_PRIZE,
        lbPeriodDays: 30,
        lbPeriodStart: new Date(),
      },
    });
  }
  return s;
}

export function metaFromSettings(s: {
  lbSpeech: string;
  lbPrize: string;
  lbPeriodDays: number;
  lbPeriodStart: Date;
}): LeaderboardMeta {
  const start = s.lbPeriodStart;
  const days = Math.max(1, s.lbPeriodDays || 30);
  const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
  const daysLeft = Math.max(
    0,
    Math.ceil((end.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  );
  return {
    speech: s.lbSpeech || DEFAULT_SPEECH,
    prize: s.lbPrize || DEFAULT_PRIZE,
    periodDays: days,
    periodStart: start.toISOString(),
    periodEndsAt: end.toISOString(),
    daysLeft,
  };
}

/** Traffer ranking by credit_lead credits since current period start. */
export async function getTrafferLeaderboard(
  limit = 20
): Promise<{ rows: LeaderboardEntry[]; meta: LeaderboardMeta }> {
  const settings = await getLeaderboardSettings();
  const meta = metaFromSettings(settings);
  const since = settings.lbPeriodStart;

  const traffers = await prisma.botUser.findMany({
    where: { role: "traffer", isBanned: false },
    select: {
      id: true,
      username: true,
      telegramId: true,
    },
  });
  if (traffers.length === 0) return { rows: [], meta };

  const ids = traffers.map((t) => t.id);
  const [sums, paidCounts] = await Promise.all([
    prisma.ledgerTx.groupBy({
      by: ["userId"],
      where: {
        userId: { in: ids },
        type: "credit_lead",
        createdAt: { gte: since },
      },
      _sum: { amount: true },
    }),
    prisma.botLead.groupBy({
      by: ["referrerId"],
      where: {
        referrerId: { in: ids },
        status: { in: ["paid", "approved", "awaiting_payout"] },
        createdAt: { gte: since },
        // Admin-ref leads store premiumAmount=0 — exclude from traffer ranking
        NOT: { premiumAmount: 0 },
      },
      _count: { _all: true },
    }),
  ]);

  const earnedBy = new Map(
    sums.map((s) => [s.userId, s._sum.amount || 0] as const)
  );
  const paidBy = new Map(
    paidCounts
      .filter((p) => p.referrerId)
      .map((p) => [p.referrerId as string, p._count._all] as const)
  );

  const ranked = traffers
    .map((t) => ({
      userId: t.id,
      username: t.username,
      telegramId: t.telegramId,
      earned: earnedBy.get(t.id) || 0,
      leadsPaid: paidBy.get(t.id) || 0,
    }))
    .filter((r) => r.earned > 0 || r.leadsPaid > 0)
    .sort((a, b) => b.earned - a.earned || b.leadsPaid - a.leadsPaid)
    .slice(0, limit);

  const rows = ranked.map((r, i) => ({
    rank: i + 1,
    userId: r.userId,
    username: r.username,
    telegramId: r.telegramId,
    earned: r.earned,
    earnedLabel: formatMoney(r.earned),
    leadsPaid: r.leadsPaid,
  }));

  return { rows, meta };
}

export async function updateLeaderboardSettings(input: {
  speech?: string;
  prize?: string;
  periodDays?: number;
}) {
  await getLeaderboardSettings();
  const data: {
    lbSpeech?: string;
    lbPrize?: string;
    lbPeriodDays?: number;
  } = {};
  if (input.speech !== undefined) data.lbSpeech = String(input.speech).slice(0, 2000);
  if (input.prize !== undefined) data.lbPrize = String(input.prize).slice(0, 500);
  if (input.periodDays !== undefined) {
    const n = Math.round(Number(input.periodDays));
    data.lbPeriodDays = Math.min(365, Math.max(1, Number.isFinite(n) ? n : 30));
  }
  return prisma.settings.update({ where: { id: "default" }, data });
}

/** Start a fresh period — scores count from now. */
export async function resetLeaderboardPeriod() {
  await getLeaderboardSettings();
  return prisma.settings.update({
    where: { id: "default" },
    data: { lbPeriodStart: new Date() },
  });
}

function moscowTodayBounds(): { start: Date; end: Date } {
  const todayYmd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const start = new Date(`${todayYmd}T00:00:00+03:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function moscowMonthBounds(): { start: Date; end: Date } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const mo = Number(parts.find((p) => p.type === "month")?.value);
  const start = new Date(`${y}-${String(mo).padStart(2, "0")}-01T00:00:00+03:00`);
  const endMo = mo === 12 ? 1 : mo + 1;
  const endY = mo === 12 ? y + 1 : y;
  const end = new Date(
    `${endY}-${String(endMo).padStart(2, "0")}-01T00:00:00+03:00`
  );
  return { start, end };
}

/** Sum company margin on paid / awaiting_payout leads (45% normal, 55% admin-ref). */
export async function getCompanyProfit(opts?: {
  start?: Date;
  end?: Date;
  /** Include awaiting_payout as well as paid (default true for day/month dashboards). */
  includeAwaiting?: boolean;
}): Promise<{
  companyProfit: number;
  companyProfitLabel: string;
  paidLeads: number;
}> {
  await ensureHoldColumn();
  const includeAwaiting = opts?.includeAwaiting !== false;
  const status = includeAwaiting
    ? { in: ["paid", "awaiting_payout"] as string[] }
    : "paid";
  const dateFilter =
    opts?.start && opts?.end
      ? {
          OR: [
            { approvedAt: { gte: opts.start, lt: opts.end } },
            {
              AND: [
                { approvedAt: null },
                { createdAt: { gte: opts.start, lt: opts.end } },
              ],
            },
          ],
        }
      : {};
  const leads = await prisma.botLead.findMany({
    where: { status, ...dateFilter },
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
    const sub = l.subscriberAmount ?? l.product.subscriberPrice ?? 0;
    const prem = adminRef
      ? 0
      : l.premiumAmount ?? l.product.reward ?? 0;
    profit += ownerMarginFromPayouts(sub, prem);
  }

  return {
    companyProfit: profit,
    companyProfitLabel: formatMoney(profit),
    paidLeads: leads.length,
  };
}

export async function getCompanyProfitDayMonth() {
  const day = moscowTodayBounds();
  const month = moscowMonthBounds();
  // Same basis for all buckets: paid + awaiting_payout (owner margin).
  // Otherwise «всего» (paid-only) can be lower than day/month — looks broken.
  const [today, monthP, all] = await Promise.all([
    getCompanyProfit({ start: day.start, end: day.end, includeAwaiting: true }),
    getCompanyProfit({
      start: month.start,
      end: month.end,
      includeAwaiting: true,
    }),
    getCompanyProfit({ includeAwaiting: true }),
  ]);
  return {
    today: today.companyProfit,
    todayLabel: today.companyProfitLabel,
    month: monthP.companyProfit,
    monthLabel: monthP.companyProfitLabel,
    allTime: all.companyProfit,
    allTimeLabel: all.companyProfitLabel,
    paidLeads: all.paidLeads,
  };
}

function parseMonthBounds(month: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(String(month || "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (!Number.isFinite(y) || mo < 1 || mo > 12) return null;
  const start = new Date(y, mo - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, mo, 1, 0, 0, 0, 0);
  return { start, end };
}

export function currentYearMonth(d = new Date()): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${mo}`;
}

export type TaxReportRow = {
  id: string;
  date: string;
  orderId: string | null;
  client: string;
  product: string;
  bankCpa: number;
  subscriberPayout: number;
  trafferPayout: number;
  companyProfit: number;
  status: string;
  refType: "admin" | "traffer";
};

export type TaxReportSummary = {
  bankCpa: number;
  bankCpaLabel: string;
  subscriberPayouts: number;
  subscriberPayoutsLabel: string;
  trafferPayouts: number;
  trafferPayoutsLabel: string;
  companyProfit: number;
  companyProfitLabel: string;
  paidPositions: number;
  withdrawalsPaid: number;
  withdrawalsPaidLabel: string;
  adminRefOwner: number;
  adminRefOwnerLabel: string;
};

export type TaxReport = {
  month: string;
  summary: TaxReportSummary;
  rows: TaxReportRow[];
};

/**
 * Monthly financial report for tax/accounting (Admin → Итоги).
 * Leads: paid / awaiting_payout with approvedAt in month (fallback createdAt).
 * Withdrawals: paid / approved with createdAt in month.
 */
export async function getTaxReport(month?: string): Promise<TaxReport> {
  await ensureHoldColumn();
  const ym = month && parseMonthBounds(month) ? month : currentYearMonth();
  const bounds = parseMonthBounds(ym)!;
  const { start, end } = bounds;

  const [leads, withdrawals, creditSub, creditLead] = await Promise.all([
    prisma.botLead.findMany({
      where: {
        status: { in: ["paid", "awaiting_payout"] },
        OR: [
          { approvedAt: { gte: start, lt: end } },
          { AND: [{ approvedAt: null }, { createdAt: { gte: start, lt: end } }] },
        ],
      },
      include: {
        product: {
          select: {
            title: true,
            bank: true,
            reward: true,
            subscriberPrice: true,
          },
        },
        referrer: { select: { role: true, username: true, telegramId: true } },
        client: {
          select: {
            username: true,
            telegramId: true,
            inviteLinkName: true,
            firstName: true,
          },
        },
      },
      orderBy: [{ approvedAt: "desc" }, { createdAt: "desc" }],
      take: 2000,
    }),
    prisma.withdrawal.findMany({
      where: {
        status: { in: ["paid", "approved"] },
        createdAt: { gte: start, lt: end },
      },
      select: { amount: true },
    }),
    prisma.ledgerTx.aggregate({
      where: {
        type: "credit_sub",
        createdAt: { gte: start, lt: end },
      },
      _sum: { amount: true },
    }),
    prisma.ledgerTx.aggregate({
      where: {
        type: "credit_lead",
        createdAt: { gte: start, lt: end },
      },
      _sum: { amount: true },
    }),
  ]);

  let bankCpaSum = 0;
  let subFromLeads = 0;
  let trafferFromLeads = 0;
  let companyProfit = 0;
  let adminRefOwner = 0;
  const rows: TaxReportRow[] = [];

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
    const owner = ownerMarginFromPayouts(sub, prem);
    const cpa =
      estimateBankCpa(sub, prem) ||
      Math.round(sub + prem + owner);

    bankCpaSum += cpa;
    subFromLeads += sub;
    trafferFromLeads += prem;
    companyProfit += owner;
    if (adminRef) adminRefOwner += owner;

    const when = l.approvedAt || l.createdAt;
    const clientHandle = l.client.username
      ? `@${String(l.client.username).replace(/^@/, "")}`
      : l.client.firstName || l.client.telegramId;
    const productLabel = l.product.bank
      ? `${l.product.title} · ${l.product.bank}`
      : l.product.title;

    rows.push({
      id: l.id,
      date: when.toISOString().slice(0, 10),
      orderId: l.orderId ?? null,
      client: clientHandle,
      product: productLabel,
      bankCpa: cpa,
      subscriberPayout: sub,
      trafferPayout: prem,
      companyProfit: owner,
      status: l.status,
      refType: adminRef ? "admin" : "traffer",
    });
  }

  // Prefer ledger totals when present (actual credits); else lead amounts
  const subLedger = creditSub._sum.amount || 0;
  const leadLedger = creditLead._sum.amount || 0;
  const subscriberPayouts = subLedger > 0 ? subLedger : subFromLeads;
  const trafferPayouts = leadLedger > 0 ? leadLedger : trafferFromLeads;
  const withdrawalsPaid = withdrawals.reduce((s, w) => s + (w.amount || 0), 0);

  return {
    month: ym,
    summary: {
      bankCpa: bankCpaSum,
      bankCpaLabel: formatMoney(bankCpaSum),
      subscriberPayouts,
      subscriberPayoutsLabel: formatMoney(subscriberPayouts),
      trafferPayouts,
      trafferPayoutsLabel: formatMoney(trafferPayouts),
      companyProfit,
      companyProfitLabel: formatMoney(companyProfit),
      paidPositions: leads.length,
      withdrawalsPaid,
      withdrawalsPaidLabel: formatMoney(withdrawalsPaid),
      adminRefOwner,
      adminRefOwnerLabel: formatMoney(adminRefOwner),
    },
    rows,
  };
}
