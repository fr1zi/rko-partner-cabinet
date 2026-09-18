import { prisma } from "@/lib/prisma";
import { catalogEntries } from "@/lib/productDefaults";
import { isChannelAdmin } from "@/lib/bot/channelAdmins";

export type TgFrom = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

/** Traffer ONLY when BotUser.role === "traffer" (admin assigns; never auto on /start). */
export async function isTrafferBotUser(user: {
  role: string;
}): Promise<boolean> {
  return user.role === "traffer";
}

export async function upsertBotUser(
  from: TgFrom,
  opts?: {
    role?: string;
    referrerId?: string | null;
    bindReferrerIfEmpty?: boolean;
    forceAdminCheck?: boolean;
  }
) {
  const telegramId = String(from.id);
  const username = from.username ? `@${from.username}` : null;
  const firstName = from.first_name || null;
  const existing = await prisma.botUser.findUnique({ where: { telegramId } });
  const channelAdmin =
    opts?.forceAdminCheck !== false
      ? await isChannelAdmin(telegramId)
      : false;

  if (existing) {
    const data: {
      username: string | null;
      firstName: string | null;
      role?: string;
      referrerId?: string;
    } = { username, firstName };

    if (channelAdmin || opts?.role === "admin") {
      data.role = "admin";
    } else if (opts?.role === "subscriber" || opts?.role === "client") {
      // never downgrade admin/traffer via upsert — demote only via setBotUserRole
      if (existing.role === "admin" || existing.role === "traffer") {
        /* keep */
      } else {
        data.role = "subscriber";
      }
    }
    // opts.role=traffer ignored here — promote only via admin setBotUserRole

    if (
      opts?.bindReferrerIfEmpty &&
      opts.referrerId &&
      !existing.referrerId &&
      opts.referrerId !== existing.id
    ) {
      data.referrerId = opts.referrerId;
    }

    return prisma.botUser.update({ where: { id: existing.id }, data });
  }

  // Claim pending role assignment saved as pending:<username> before first /start
  if (username) {
    const bare = username.replace(/^@/, "").toLowerCase();
    const pending = await prisma.botUser.findUnique({
      where: { telegramId: `pending:${bare}` },
    });
    if (pending) {
      let role = pending.role;
      if (channelAdmin) role = "admin";
      else if (opts?.role === "admin") role = "admin";
      else if (role === "client") role = "subscriber";

      let referrerId: string | undefined = pending.referrerId || undefined;
      if (opts?.referrerId) {
        const ref = await prisma.botUser.findFirst({
          where: {
            OR: [{ id: opts.referrerId }, { telegramId: opts.referrerId }],
          },
        });
        if (ref && ref.telegramId !== telegramId) referrerId = ref.id;
      }

      return prisma.botUser.update({
        where: { id: pending.id },
        data: {
          telegramId,
          username,
          firstName,
          role,
          referrerId,
        },
      });
    }
  }

  // EVERY new user = subscriber (or admin if channel admin). Never auto-traffer.
  let role = "subscriber";
  if (channelAdmin) role = "admin";
  else if (opts?.role === "admin") role = "admin";
  else if (opts?.role === "traffer") role = "traffer";  // only explicit admin tooling
  else if (opts?.role === "client") role = "subscriber";

  let referrerId: string | undefined;
  if (opts?.referrerId) {
    const ref = await prisma.botUser.findFirst({
      where: {
        OR: [{ id: opts.referrerId }, { telegramId: opts.referrerId }],
      },
    });
    if (ref && ref.telegramId !== telegramId) referrerId = ref.id;
  }

  return prisma.botUser.create({
    data: {
      telegramId,
      username,
      firstName,
      role,
      referrerId,
    },
  });
}

export async function findBotUserByTelegramId(telegramId: string) {
  return prisma.botUser.findUnique({ where: { telegramId } });
}

export async function resolveProductShort(short: string) {
  const all = await prisma.botProduct.findMany();
  return all.find((p) => p.id.startsWith(short));
}

