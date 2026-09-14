import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/bot/users";
import { sendMessage, getMiniAppUrl } from "@/lib/telegram";
import { escapeTgHtml } from "@/lib/bot/orders";
import { isKnownBank } from "@/lib/banks";

export type HotProductLike = {
  id: string;
  title: string;
  bank?: string | null;
  description?: string | null;
  subscriberPrice?: number | null;
  reward?: number | null;
  hotText?: string | null;
  isHot?: boolean;
  isActive?: boolean;
};

/**
 * Broadcast HOT for any product — bank partners and «Другое» offers alike.
 * Sent to all non-banned subscribers + traffers.
 */
export async function broadcastHotOffer(
  product: HotProductLike
): Promise<{ sent: number; failed: number }> {
  const title = escapeTgHtml(product.title || "Предложение");
  const bank = String(product.bank || "").trim();
  const hot = escapeTgHtml(product.hotText || "HOT");
  const desc = String(product.description || "").trim();
  const sub = Number(product.subscriberPrice || 0);
  const prem = Number(product.reward || 0);
  const placeLabel = isKnownBank(bank) ? "Банк" : "Категория";
  const place = bank ? escapeTgHtml(bank) : "";

  const lines = [
    `🔥 <b>Горящее предложение</b> · ${hot}`,
    "",
    `<b>${title}</b>`,
    place ? `${placeLabel}: ${place}` : "",
    desc ? escapeTgHtml(desc) : "",
    "",
    sub > 0 ? `Подписчику: <b>${formatMoney(sub)}</b>` : "",
    prem > 0 ? `Трафферу: <b>${formatMoney(prem)}</b>` : "",
    "",
    "Открывай кабинет и забирай, пока горит.",
  ].filter((l) => l !== "");

  const text = lines.join("\n");
  const url = getMiniAppUrl();
  const extra = url
    ? {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔥 Открыть кабинет", web_app: { url } }],
          ],
        },
      }
    : undefined;

  const users = await prisma.botUser.findMany({
    where: {
      isBanned: false,
      role: { in: ["client", "subscriber", "traffer"] },
    },
    select: { telegramId: true },
  });

  let sent = 0;
  let failed = 0;
  for (const u of users) {
    try {
      const res = await sendMessage(u.telegramId, text, extra);
      if (res.ok) sent++;
      else failed++;
    } catch {
      failed++;
    }
    if ((sent + failed) % 25 === 0) {
      await new Promise((r) => setTimeout(r, 350));
    }
  }
  return { sent, failed };
}
