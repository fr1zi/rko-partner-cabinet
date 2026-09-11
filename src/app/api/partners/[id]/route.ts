import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import {
  isValidTelegramChannelUrl,
  normalizeTelegramUsername,
  createNamedInviteLink,
  isChannelInviteConfigured,
} from "@/lib/telegram";
import { z } from "zod";

const schema = z.object({
  displayName: z.string().optional().nullable(),
  name: z.string().optional().nullable(),
  telegramChannelUrl: z.string().optional().nullable(),
  telegramUsername: z.string().optional().nullable(),
  defaultCommission: z.number().optional(),
  active: z.boolean().optional(),
  regenerateInviteLink: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const data = parsed.data;
    if (
      data.telegramChannelUrl !== undefined &&
      !isValidTelegramChannelUrl(data.telegramChannelUrl)
    ) {
      return NextResponse.json(
        {
          error:
            "Ссылка TGK должна содержать t.me или telegram.me (или быть пустой)",
        },
        { status: 400 }
      );
    }

    const partner = await prisma.partner.findUnique({
      where: { id: params.id },
    });
    if (!partner) {
      return NextResponse.json({ error: "Не найден" }, { status: 404 });
    }

    const channel =
      data.telegramChannelUrl === undefined
        ? undefined
        : data.telegramChannelUrl?.trim() === ""
          ? null
          : data.telegramChannelUrl?.trim() || null;

    let telegramInviteLink: string | undefined;
    let telegramInviteLinkName: string | undefined;
    let inviteWarning: string | null = null;

    const needInvite =
      data.regenerateInviteLink === true ||
      (!partner.telegramInviteLink && isChannelInviteConfigured());

    if (needInvite && isChannelInviteConfigured()) {
      const created = await createNamedInviteLink(partner.refCode);
      if ("error" in created) {
        inviteWarning = created.error;
      } else {
        telegramInviteLink = created.inviteLink;
        telegramInviteLinkName = created.name;
      }
    }

    const updated = await prisma.partner.update({
      where: { id: params.id },
      data: {
        ...(data.displayName !== undefined
          ? { displayName: data.displayName?.trim() || null }
          : {}),
        ...(channel !== undefined ? { telegramChannelUrl: channel } : {}),
        ...(data.telegramUsername !== undefined
          ? {
              telegramUsername: normalizeTelegramUsername(data.telegramUsername),
            }
          : {}),
        ...(data.defaultCommission !== undefined
          ? { defaultCommission: data.defaultCommission }
          : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
        ...(telegramInviteLink !== undefined
          ? {
              telegramInviteLink,
              telegramInviteLinkName: telegramInviteLinkName ?? partner.refCode,
              // If no manual TGK yet, surface the invite link there too
              ...(channel === undefined && !partner.telegramChannelUrl
                ? { telegramChannelUrl: telegramInviteLink }
                : {}),
            }
          : {}),
      },
      include: { user: true },
    });

    if (data.name !== undefined || data.displayName !== undefined) {
      const newName =
        (data.name?.trim() || data.displayName?.trim() || null) ?? undefined;
      if (newName) {
        await prisma.user.update({
          where: { id: partner.userId },
          data: { name: newName },
        });
      }
    }

    return NextResponse.json({
      ok: true,
      partner: updated,
      inviteWarning,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
