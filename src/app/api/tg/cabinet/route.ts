import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { refLinkFor, formatMoney, isHotProduct, ensureBotProducts } from "@/lib/bot/users";
import { getChannelJoinUrl } from "@/lib/bot/adminInvite";
import { sendMessage, sendToAdmins } from "@/lib/telegram";
import { supportDmUrl, normalizeLeadStatus } from "@/lib/bot/leads";

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
  const isAdminCabinet = user.role === "admin";
  const refs = await prisma.botUser.findMany({
    where: isAdminCabinet ? {} : { referrerId: user.id },
    orderBy: { createdAt: "desc" },
    take: isAdminCabinet ? 300 : 50,
    include: {
      referrer: { select: { username: true, firstName: true } },
    },
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

  const myLeads = await prisma.botLead.findMany({
    where: { clientId: user.id },
    include: { product: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const refStatuses = await Promise.all(
    refs.map(async (r) => {
      const ls = await prisma.botLead.findMany({
        where: { clientId: r.id },
        include: { product: { select: { title: true, reward: true } } },
        orderBy: { createdAt: "desc" },
      });
      let status: "approved" | "pending" | "none" = "none";
      const st = ls.map((x) => normalizeLeadStatus(x.status));
      if (st.some((s) => s === "awaiting_payout" || s === "paid" || s === "approved"))
        status = "approved";
      else if (st.some((s) => s === "processing" || s === "new" || s === "duplicate"))
        status = "pending";
      const refUser = r.referrer;
      return {
        id: r.id,
        username: r.username,
        firstName: r.firstName,
        telegramId: r.telegramId,
        status,
        createdAt: r.createdAt,
        role: r.role,
        refSource:
          refUser?.username ||
          refUser?.firstName ||
          (isAdminCabinet
            ? r.referrerId
              ? "траффер"
              : "Админы"
            : undefined),
        issues: ls.map((x) => ({
          id: x.id,
          status: x.status,
          product: x.product.title,
          premium: x.product.reward,
        })),
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
    supportUrl: supportDmUrl(),
    applications: myLeads.map((l) => ({
      id: l.id,
      status: normalizeLeadStatus(l.status),
      product: l.product.bank
        ? `${l.product.title} · ${l.product.bank}`
        : l.product.title,
      subscriberAmount: l.subscriberAmount ?? l.product.subscriberPrice,
      premium: l.premiumAmount ?? l.product.reward,
      createdAt: l.createdAt,
    })),
    referrals: refStatuses,
    leads: leads.map((l) => ({
      id: l.id,
      status: l.status,
      product: l.product.bank ? `${l.product.title} · ${l.product.bank}` : l.product.title,
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
    if (
      user.role !== "traffer" &&
      user.role !== "admin" &&
      user.role !== "subscriber" &&
      user.role !== "client"
    ) {
      return NextResponse.json(
        { error: "Вывод недоступен" },
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


  if (action === "apply") {
    const productId = String(body.productId || "");
    const product = await prisma.botProduct.findUnique({ where: { id: productId } });
    if (!product || !product.isActive) {
      return NextResponse.json({ error: "продукт недоступен" }, { status: 400 });
    }
    const existing = await prisma.botLead.findFirst({
      where: {
        clientId: user.id,
        productId,
        status: { not: "rejected" },
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: "заявка по этому продукту уже есть" },
        { status: 400 }
      );
    }
    const lead = await prisma.botLead.create({
      data: {
        clientId: user.id,
        referrerId: user.referrerId,
        productId,
        fullName: user.username
          ? `@${String(user.username).replace(/^@/, "")}`
          : user.firstName || user.telegramId || "",
        phone: String(body.phone || ""),
        status: "processing",
      },
    });
    await sendToAdmins(
      `📥 Новая заявка (в обработке)\nКлиент: ${user.username ? `@${String(user.username).replace(/^@/, "")}` : `id ${user.telegramId}`}\nПродукт: ${product.bank ? `${product.title} · ${product.bank}` : product.title}\nID: ${lead.id}`
    );
    if (user.referrerId) {
      const ref = await prisma.botUser.findUnique({ where: { id: user.referrerId } });
      if (ref) {
        try {
          await sendMessage(
            ref.telegramId,
            `🔔 Новая заявка от реферала ${user.username ? `@${String(user.username).replace(/^@/, "")}` : user.telegramId}: ${product.bank ? `${product.title} · ${product.bank}` : product.title}`
          );
        } catch {
          /* blocked */
        }
      }
    }
    return NextResponse.json({ ok: true, id: lead.id });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
