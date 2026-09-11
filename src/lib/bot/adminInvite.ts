import { prisma } from "@/lib/prisma";
import {
  createNamedInviteLink,
  getChannelPublicUrl,
} from "@/lib/telegram";

export const ADMIN_INVITE_NAME = "ADMIN";

let cachedNamed: string | null = null;

/** Extra named invite (t.me/+…) — still admin-attributed. Public share stays t.me/w1nstr1k3. */
export async function ensureAdminInviteLink(): Promise<string> {
  if (cachedNamed) return cachedNamed;

  const settings = await prisma.settings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", defaultCommission: 3500, adminInviteName: ADMIN_INVITE_NAME },
  });

  if (settings.adminInviteLink?.startsWith("https://")) {
    cachedNamed = settings.adminInviteLink;
    return cachedNamed;
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
    cachedNamed = inv.inviteLink;
    return cachedNamed;
  }

  console.error("admin invite create failed", "error" in inv ? inv.error : inv);
  return getChannelPublicUrl();
}

/** What we put on «Вступить» buttons: public channel, counted as admin ref. */
export async function getChannelJoinUrl(): Promise<string> {
  return getChannelPublicUrl();
}

export function isAdminInviteName(name?: string | null): boolean {
  return (name || "").trim().toUpperCase() === ADMIN_INVITE_NAME;
}

export function isAdminJoinSource(
  inviteLink?: string | null,
  inviteName?: string | null
): boolean {
  if (isAdminInviteName(inviteName)) return true;
  const url = (inviteLink || "").toLowerCase();
  if (!url && !inviteName) return true; // search / t.me/w1nstr1k3
  if (url.includes("w1nstr1k3")) return true;
  if (cachedNamed && inviteLink === cachedNamed) return true;
  return false;
}
