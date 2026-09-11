import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isChannelAdmin, getChannelAudienceStats } from "@/lib/bot/channelAdmins";
import { ensureBotProducts, formatMoney } from "@/lib/bot/users";
import {
  sendMessage,
  createNamedInviteLink,
  isChannelInviteConfigured,
} from "@/lib/telegram";
import { refLinkFor } from "@/lib/bot/users";

async function requireChannelAdmin() {
  const session = await getSession();
  if (!session?.telegramId || session.role !== "ADMIN") return null;
  if (!(await isChannelAdmin(session.telegramId))) return null;
  return session;
}

export async function GET(req: NextRequest) {
  const session = await requireChannelAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureBotProducts();
  const tab = req.nextUrl.searchParams.get("tab") || "stats";

  if (tab === "products" || tab === "premiums") {
    const products = await prisma.botProduct.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ products });
  }
  if (tab === "leads") {
    const leads = await prisma.botLead.findMany({
      include: { client: true, product: true, referrer: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ leads });
  }
  if (tab === "withdrawals") {
    const withdrawals = await prisma.withdrawal.findMany({
      include: { user: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ withdrawals });
  }
  if (tab === "users") {
    const users = await prisma.botUser.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json({ users });
  }

  const [trafters, clients, leads, sum, audience] = await Promise.all([
    prisma.botUser.count({
      where: { role: { in: ["traffer", "admin"] } },
    }),
    prisma.botUser.count({
      where: { role: { in: ["client", "subscriber"] } },
    }),
    prisma.botLead.count(),
    prisma.ledgerTx.aggregate({
      where: { type: "credit_lead" },
      _sum: { amount: true },
    }),
    getChannelAudienceStats(true),
  ]);
  return NextResponse.json({
    stats: {
      trafters,
      clients,
      leads,
      channelSubscribers: audience?.subscribers ?? 0,
      channelMembersTotal: audience?.total ?? 0,
      credited: sum._sum.amount || 0,
      creditedLabel: formatMoney(sum._sum.amount || 0),
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await requireChannelAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  if (action === "product_create") {
    const reward = Number(body.reward) || 0;
    const subscriberPrice =
      body.subscriberPrice !== undefined && body.subscriberPrice !== ""
        ? Number(body.subscriberPrice) || 0
        : reward;
    const p = await prisma.botProduct.create({
      data: {
        title: String(body.title || "").trim(),
        bank: String(body.bank || ""),
        description: String(body.description || ""),
        reward,
        subscriberPrice,
        rewardType: body.rewardType === "percent" ? "percent" : "fixed",
        url: String(body.url || ""),
        isActive: body.isActive !== false,
      },
    });
    return NextResponse.json({ ok: true, product: p });
  }

  if (action === "product_update") {
    const id = String(body.id || "");
    const pr = await prisma.botProduct.findUnique({ where: { id } });
    if (!pr) return NextResponse.json({ error: "not found" }, { status: 404 });
    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = String(body.title).trim();
    if (body.bank !== undefined) data.bank = String(body.bank);
    if (body.description !== undefined) data.description = String(body.description);
    if (body.reward !== undefined) data.reward = Number(body.reward) || 0;
    if (body.subscriberPrice !== undefined)
      data.subscriberPrice = Number(body.subscriberPrice) || 0;
    if (body.rewardType !== undefined)
      data.rewardType = body.rewardType === "percent" ? "percent" : "fixed";
    if (body.url !== undefined) data.url = String(body.url);
    const updated = await prisma.botProduct.update({ where: { id }, data });
    return NextResponse.json({ ok: true, product: updated });
  }

  if (action === "product_toggle") {
    const id = String(body.id || "");
    const pr = await prisma.botProduct.findUnique({ where: { id } });
    if (!pr) return NextResponse.json({ error: "not found" }, { status: 404 });
    const updated = await prisma.botProduct.update({
      where: { id },
      data: { isActive: !pr.isActive },
    });
    return NextResponse.json({ ok: true, product: updated });
  }

  if (action === "product_hot") {
    const id = String(body.id || "");
    const days = Number(body.days) || 0;
    const hotUntil =
      days > 0 ? new Date(Date.now() + days * 86400000) : null;
    const updated = await prisma.botProduct.update({
      where: { id },
      data: {
        isHot: Boolean(body.isHot),
        hotText: body.hotText ? String(body.hotText) : null,
        hotUntil,
      },
    });
    return NextResponse.json({ ok: true, product: updated });
  }

  if (action === "lead_approve") {
    const id = String(body.id || "");
    const full = await prisma.botLead.findUnique({
      where: { id },
      include: { product: true, referrer: true },
    });
    if (!full || full.status !== "new") {
      return NextResponse.json({ error: "already processed" }, { status: 400 });
    }
    const existingCredit = await prisma.ledgerTx.findFirst({
      where: { leadId: full.id, type: "credit_lead" },
    });
    await prisma.botLead.update({
      where: { id },
      data: { status: "approved", approvedAt: new Date() },
    });
    if (
      !existingCredit &&
      full.referrerId &&
      full.product.rewardType === "fixed"
    ) {
      const amount = full.product.reward;
      await prisma.$transaction([
        prisma.botUser.update({
          where: { id: full.referrerId },
          data: { balance: { increment: amount } },
        }),
        prisma.ledgerTx.create({
          data: {
            userId: full.referrerId,
            amount,
            type: "credit_lead",
            leadId: full.id,
            comment: `Одобрение ${full.product.title}`,
          },
        }),
      ]);
      if (full.referrer) {
        await sendMessage(
          full.referrer.telegramId,
          `✅ Заявка одобрена: ${full.product.title}. Начислено ${formatMoney(amount)}.`
        );
      }
    } else if (full.referrer) {
      await sendMessage(
        full.referrer.telegramId,
        `✅ Заявка одобрена: ${full.product.title}.`
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "lead_reject") {
    const id = String(body.id || "");
    const comment = String(body.comment || "");
    const full = await prisma.botLead.findUnique({
      where: { id },
      include: { product: true, referrer: true },
    });
    if (!full || full.status !== "new") {
      return NextResponse.json({ error: "already processed" }, { status: 400 });
    }
    await prisma.botLead.update({
      where: { id },
      data: { status: "rejected", adminComment: comment },
    });
    if (full.referrer) {
      await sendMessage(
        full.referrer.telegramId,
        `❌ Заявка отклонена: ${full.product.title}. ${comment}`
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "wd_approve" || action === "wd_reject" || action === "wd_paid") {
    const id = String(body.id || "");
    const full = await prisma.withdrawal.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!full) return NextResponse.json({ error: "not found" }, { status: 404 });

    if (action === "wd_approve") {
      await prisma.withdrawal.update({
        where: { id },
        data: { status: "approved" },
      });
      await sendMessage(
        full.user.telegramId,
        `Вывод ${formatMoney(full.amount)} одобрен.`
      );
    } else if (action === "wd_reject") {
      if (full.status === "new" || full.status === "approved") {
        await prisma.$transaction([
          prisma.withdrawal.update({
            where: { id },
            data: { status: "rejected" },
          }),
          prisma.botUser.update({
            where: { id: full.userId },
            data: { balance: { increment: full.amount } },
          }),
          prisma.ledgerTx.create({
            data: {
              userId: full.userId,
              amount: full.amount,
              type: "adjust",
              comment: "возврат после отклонения вывода",
            },
          }),
        ]);
      }
      await sendMessage(
        full.user.telegramId,
        `Вывод ${formatMoney(full.amount)} отклонён, средства возвращены.`
      );
    } else {
      await prisma.withdrawal.update({
        where: { id },
        data: { status: "paid" },
      });
      await sendMessage(
        full.user.telegramId,
        `Вывод ${formatMoney(full.amount)} выплачен.`
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "user_ban") {
    const id = String(body.id || "");
    const u = await prisma.botUser.findUnique({ where: { id } });
    if (!u) return NextResponse.json({ error: "not found" }, { status: 404 });
    const updated = await prisma.botUser.update({
      where: { id },
      data: { isBanned: !u.isBanned },
    });
    return NextResponse.json({ ok: true, user: updated });
  }

  if (action === "user_adjust") {
    const id = String(body.id || "");
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount === 0) {
      return NextResponse.json({ error: "bad amount" }, { status: 400 });
    }
    await prisma.$transaction([
      prisma.botUser.update({
        where: { id },
        data: { balance: { increment: amount } },
      }),
      prisma.ledgerTx.create({
        data: {
          userId: id,
          amount,
          type: "adjust",
          comment: String(body.comment || "корректировка админом"),
        },
      }),
    ]);
    return NextResponse.json({ ok: true });
  }

  if (action === "user_set_role") {
    const id = String(body.id || "");
    const nextRole = String(body.role || "");
    if (nextRole !== "traffer" && nextRole !== "subscriber") {
      return NextResponse.json({ error: "bad role" }, { status: 400 });
    }
    const u = await prisma.botUser.findUnique({ where: { id } });
    if (!u) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (u.role === "admin" || (await isChannelAdmin(u.telegramId))) {
      return NextResponse.json(
        { error: "нельзя менять роль админа канала" },
        { status: 400 }
      );
    }
    const updated = await prisma.botUser.update({
      where: { id },
      data: { role: nextRole },
    });
    try {
      if (nextRole === "traffer") {
        const ref = refLinkFor(updated.telegramId);
        let inviteLine = "";
        if (isChannelInviteConfigured()) {
          const inv = await createNamedInviteLink(
            `t${updated.telegramId.slice(-8)}`
          );
          if ("inviteLink" in inv) {
            inviteLine = `\nКанал (именная ссылка): ${inv.inviteLink}`;
          }
        }
        await sendMessage(
          updated.telegramId,
          `✅ Вам выдали роль траффера.\n\n🔗 Ваша реф-ссылка:\n<code>${ref}</code>${inviteLine}`
        );
      } else {
        await sendMessage(
          updated.telegramId,
          "✅ Вам выдали роль подписчика.\n\nРеф-ссылка и вывод партнёра больше не доступны."
        );
      }
    } catch {
      /* blocked */
    }
    return NextResponse.json({ ok: true, user: updated });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