export async function resolveLeadShort(short: string) {
  const all = await prisma.botLead.findMany({
    where: { status: "new" },
    take: 200,
    orderBy: { createdAt: "desc" },
  });
  return all.find((l) => l.id.startsWith(short));
}

export async function resolveWithdrawalShort(short: string) {
  const all = await prisma.withdrawal.findMany({
    where: { status: { in: ["new", "approved"] } },
    take: 200,
    orderBy: { createdAt: "desc" },
  });
  return all.find((w) => w.id.startsWith(short));
}

export async function resolveUserShort(short: string) {
  const all = await prisma.botUser.findMany({
    take: 500,
    orderBy: { createdAt: "desc" },
  });
  return all.find((u) => u.id.startsWith(short));
}

/** Bump to force a one-shot re-apply of catalog 10/45/45 on warm instances. */
const CATALOG_SYNC_VERSION = 5;
let productsEnsuredVersion = 0;

export async function ensureBotProducts(): Promise<void> {
  if (productsEnsuredVersion === CATALOG_SYNC_VERSION) return;
  try {
    const catalog = catalogEntries();

    // Legacy rows without a bank — keep for lead history, hide from feeds
    await prisma.botProduct.updateMany({
      where: { bank: "" },
      data: { isActive: false },
    });

    for (const entry of catalog) {
      const existing = await prisma.botProduct.findFirst({
        where: { title: entry.title, bank: entry.bank },
      });
      if (existing) {
        // Always re-apply catalog split (10% traffer / 45% subscriber).
        // Fixes stuck products like «Депозит для бизнеса» that never left legacy prices.
        await prisma.botProduct.update({
          where: { id: existing.id },
          data: {
            description: existing.description || entry.description,
            rewardType: "fixed",
            isActive: true,
            reward: entry.reward,
            subscriberPrice: entry.subscriberPrice,
          },
        });
      } else {
        await prisma.botProduct.create({
          data: {
            title: entry.title,
            bank: entry.bank,
            description: entry.description,
            reward: entry.reward,
            subscriberPrice: entry.subscriberPrice,
            rewardType: "fixed",
            url: "",
            isActive: true,
          },
        });
      }
    }

    productsEnsuredVersion = CATALOG_SYNC_VERSION;
  } catch (e) {
    productsEnsuredVersion = 0;
    throw e;
  }
}

export function formatMoney(n: number): string {
  return `${Math.round(n).toLocaleString("ru-RU")} ₽`;
}

export function isHotProduct(p: {
  isHot: boolean;
  hotUntil: Date | null;
}): boolean {
  if (!p.isHot) return false;
  if (!p.hotUntil) return true;
  return p.hotUntil.getTime() > Date.now();
}

export function refLinkFor(telegramId: string): string {
  const bot =
    process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "").trim() ||
    "rko_referal_bot";
  return `https://t.me/${bot}?start=ref_${telegramId}`;
}


export function trafferInviteCode(telegramId: string) {
  return `t${telegramId.slice(-8)}`;
}

export async function findTrafferByInvite(
  inviteLink?: string | null,
  inviteName?: string | null
) {
  const name = inviteName?.trim() || null;
  const url = inviteLink?.trim() || null;
  if (name) {
    const byName = await prisma.botUser.findFirst({
      where: {
        role: "traffer",
        OR: [
          { inviteLinkName: name },
          { telegramId: { endsWith: name.replace(/^t/, "") } },
        ],
      },
    });
    if (byName) return byName;
    if (name.startsWith("t") && name.length >= 5) {
      const tail = name.slice(1);
      const byTail = await prisma.botUser.findFirst({
        where: { role: "traffer", telegramId: { endsWith: tail } },
      });
      if (byTail) return byTail;
    }
  }
  if (url) {
    return prisma.botUser.findFirst({
      where: { role: "traffer", inviteLink: url },
    });
  }
  return null;
}
