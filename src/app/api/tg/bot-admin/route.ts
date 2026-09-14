import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isChannelAdmin, getChannelAudienceStats } from "@/lib/bot/channelAdmins";
import { ensureBotProducts, formatMoney } from "@/lib/bot/users";
import {
  trafferReward,
  subscriberPayout,
  ownerPayout,
  estimateBankCpa,
  ownerMarginFromPayouts,
} from "@/lib/productDefaults";
import {
  sendMessage,
  createNamedInviteLink,
  isChannelInviteConfigured,
} from "@/lib/telegram";
import { refLinkFor } from "@/lib/bot/users";
import { setLeadStatus, removeOrderLine } from "@/lib/bot/leads";
import {
  getCompanyProfit,
  getTrafferLeaderboard,
  getTaxReport,
  currentYearMonth,
  updateLeaderboardSettings,
  resetLeaderboardPeriod,
  metaFromSettings,
} from "@/lib/bot/leaderboard";
import { buildTaxReportDocx } from "@/lib/bot/taxDocx";
import { createProductOrder } from "@/lib/bot/orders";
import { ensureHoldColumn } from "@/lib/bot/leads";
import { buildAndSendDailyDigest } from "@/lib/bot/dailyDigest";


async function ensureWithdrawalColumns() {
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Withdrawal" ADD COLUMN IF NOT EXISTS "adminComment" TEXT`
    );
  } catch {
    /* ignore */
  }
}

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
  await ensureHoldColumn();
  await ensureBotProducts();
  const tab = req.nextUrl.searchParams.get("tab") || "stats";

  if (tab === "products" || tab === "premiums") {
    const products = await prisma.botProduct.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      products: products.map((pr) => {
        const bankCpa = estimateBankCpa(pr.subscriberPrice, pr.reward);
        return {
          ...pr,
          bankCpa,
          ownerMargin: ownerMarginFromPayouts(pr.subscriberPrice, pr.reward),
        };
      }),
    });
  }
  if (tab === "leads") {
    await ensureHoldColumn();
    const leads = await prisma.botLead.findMany({
      include: { client: true, product: true, referrer: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ leads });
  }
  if (tab === "withdrawals") {
    await ensureWithdrawalColumns();
    const withdrawals = await prisma.withdrawal.findMany({
      include: { user: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ withdrawals });
  }
  if (tab === "tax_docx") {
    const monthParam =
      req.nextUrl.searchParams.get("month") || currentYearMonth();
    const taxReport = await getTaxReport(monthParam);
    const buf = await buildTaxReportDocx(taxReport);
    const filename = `reestr-${taxReport.month}.docx`;
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (tab === "users") {
    await ensureHoldColumn();
    const [users, products, subscribers] = await Promise.all([
      prisma.botUser.findMany({
        orderBy: { createdAt: "desc" },
        take: 500,
        include: {
          referrer: { select: { id: true, username: true, firstName: true, role: true } },
          leadsAsClient: {
            include: { product: { select: { id: true, title: true, bank: true, reward: true } } },
            orderBy: { createdAt: "desc" },
          },
        },
      }),
      prisma.botProduct.findMany({
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, title: true, bank: true, reward: true },
      }),
      prisma.subscriber.findMany({
        select: {
          telegramId: true,
          username: true,
          joinedAt: true,
          inviteLinkName: true,
        },
      }),
    ]);
    const subByTg = new Map(subscribers.map((s) => [s.telegramId, s]));
    return NextResponse.json({
      products,
      users: users.map((u) => {
        const sub = subByTg.get(u.telegramId);
        return {
          id: u.id,
          username: u.username || sub?.username || null,
          firstName: u.firstName,
          telegramId: u.telegramId,
          role: u.role,
          balance: u.balance,
          isBanned: u.isBanned,
          createdAt: sub?.joinedAt || u.createdAt,
          inviteLinkName: u.inviteLinkName || sub?.inviteLinkName || null,
          refSource:
            u.referrer?.username ||
            u.referrer?.firstName ||
            (u.inviteLinkName === "ADMIN" ||
            sub?.inviteLinkName === "ADMIN" ||
            !u.referrerId
              ? "Админы"
              : "траффер"),
          issues: u.leadsAsClient.map((l) => ({
            id: l.id,
            status: l.status,
            productId: l.product.id,
            product: l.product.bank
              ? `${l.product.title} · ${l.product.bank}`
              : l.product.title,
            premium: l.product.reward,
            orderId: l.orderId ?? null,
          })),
        };
      }),
    });
  }

  const monthParam =
    req.nextUrl.searchParams.get("month") || currentYearMonth();

  const [trafters, clients, leads, sum, audience, profit, lb, taxReport] =
    await Promise.all([
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
      getCompanyProfit(),
      getTrafferLeaderboard(10),
      getTaxReport(monthParam),
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
      companyProfit: profit.companyProfit,
      companyProfitLabel: profit.companyProfitLabel,
      paidLeads: profit.paidLeads,
    },
    taxReport,
    leaderboard: lb.rows,
    leaderboardMeta: lb.meta,
  });
}

