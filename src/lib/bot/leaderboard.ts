import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/bot/users";
import { ownerMarginFromPayouts } from "@/lib/productDefaults";

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

/** Sum company margin on paid leads from 10/45/45 inverse. */
export async function getCompanyProfit(): Promise<{
  companyProfit: number;
  companyProfitLabel: string;
  paidLeads: number;
}> {
  const leads = await prisma.botLead.findMany({
    where: { status: "paid" },
    include: {
      product: { select: { reward: true, subscriberPrice: true } },
    },
  });

  let profit = 0;
  for (const l of leads) {
    const sub = l.subscriberAmount ?? l.product.subscriberPrice ?? 0;
    const prem = l.premiumAmount ?? l.product.reward ?? 0;
    profit += ownerMarginFromPayouts(sub, prem);
  }

  return {
    companyProfit: profit,
    companyProfitLabel: formatMoney(profit),
    paidLeads: leads.length,
  };
}
