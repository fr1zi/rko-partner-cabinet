import crypto from "crypto";
import { isChannelAdmin } from "@/lib/bot/channelAdmins";

export type TelegramWebAppUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
};

export type ValidatedInitData = {
  user: TelegramWebAppUser;
  authDate: number;
  queryId?: string;
  raw: Record<string, string>;
};

const MAX_AGE_SEC = 60 * 60 * 24; // 24h

/**
 * Validate Telegram Mini App initData (HMAC-SHA256).
 * secret_key = HMAC_SHA256(key="WebAppData", message=bot_token)
 */
export function validateInitData(
  initData: string,
  botToken?: string | null
): ValidatedInitData | { error: string } {
  const token = (botToken ?? process.env.TELEGRAM_BOT_TOKEN)?.trim();
  if (!token) {
    return { error: "бот не подключен (нет TELEGRAM_BOT_TOKEN)" };
  }
  if (!initData || typeof initData !== "string") {
    return { error: "нет initData" };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    return { error: "нет hash" };
  }

  const pairs: string[] = [];
  const raw: Record<string, string> = {};
  params.forEach((value, key) => {
    if (key === "hash") return;
    pairs.push(`${key}=${value}`);
    raw[key] = value;
  });
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(token)
    .digest();
  const calculated = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const a = Buffer.from(calculated, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { error: "неверная подпись initData" };
  }

  const authDate = Number(raw.auth_date || 0);
  if (!authDate || Number.isNaN(authDate)) {
    return { error: "нет auth_date" };
  }
  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > MAX_AGE_SEC) {
    return { error: "initData устарел (более 24ч)" };
  }

  let user: TelegramWebAppUser | null = null;
  try {
    user = JSON.parse(raw.user || "null") as TelegramWebAppUser | null;
  } catch {
    return { error: "некорректный user в initData" };
  }
  if (!user || typeof user.id !== "number") {
    return { error: "нет user.id в initData" };
  }

  return {
    user,
    authDate,
    queryId: raw.query_id,
    raw,
  };
}

/** Admin = channel administrator (cached). Not env ID lists. */
export async function isTelegramAdmin(telegramId: string): Promise<boolean> {
  return isChannelAdmin(telegramId);
}
