import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, hashPassword } from "@/lib/auth";
import {
  isValidTelegramChannelUrl,
  normalizeTelegramUsername,
  createNamedInviteLink,
  isChannelInviteConfigured,
} from "@/lib/telegram";
import { z } from "zod";

const schema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  name: z.string().min(1),
  displayName: z.string().optional(),
  refCode: z.string().min(3).max(20),
  defaultCommission: z.number().optional(),
  telegramChannelUrl: z.string().optional().nullable(),
  telegramUsername: z.string().optional().nullable(),
  generateInviteLink: z.boolean().optional(),
});

export async function GET() {
  const session = await requireSession("ADMIN");
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const partners = await prisma.partner.findMany({
    include: {
      user: { select: { username: true, name: true, createdAt: true } },
      _count: { select: { clients: true, subscribers: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(partners);
}

export async function POST(req: NextRequest) {
  const session = await requireSession("ADMIN");
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Неверные данные" }, { status: 400 });
    }
    const {
      username,
      password,
      name,
      displayName,
      refCode,
      defaultCommission,
      telegramChannelUrl,
      telegramUsername,
      generateInviteLink,
    } = parsed.data;

    if (!isValidTelegramChannelUrl(telegramChannelUrl)) {
      return NextResponse.json(
        {
          error:
            "Ссылка TGK должна содержать t.me или telegram.me (или быть пустой)",
        },
        { status: 400 }
      );
    }

    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) {
      return NextResponse.json({ error: "Логин уже занят" }, { status: 409 });
    }
    const code = refCode.toUpperCase();
    const refExists = await prisma.partner.findUnique({ where: { refCode: code } });
    if (refExists) {
      return NextResponse.json({ error: "Реф. код уже занят" }, { status: 409 });
    }

    const settings = await prisma.settings.findUnique({
      where: { id: "default" },
    });

    const passwordHash = await hashPassword(password);
    let channel =
      telegramChannelUrl?.trim() === ""
        ? null
        : telegramChannelUrl?.trim() || null;

    let telegramInviteLink: string | null = null;
    let telegramInviteLinkName: string | null = null;
    let inviteWarning: string | null = null;

    const shouldGenerate =
      generateInviteLink !== false && isChannelInviteConfigured();

    if (shouldGenerate) {
      const created = await createNamedInviteLink(code);
      if ("error" in created) {
        inviteWarning = created.error;
      } else {
        telegramInviteLink = created.inviteLink;
        telegramInviteLinkName = created.name;
        // Prefer auto invite as the traffer's TGK link when manual not set
        if (!channel) {
          channel = created.inviteLink;
        }
      }
    }

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        role: "PARTNER",
        name,
        partner: {
          create: {
            refCode: code,
            displayName: displayName?.trim() || name,
            telegramChannelUrl: channel,
            telegramUsername: normalizeTelegramUsername(telegramUsername),
            telegramInviteLink,
            telegramInviteLinkName,
            defaultCommission:
              defaultCommission ?? settings?.defaultCommission ?? 3000,
          },
        },
      },
      include: { partner: true },
    });

    return NextResponse.json({
      ok: true,
      user,
      inviteWarning,
      inviteConfigured: isChannelInviteConfigured(),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
