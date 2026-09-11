/** Loose validation: empty OK; otherwise must look like a Telegram link. */
export function isValidTelegramChannelUrl(url: string | null | undefined): boolean {
  if (url == null || url.trim() === "") return true;
  return /t\.me|telegram\.me/i.test(url.trim());
}

export function normalizeTelegramUsername(value: string | null | undefined): string | null {
  if (value == null || value.trim() === "") return null;
  const v = value.trim().replace(/^@+/, "");
  return v ? `@${v}` : null;
}

export function getBotDeepLink(refCode: string): string | null {
  const username = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "").trim();
  if (!username) return null;
  return `https://t.me/${username}?start=${encodeURIComponent(refCode)}`;
}

export function isBotConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
}

export function getBotUsername(): string | null {
  const u = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "").trim();
  return u || null;
}

export function getTelegramChannelId(): string | null {
  const id = process.env.TELEGRAM_CHANNEL_ID?.trim();
  return id || null;
}

export function getChannelPublicUrl(): string {
  return (
    process.env.TELEGRAM_CHANNEL_PUBLIC_URL?.trim() ||
    "https://t.me/w1nstr1k3"
  );
}

/** Token + channel id present — can create named invite links. */
export function isChannelInviteConfigured(): boolean {
  return isBotConfigured() && Boolean(getTelegramChannelId());
}

type TgApiResult<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

type ChatInviteLink = {
  invite_link: string;
  name?: string;
  creator?: { id: number };
  creates_join_request?: boolean;
  is_primary?: boolean;
  is_revoked?: boolean;
};

export async function tgApi<T>(
  method: string,
  body: Record<string, unknown>
): Promise<TgApiResult<T>> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    return { ok: false, description: "бот не подключен (нет TELEGRAM_BOT_TOKEN)" };
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as TgApiResult<T>;
}

/**
 * Create a named invite link for the configured channel.
 * `name` should be the partner refCode (max 32 chars).
 */
export async function createNamedInviteLink(
  name: string
): Promise<{ inviteLink: string; name: string } | { error: string }> {
  const chatId = getTelegramChannelId();
  if (!isBotConfigured()) {
    return { error: "бот не подключен (нет TELEGRAM_BOT_TOKEN)" };
  }
  if (!chatId) {
    return { error: "не задан TELEGRAM_CHANNEL_ID" };
  }
  const linkName = name.trim().slice(0, 32);
  if (!linkName) {
    return { error: "пустое имя invite-ссылки" };
  }

  const data = await tgApi<ChatInviteLink>("createChatInviteLink", {
    chat_id: chatId,
    name: linkName,
    creates_join_request: false,
  });

  if (!data.ok || !data.result?.invite_link) {
    return {
      error: data.description || "не удалось создать invite-ссылку",
    };
  }

  return {
    inviteLink: data.result.invite_link,
    name: data.result.name || linkName,
  };
}

/** Match partner by invite link name (refCode) or full URL. */
export function matchInviteToPartnerFields(
  inviteLink?: string | null,
  inviteName?: string | null
): { byName: string | null; byUrl: string | null } {
  return {
    byName: inviteName?.trim() || null,
    byUrl: inviteLink?.trim() || null,
  };
}

function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
    /\/$/,
    ""
  );
}

export function getMiniAppUrl(): string {
  return `${getAppUrl()}/tg`;
}

export function isHttpsMiniApp(): boolean {
  const url = getMiniAppUrl();
  return url.startsWith("https://") && !url.includes("localhost");
}

export function miniAppWebAppButton(): {
  text: string;
  web_app: { url: string };
} | null {
  if (!isHttpsMiniApp()) return null;
  return { text: "📱 Открыть кабинет", web_app: { url: getMiniAppUrl() } };
}

export function miniAppLinkButton(): { text: string; url: string } | null {
  if (!isHttpsMiniApp()) return null;
  return { text: "📱 Открыть кабинет", url: getMiniAppUrl() };
}

function stripWebAppButtons(extra?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!extra?.reply_markup || typeof extra.reply_markup !== "object") return extra;
  const markup = extra.reply_markup as {
    inline_keyboard?: Array<Array<Record<string, unknown>>>;
    keyboard?: unknown;
  };
  if (!markup.inline_keyboard) return extra;
  const rows = markup.inline_keyboard
    .map((row) =>
      row
        .map((btn) => {
          if (!btn.web_app) return btn;
          const url =
            typeof btn.web_app === "object" && btn.web_app && "url" in btn.web_app
              ? String((btn.web_app as { url?: string }).url || "")
              : "";
          if (!url) return null;
          const next = { ...btn };
          delete next.web_app;
          next.url = url;
          return next;
        })
        .filter(Boolean) as Array<Record<string, unknown>>
    )
    .filter((row) => row.length > 0);
  return { ...extra, reply_markup: { ...markup, inline_keyboard: rows } };
}

