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

/** Traffer ranking by sum of credit_lead ledger credits. */
export async function getTrafferLeaderboard(
  limit = 20
): Promise<LeaderboardEntry[]> {
  const traffers = await prisma.botUser.findMany({
    where: { role: "traffer", isBanned: false },
    select: {
      id: true,
      username: true,
      telegramId: true,
    },
  });
  if (trafters.length === 0) return [];

  const ids = traffers.map((t) => t.id);
  const [sums, paidCounts] = await Promise.all([
    prisma.ledgerTx.groupBy({
      by: ["userId"],
      where: { userId: { in: ids }, type: "credit_lead" },
      _sum: { amount: true },
    }),
    prisma.botLead.groupBy({
      by: ["referrerId"],
      where: {
        referrerId: { in: ids },
        status: { in: ["paid", "approved", "awaiting_payout"] },
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

  const rows = traffers
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

  return rows.map((r, i) => ({
    rank: i + 1,
    userId: r.userId,
    username: r.username,
    telegramId: r.telegramId,
    earned: r.earned,
    earnedLabel: formatMoney(r.earned),
    leadsPaid: r.leadsPaid,
  }));
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
