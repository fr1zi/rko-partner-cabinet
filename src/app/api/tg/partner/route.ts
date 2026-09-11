import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getBotDeepLink,
  isBotConfigured,
} from "@/lib/telegram";

export async function GET() {
  const session = await requireSession("PARTNER");
  if (!session || !session.partnerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const partner = await prisma.partner.findUnique({
    where: { id: session.partnerId },
    include: {
      user: { select: { username: true, name: true } },
      _count: { select: { subscribers: true } },
    },
  });
  if (!partner || !partner.active) {
    return NextResponse.json({ error: "Partner not found" }, { status: 404 });
  }

  const clients = await prisma.client.findMany({
    where: { partnerId: partner.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      commission: true,
      commissionStatus: true,
      product: true,
      createdAt: true,
    },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const webRef = `${baseUrl}/r/${partner.refCode}`;
  const botDeep = getBotDeepLink(partner.refCode);
  const inviteLink =
    partner.telegramInviteLink ||
    partner.telegramChannelUrl ||
    (isBotConfigured() ? botDeep : null) ||
    webRef;

  return NextResponse.json({
    partner: {
      id: partner.id,
      refCode: partner.refCode,
      displayName:
        partner.displayName || partner.user.name || partner.user.username,
      telegramUsername: partner.telegramUsername,
      telegramId: partner.telegramId,
    },
    inviteLink,
    subscriberCount: partner._count.subscribers,
    people: clients.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      premium: c.commission,
      commissionStatus: c.commissionStatus,
      product: c.product,
      createdAt: c.createdAt,
    })),
  });
}