export async function sendMessage(
  chatId: number | string,
  text: string,
  extra?: Record<string, unknown>
): Promise<TgApiResult<unknown>> {
  const attempts: Array<Record<string, unknown>> = [
    { chat_id: chatId, text, parse_mode: "HTML", ...(extra || {}) },
    { chat_id: chatId, text, ...(extra || {}) },
    { chat_id: chatId, text, parse_mode: "HTML", ...(stripWebAppButtons(extra) || {}) },
    { chat_id: chatId, text, parse_mode: "HTML" },
    { chat_id: chatId, text },
  ];
  let last: TgApiResult<unknown> = { ok: false };
  for (const body of attempts) {
    last = await tgApi("sendMessage", body);
    if (last.ok) return last;
    console.error("sendMessage failed:", last.description);
  }
  return last;
}

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  extra?: Record<string, unknown>
): Promise<TgApiResult<unknown>> {
  return sendMessage(chatId, text, extra);
}

export async function editMessage(
  chatId: number | string,
  messageId: number,
  text: string,
  extra?: Record<string, unknown>
): Promise<TgApiResult<unknown>> {
  const withWeb = extra || {};
  const res = await tgApi("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    ...withWeb,
  });
  if (res.ok) return res;
  const stripped = stripWebAppButtons(extra) || extra || {};
  return tgApi("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    ...stripped,
  });
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
  showAlert = false
): Promise<TgApiResult<unknown>> {
  return tgApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text, show_alert: showAlert } : {}),
  });
}

export async function sendToAdmins(
  text: string,
  extra?: Record<string, unknown>
): Promise<void> {
  const { getChannelAdminTelegramIds } = await import("@/lib/bot/channelAdmins");
  const { prisma } = await import("@/lib/prisma");
  const channelIds = await getChannelAdminTelegramIds();
  const dbAdmins = await prisma.botUser.findMany({
    where: { role: "admin", isBanned: false },
    select: { telegramId: true },
  });
  const ids = Array.from(
    new Set<string>([
      ...Array.from(channelIds),
      ...dbAdmins.map((a: { telegramId: string }) => a.telegramId),
    ])
  );
  for (const id of Array.from(ids)) {
    try {
      await sendMessage(id, text, extra);
    } catch {
      /* ignore per-admin failures */
    }
  }
}

/** Leftover Mini App helper — do not call from webhook. */
export async function sendCabinetButton(
  chatId: number | string,
  text = "Кабинет РКО"
): Promise<TgApiResult<unknown>> {
  const url = getMiniAppUrl();
  return sendMessage(chatId, text, {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Открыть кабинет",
            web_app: { url },
          },
        ],
      ],
    },
  });
}

export async function setChatMenuButtonWebApp(): Promise<TgApiResult<unknown>> {
  const url = getMiniAppUrl();
  if (!isHttpsMiniApp()) {
    return tgApi("setChatMenuButton", {
      menu_button: { type: "commands" },
    });
  }
  return tgApi("setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: "Кабинет",
      web_app: { url },
    },
  });
}

const USER_COMMANDS = [
  { command: "start", description: "Открыть меню" },
];
const ADMIN_COMMANDS = [
  { command: "start", description: "Открыть меню" },
  { command: "admin", description: "Админ-панель" },
];

export async function setBotCommands(): Promise<TgApiResult<unknown>> {
  // No /admin in global lists. Admins get it per-chat in setCommandsForUser.
  await tgApi("setMyCommands", {
    commands: USER_COMMANDS,
    scope: { type: "default" },
  });
  return tgApi("setMyCommands", {
    commands: USER_COMMANDS,
    scope: { type: "all_private_chats" },
  });
}

export async function setCommandsForUser(
  telegramId: string,
  isAdmin: boolean
): Promise<TgApiResult<unknown>> {
  return tgApi("setMyCommands", {
    commands: isAdmin ? ADMIN_COMMANDS : USER_COMMANDS,
    scope: { type: "chat", chat_id: Number(telegramId) },
  });
}

export async function syncAdminChatCommands(): Promise<void> {
  const { getChannelAdminTelegramIds } = await import("@/lib/bot/channelAdmins");
  const ids = await getChannelAdminTelegramIds(true);
  for (const id of Array.from(ids)) {
    await setCommandsForUser(id, true);
  }
}

let botUxBootstrapped = false;

/** Commands + menu button (web_app) when HTTPS. Safe to call from webhook. */
export async function ensureBotUx(): Promise<void> {
  if (botUxBootstrapped || !isBotConfigured()) return;
  botUxBootstrapped = true;
  try {
    await setBotCommands();
    await setChatMenuButtonWebApp();
    await syncAdminChatCommands();
    const { ensureAdminInviteLink } = await import("@/lib/bot/adminInvite");
    await ensureAdminInviteLink();
  } catch (e) {
    console.error("ensureBotUx failed", e);
  }
}
