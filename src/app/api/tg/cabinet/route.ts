import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { refLinkFor, formatMoney, isHotProduct, ensureBotProducts } from "@/lib/bot/users";
import { getChannelJoinUrl } from "@/lib/bot/adminInvite";
import { sendToAdmins } from "@/lib/telegram";

async function requireBotUser() {
  const session = await getSession();
  if (!session?.telegramId) return null;
  const user = await prisma.botUser.findUnique({
    where: { telegramId: session.telegramId },
  });
  if (!user || user.isBanned) return null;
  return { session, user };
}

export async function GET() {
  const ctx = await requireBotUser();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { user, session } = ctx;
  await ensureBotProducts();

  const clicks = await prisma.referralClick.count({
    where: { referrerId: user.id },
  });
  const regs = await prisma.botUser.count({ where: { referrerId: user.id } });
  const leads = await prisma.botLead.findMany({
    where: { referrerId: user.id },
    include: { product: true, client: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const approved = leads.filter((l) => l.status === "approved").length;
  const rejected = leads.filter((l) => l.status === "rejected").length;
  const sumAgg = await prisma.ledgerTx.aggregate({
    where: { userId: user.id, type: "credit_lead" },
    _sum: { amount: true },
  });
  const products = await prisma.botProduct.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });
  const refs = await prisma.botUser.findMany({
    where: { referrerId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const withdrawals = await prisma.withdrawal.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const txs = await prisma.ledgerTx.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const refStatuses = await Promise.all(
    refs.map(async (r) => {
      const ls = await prisma.botLead.findMany({
        where: { clientId: r.id },
        select: { status: true },
      });
      let status: "approved" | "pending" | "none" = "none";
      if (ls.some((x) => x.status === "approved")) status = "approved";
      else if (ls.some((x) => x.status === "new" || x.status === "duplicate"))
        status = "pending";
      return {
        id: r.id,
        username: r.username,
        firstName: r.firstName,
        telegramId: r.telegramId,
        status,
        createdAt: r.createdAt,
      };
    })
  );

  return NextResponse.json({
    role: session.role,
    botUser: {
      id: user.id,
      telegramId: user.telegramId,
      username: user.username,
      firstName: user.firstName,
      balance: user.balance,
      role: user.role,
    },
    refLink: refLinkFor(user.telegramId),
    stats: {
      clicks,
      registrations: regs,
      leadsTotal: leads.length,
      approved,
      rejected,
      credited: sumAgg._sum.amount || 0,
      creditedLabel: formatMoney(sumAgg._sum.amount || 0),
    },
    products: products
      .map((p) => ({
        id: p.id,
        title: p.title,
        bank: p.bank,
        description: p.description,
        reward: p.reward,
        subscriberPrice: p.subscriberPrice,
        rewardType: p.rewardType,
        url: p.url,
        hot: isHotProduct(p),
        hotText: p.hotText,
      }))
      .sort((a, b) => Number(b.hot) - Number(a.hot)),
    channelUrl: await getChannelJoinUrl(),
    referrals: refStatuses,
    leads: leads.map((l) => ({
      id: l.id,
      status: l.status,
      product: l.product.title,
      client: l.client.username || l.client.telegramId,
      fullName: l.fullName,
      createdAt: l.createdAt,
    })),
    withdrawals,
    txs,
  });
}

export async function POST(req: NextRequest) {
  const ctx = await requireBotUser();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { user } = ctx;
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  if (action === "withdraw") {
    if (user.role !== "traffer" && user.role !== "admin") {
      return NextResponse.json(
        { error: "Вывод доступен только трафферам" },
        { status: 403 }
      );
    }
    const amount = Number(body.amount);
    const details = String(body.details || "").trim();
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Некорректная сумма" }, { status: 400 });
    }
    if (!details || details.length < 3) {
      return NextResponse.json({ error: "Укажите реквизиты" }, { status: 400 });
    }
    const fresh = await prisma.botUser.findUnique({ where: { id: user.id } });
    if (!fresh || amount > fresh.balance) {
      return NextResponse.json({ error: "Недостаточно средств" }, { status: 400 });
    }
    await prisma.$transaction([
      prisma.botUser.update({
        where: { id: user.id },
        data: { balance: { decrement: amount } },
      }),
      prisma.withdrawal.create({
        data: { userId: user.id, amount, details, status: "new" },
      }),
      prisma.ledgerTx.create({
        data: {
          userId: user.id,
          amount: -amount,
          type: "debit_withdraw",
          comment: "hold вывода",
        },
      }),
    ]);
    await sendToAdmins(
      `💸 Запрос вывода ${formatMoney(amount)}\nОт: ${fresh.username || fresh.telegramId}\n${details}`
    );
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
