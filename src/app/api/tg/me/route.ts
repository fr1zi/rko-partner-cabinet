import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isChannelAdmin } from "@/lib/bot/channelAdmins";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  let channelAdmin = false;
  if (session.telegramId) {
    channelAdmin = await isChannelAdmin(session.telegramId);
  }

  let botUser = null;
  if (session.telegramId) {
    botUser = await prisma.botUser.findUnique({
      where: { telegramId: session.telegramId },
      select: {
        id: true,
        telegramId: true,
        username: true,
        role: true,
        balance: true,
        isBanned: true,
      },
    });
  }

  return NextResponse.json({
    authenticated: true,
    role: session.role,
    username: session.username,
    telegramId: session.telegramId || null,
    channelAdmin,
    botUser,
  });
}