export async function POST(req: NextRequest) {
  const session = await requireChannelAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  if (action === "product_set_cpa") {
    const id = String(body.id || "");
    const cpa = Math.max(0, Math.round(Number(body.bankCpa) || 0));
    const pr = await prisma.botProduct.findUnique({ where: { id } });
    if (!pr) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const updated = await prisma.botProduct.update({
      where: { id },
      data: {
        reward: trafferReward(cpa),
        subscriberPrice: subscriberPayout(cpa),
      },
    });
    return NextResponse.json({
      ok: true,
      product: {
        ...updated,
        bankCpa: cpa,
        ownerMargin: ownerPayout(cpa),
      },
    });
  }

  if (action === "leaderboard_save") {
    const s = await updateLeaderboardSettings({
      speech: body.speech,
      prize: body.prize,
      periodDays: body.periodDays,
    });
    return NextResponse.json({ ok: true, meta: metaFromSettings(s) });
  }

  if (action === "leaderboard_reset") {
    const s = await resetLeaderboardPeriod();
    return NextResponse.json({ ok: true, meta: metaFromSettings(s) });
  }

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

  if (
    action === "lead_approve" ||
    action === "lead_reject" ||
    action === "lead_set_status"
  ) {
    const id = String(body.id || "");
    let status = String(body.status || "");
    if (action === "lead_approve") status = "awaiting_payout";
    if (action === "lead_reject") status = "rejected";
    const amountRaw = body.subscriberAmount;
    const subscriberAmount =
      amountRaw === undefined || amountRaw === ""
        ? undefined
        : Number(amountRaw);
    const result = await setLeadStatus({
      leadId: id,
      status,
      subscriberAmount,
      comment: body.comment ? String(body.comment) : undefined,
    });
    if ("error" in result) {
      const code = result.error === "not found" ? 404 : 400;
      return NextResponse.json({ error: result.error }, { status: code });
    }
    return NextResponse.json({ ok: true });
  }


  if (action === "leads_bulk_status") {
    const leadIds: string[] = Array.isArray(body.leadIds)
      ? body.leadIds.map(String).filter(Boolean)
      : [];
    const status = String(body.status || "");
    if (!["awaiting_payout", "paid", "rejected"].includes(status)) {
      return NextResponse.json({ error: "bad status" }, { status: 400 });
    }
    if (leadIds.length === 0) {
      return NextResponse.json({ error: "нет leadIds" }, { status: 400 });
    }
    const amountRaw = body.subscriberAmount;
    const subscriberAmount =
      amountRaw === undefined || amountRaw === ""
        ? undefined
        : Number(amountRaw);
    const comment = body.comment ? String(body.comment) : undefined;
    let updated = 0;
    const errors: Array<{ id: string; error: string }> = [];
    for (const leadId of leadIds) {
      const result = await setLeadStatus({
        leadId,
        status,
        subscriberAmount,
        comment,
      });
      if ("error" in result) {
        errors.push({ id: leadId, error: String(result.error) });
      } else {
        updated += 1;
      }
    }
    return NextResponse.json({ ok: true, updated, errors });
  }

  if (action === "remove_order_line") {
    const leadId = String(body.leadId || body.id || "");
    const reason = String(body.reason || "").trim();
    if (!leadId) {
      return NextResponse.json({ error: "нет leadId" }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json(
        { error: "укажите причину удаления" },
        { status: 400 }
      );
    }
    const result = await removeOrderLine({ leadId, reason });
    if ("error" in result) {
      const code = result.error === "not found" ? 404 : 400;
      return NextResponse.json({ error: result.error }, { status: code });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "wd_approve" || action === "wd_reject" || action === "wd_paid") {
    await ensureWithdrawalColumns();
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
      const reason = String(body.reason || "").trim();
      if (!reason) {
        return NextResponse.json(
          { error: "укажите причину отклонения" },
          { status: 400 }
        );
      }
      if (full.status === "new" || full.status === "approved") {
        await prisma.$transaction([
          prisma.withdrawal.update({
            where: { id },
            data: { status: "rejected", adminComment: reason },
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
      } else {
        await prisma.withdrawal.update({
          where: { id },
          data: { status: "rejected", adminComment: reason },
        });
      }
      await sendMessage(
        full.user.telegramId,
        `❌ Вывод отклонён: ${reason}`
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
    const roleData: {
      role: string;
      inviteLink?: string;
      inviteLinkName?: string;
    } = { role: nextRole };
    let inviteLine = "";
    if (nextRole === "traffer" && isChannelInviteConfigured()) {
      const inv = await createNamedInviteLink(
        `t${u.telegramId.slice(-8)}`
      );
      if ("inviteLink" in inv) {
        roleData.inviteLink = inv.inviteLink;
        roleData.inviteLinkName = inv.name || `t${u.telegramId.slice(-8)}`;
        inviteLine = `\nКанал (именная ссылка): ${inv.inviteLink}`;
      }
    }
    const updated = await prisma.botUser.update({
      where: { id },
      data: roleData,
    });
    try {
      if (nextRole === "traffer") {
        const ref = refLinkFor(updated.telegramId);
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


  if (action === "issue_products") {
    const userId = String(body.userId || body.id || "");
    const client = await prisma.botUser.findUnique({
      where: { id: userId },
    });
    if (!client) return NextResponse.json({ error: "not found" }, { status: 404 });
    const all = body.productIds === "all" || body.all === true;
    let productIds: string[] = Array.isArray(body.productIds)
      ? body.productIds.map(String)
      : body.productId
        ? [String(body.productId)]
        : [];
    if (all) {
      const products = await prisma.botProduct.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      productIds = products.map((p) => p.id);
    }
    const fullName = client.username
      ? `@${String(client.username).replace(/^@/, "")}`
      : client.firstName || client.telegramId || "";
    const result = await createProductOrder({
      clientId: client.id,
      referrerId: client.referrerId,
      fullName,
      productIds,
      adminComment: "оформлено вручную",
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      orderId: result.orderId,
      created: result.created.length,
    });
  }

  if (action === "send_daily_digest") {
    const summary = await buildAndSendDailyDigest();
    return NextResponse.json({ ok: true, ...summary });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
