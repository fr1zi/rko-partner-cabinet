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

function buildHotText(
  product: HotProductLike,
  audience: "subscriber" | "traffer"
): string {
  const title = escapeTgHtml(product.title || "Предложение");
  const bank = String(product.bank || "").trim();
  const hot = escapeTgHtml(product.hotText || "HOT");
  const desc = String(product.description || "").trim();
  const sub = Number(product.subscriberPrice || 0);
  const prem = Number(product.reward || 0);
  const placeLabel = isKnownBank(bank) ? "Банк" : "Категория";
  const place = bank ? escapeTgHtml(bank) : "";

  const moneyLine =
    audience === "subscriber"
      ? sub > 0
        ? `Выплата: <b>${formatMoney(sub)}</b>`
        : ""
      : prem > 0
        ? `Премия: <b>${formatMoney(prem)}</b>`
        : "";

  return [
    `🔥 <b>Горящее предложение</b> · ${hot}`,
    "",
    `<b>${title}</b>`,
    place ? `${placeLabel}: ${place}` : "",
    desc ? escapeTgHtml(desc) : "",
    "",
    moneyLine,
    "",
    "Открывай кабинет и забирай, пока горит.",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/**
 * Broadcast HOT for any product — bank partners and «Другое» alike.
 * Subscribers get «Выплата», traffers get «Премия» (never both in one message).
 */
export async function broadcastHotOffer(
  product: HotProductLike
): Promise<{ sent: number; failed: number }> {
  const textSub = buildHotText(product, "subscriber");
  const textTraf = buildHotText(product, "traffer");
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
    select: { telegramId: true, role: true },
  });

  let sent = 0;
  let failed = 0;
  for (const u of users) {
    const role = (u.role || "").toLowerCase();
    const text =
      role === "traffer" ? textTraf : textSub; // client/subscriber → выплата
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
