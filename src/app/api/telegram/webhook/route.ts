import { NextRequest, NextResponse } from "next/server";
import { handleUpdate } from "@/lib/bot/handleUpdate";
import { ensureBotUx } from "@/lib/telegram";

/**
 * Telegram Bot webhook / long-poll target.
 * - Mini App primary: /start → web_app «Открыть кабинет»
 * - callback_query + FSM inline menus as fallback
 * - chat_member → Subscriber attribution
 * - Admin = channel administrators (getChatAdministrators)
 */
export async function POST(req: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "бот не подключен (нет TELEGRAM_BOT_TOKEN)" },
      { status: 503 }
    );
  }

  void ensureBotUx();

  let update: unknown;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  try {
    const result = await handleUpdate(update as Parameters<typeof handleUpdate>[0]);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("telegram webhook error", e);
    return NextResponse.json({ ok: false, error: "server error" }, { status: 500 });
  }
}

export async function GET() {
  const configured = Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
  const username = process.env.TELEGRAM_BOT_USERNAME || null;
  const channelId = process.env.TELEGRAM_CHANNEL_ID || null;
  return NextResponse.json({
    ok: true,
    botConfigured: configured,
    botUsername: username,
    channelId,
    miniAppPath: "/tg",
    message: configured
      ? "Webhook готов. /start шлёт Mini App + fallback меню. Admin = админы канала. allowed_updates=[message,callback_query,chat_member]."
      : "бот не подключен",
  });
}
