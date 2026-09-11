import { prisma } from "@/lib/prisma";
import {
  createNamedInviteLink,
  getChannelPublicUrl,
} from "@/lib/telegram";

export const ADMIN_INVITE_NAME = "ADMIN";

let cached: string | null = null;

/** Named channel invite attributed to admins (organic + public share URL). */
export async function ensureAdminInviteLink(): Promise<string> {
  if (cached) return cached;

  const settings = await prisma.settings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", defaultCommission: 3500, adminInviteName: ADMIN_INVITE_NAME },
  });

  if (settings.adminInviteLink?.startsWith("https://")) {
    cached = settings.adminInviteLink;
    return cached!;
  }

  const inv = await createNamedInviteLink(ADMIN_INVITE_NAME);
  if ("inviteLink" in inv) {
    await prisma.settings.update({
      where: { id: "default" },
      data: {
        adminInviteLink: inv.inviteLink,
        adminInviteName: inv.name || ADMIN_INVITE_NAME,
      },
    });
    cached = inv.inviteLink;
    return cached;
  }

  console.error("admin invite create failed", "error" in inv ? inv.error : inv);
  return getChannelPublicUrl();
}

export async function getChannelJoinUrl(): Promise<string> {
  try {
    return await ensureAdminInviteLink();
  } catch (e) {
    console.error("getChannelJoinUrl", e);
    return getChannelPublicUrl();
  }
}

export function isAdminInviteName(name?: string | null): boolean {
  return (name || "").trim().toUpperCase() === ADMIN_INVITE_NAME;
}
