import { tgApi, getTelegramChannelId } from "@/lib/telegram";

type ChatMember = {
  status: string;
  user: { id: number; is_bot?: boolean; username?: string };
};

type Cache = { ids: Set<string>; fetchedAt: number };
let cache: Cache | null = null;
const TTL_MS = 60_000;

export async function getChannelAdminTelegramIds(
  force = false
): Promise<Set<string>> {
  if (!force && cache && Date.now() - cache.fetchedAt < TTL_MS) {
    return cache.ids;
  }
  const chatId = getTelegramChannelId();
  if (!chatId) {
    cache = { ids: new Set(), fetchedAt: Date.now() };
    return cache.ids;
  }
  const data = await tgApi<ChatMember[]>("getChatAdministrators", {
    chat_id: chatId,
  });
  const ids = new Set<string>();
  if (data.ok && Array.isArray(data.result)) {
    for (const m of data.result) {
      if (!m?.user || m.user.is_bot) continue;
      if (m.status === "administrator" || m.status === "creator") {
        ids.add(String(m.user.id));
      }
    }
  }
  cache = { ids, fetchedAt: Date.now() };
  return ids;
}

export async function isChannelAdmin(telegramId: string): Promise<boolean> {
  const ids = await getChannelAdminTelegramIds();
  return ids.has(String(telegramId));
}

export function clearChannelAdminCache() {
  cache = null;
}

/** Channel membership via getChatMember. left/kicked → not a member. */
export async function getChannelMemberStatus(
  telegramId: string
): Promise<string | null> {
  const chatId = getTelegramChannelId();
  if (!chatId) return null;
  const data = await tgApi<ChatMember>("getChatMember", {
    chat_id: chatId,
    user_id: Number(telegramId),
  });
  if (!data.ok || !data.result) return null;
  return data.result.status || null;
}

export function isChannelMemberStatus(status: string | null): boolean {
  return (
    status === "member" ||
    status === "restricted" ||
    status === "administrator" ||
    status === "creator"
  );
}

type CountCache = { count: number; fetchedAt: number };
let memberCountCache: CountCache | null = null;

/** Total members in the channel (Telegram getChatMemberCount). */
export async function getChannelSubscriberCount(
  force = false
): Promise<number | null> {
  if (
    !force &&
    memberCountCache &&
    Date.now() - memberCountCache.fetchedAt < TTL_MS
  ) {
    return memberCountCache.count;
  }
  const chatId = getTelegramChannelId();
  if (!chatId) return null;
  const data = await tgApi<number>("getChatMemberCount", { chat_id: chatId });
  if (!data.ok || typeof data.result !== "number") return null;
  memberCountCache = { count: data.result, fetchedAt: Date.now() };
  return data.result;
}

export type ChannelAudienceStats = {
  total: number;
  /** Humans who are not channel admins/creator (approx. regular subscribers). */
  subscribers: number;
  adminsHuman: number;
  bots: number;
};

export async function getChannelAudienceStats(
  force = false
): Promise<ChannelAudienceStats | null> {
  const chatId = getTelegramChannelId();
  if (!chatId) return null;

  const [countData, adminData] = await Promise.all([
    tgApi<number>("getChatMemberCount", { chat_id: chatId }),
    tgApi<ChatMember[]>("getChatAdministrators", { chat_id: chatId }),
  ]);
  if (!countData.ok || typeof countData.result !== "number") return null;
  const total = countData.result;
  let adminsHuman = 0;
  let bots = 0;
  if (adminData.ok && Array.isArray(adminData.result)) {
    for (const m of adminData.result) {
      if (!m?.user) continue;
      if (m.user.is_bot) bots += 1;
      else if (m.status === "administrator" || m.status === "creator") {
        adminsHuman += 1;
      }
    }
  }
  const subscribers = Math.max(0, total - adminsHuman - bots);
  if (force || !memberCountCache) {
    memberCountCache = { count: total, fetchedAt: Date.now() };
  } else {
    memberCountCache = { count: total, fetchedAt: Date.now() };
  }
  return { total, subscribers, adminsHuman, bots };
}
