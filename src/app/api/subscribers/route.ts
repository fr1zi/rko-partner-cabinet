import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { isBotConfigured } from "@/lib/telegram";

export async function GET(req: NextRequest) {
  const session = await requireSession("ADMIN");
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const partnerId = req.nextUrl.searchParams.get("partnerId") || undefined;

  const subscribers = await prisma.subscriber.findMany({
    where: partnerId ? { partnerId } : undefined,
    include: {
      partner: {
        select: {
          id: true,
          displayName: true,
          refCode: true,
          telegramInviteLink: true,
          user: { select: { name: true, username: true } },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  });

  return NextResponse.json({
    botConfigured: isBotConfigured(),
    subscribers,
  });
}
