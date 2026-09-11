import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { validateInitData, isTelegramAdmin } from "@/lib/telegram-webapp";
import { normalizeTelegramUsername } from "@/lib/telegram";
import { upsertBotUser, isTrafferBotUser } from "@/lib/bot/users";
import {
  getChannelMemberStatus,
  isChannelMemberStatus,
} from "@/lib/bot/channelAdmins";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const initData = typeof body.initData === "string" ? body.initData : "";
    const validated = validateInitData(initData);
    if ("error" in validated) {
      return NextResponse.json(
        { error: validated.error, role: null },
        { status: 401 }
      );
    }

    const { user } = validated;
    const telegramId = String(user.id);
    const usernameNorm = normalizeTelegramUsername(user.username || null);

    // Parallel Telegram API calls (Desktop Mini App felt stuck on sequential RTT)
    const [channelAdmin, memberStatus] = await Promise.all([
      isTelegramAdmin(telegramId),
      getChannelMemberStatus(telegramId),
    ]);
    const inChannel = isChannelMemberStatus(memberStatus);

    // Do NOT force traffer for every opener — default subscriber
    const botUser = await upsertBotUser(
      {
        id: user.id,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
      },
      { role: channelAdmin ? "admin" : undefined }
    );

    if (botUser.isBanned) {
      return NextResponse.json(
        { error: "доступ закрыт", role: null },
        { status: 403 }
      );
    }

    if (channelAdmin) {
      const adminUser = await prisma.user.findFirst({
        where: { role: "ADMIN" },
        orderBy: { createdAt: "asc" },
      });
      await createSession({
        userId: adminUser?.id || `tg-admin:${telegramId}`,
        username: adminUser?.username || usernameNorm || `tg:${telegramId}`,
        role: "ADMIN",
        telegramId,
      });
      return NextResponse.json({
        ok: true,
        role: "ADMIN",
        channelMember: inChannel,
        channelMemberStatus: memberStatus,
        botUser: {
          id: botUser.id,
          balance: botUser.balance,
          role: botUser.role,
        },
        telegram: {
          id: telegramId,
          username: usernameNorm,
          firstName: user.first_name || null,
        },
      });
    }

    // PARTNER only when admin assigned BotUser.role=traffer (never auto)
    if (await isTrafferBotUser(botUser)) {
      await createSession({
        userId: botUser.id,
        username: usernameNorm || `tg:${telegramId}`,
        role: "PARTNER",
        telegramId,
      });
      return NextResponse.json({
        ok: true,
        role: "PARTNER",
        channelMember: inChannel,
        channelMemberStatus: memberStatus,
        botUser: {
          id: botUser.id,
          balance: botUser.balance,
          role: "traffer",
        },
        telegram: {
          id: telegramId,
          username: usernameNorm,
          firstName: user.first_name || null,
        },
      });
    }

    if (botUser.role === "client") {
      await prisma.botUser.update({
        where: { id: botUser.id },
        data: { role: "subscriber" },
      });
    }

    await createSession({
      userId: botUser.id,
      username: usernameNorm || `tg:${telegramId}`,
      role: "SUBSCRIBER",
      telegramId,
    });

    return NextResponse.json({
      ok: true,
      role: "SUBSCRIBER",
      channelMember: inChannel,
      channelMemberStatus: memberStatus,
      botUser: {
        id: botUser.id,
        balance: botUser.balance,
        role: "subscriber",
      },
      telegram: {
        id: telegramId,
        username: usernameNorm,
        firstName: user.first_name || null,
      },
    });
  } catch (e) {
    console.error("tg auth error", e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
