import { prisma } from "@/lib/prisma";
import {
  sendMessage,
  sendToAdmins,
  getChannelPublicUrl,
  editMessage,
  miniAppWebAppButton,
} from "@/lib/telegram";
import { clearScene, setScene, parsePayload, getSession } from "@/lib/bot/session";
import {
  clientMenu,
  backButton,
  PAGE_SIZE,
  paginateRow,
  shortId,
} from "@/lib/bot/keyboards";
import {
  ensureBotProducts,
  formatMoney,
  isHotProduct,
  resolveProductShort,
  upsertBotUser,
  type TgFrom,
} from "@/lib/bot/users";

export async function showClientGreeting(
  chatId: number | string,
  from: TgFrom,
  editMsgId?: number
) {
  await ensureBotProducts();
  const channel = getChannelPublicUrl();
  const text =
    "👋 Добро пожаловать!\n\n" +
    "Канал для ИП и юрлиц по РКО и банковским продуктам.\n" +
    "Открой кабинет кнопкой «Кабинет» — Mini App. В канале можно оформить продукт.";
  const app = miniAppWebAppButton();
  const keyboard = {
    inline_keyboard: [
      ...(app ? [[app]] : []),
      ...clientMenu(channel).inline_keyboard,
    ],
  };
  if (editMsgId) {
    await editMessage(chatId, editMsgId, text, { reply_markup: keyboard });
  } else {
    await sendMessage(chatId, text, { reply_markup: keyboard });
  }
}

export async function showClientProducts(
  chatId: number | string,
  messageId: number | undefined,
  page: number
) {
  await ensureBotProducts();
  const products = await prisma.botProduct.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });
  const sorted = [...products].sort((a, b) => {
    const ah = isHotProduct(a) ? 1 : 0;
    const bh = isHotProduct(b) ? 1 : 0;
    return bh - ah;
  });
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const p = Math.min(Math.max(0, page), totalPages - 1);
  const slice = sorted.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE);
  const lines = slice.map((pr) => {
    const hot = isHotProduct(pr)
      ? `🔥 ${pr.hotText || "горящее"} · `
      : "";
    return `• ${hot}<b>${pr.title}</b>${pr.bank ? ` (${pr.bank})` : ""} — ${formatMoney(pr.subscriberPrice)}`;
  });
  const text =
    "🛍 <b>Продукты</b>\n\n" +
    (lines.length ? lines.join("\n") : "Пока нет активных продуктов.") +
    "\n\nНажмите «Оформил продукт», чтобы оставить заявку.";
  const keyboard = {
    inline_keyboard: [
      ...slice.map((pr) => [
        {
          text: `${isHotProduct(pr) ? "🔥 " : ""}${pr.title}`,
          callback_data: `c:pick:${shortId(pr.id)}`,
        },
      ]),
      paginateRow(p, totalPages, "c:prod"),
      [backButton("c:home")],
    ],
  };
  if (messageId) {
    await editMessage(chatId, messageId, text, { reply_markup: keyboard });
  } else {
    await sendMessage(chatId, text, { reply_markup: keyboard });
  }
}

export async function startLeadFsm(chatId: number | string, telegramId: string) {
  await ensureBotProducts();
  const products = await prisma.botProduct.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (!products.length) {
    await sendMessage(chatId, "Нет активных продуктов. Попробуйте позже.");
    return;
  }
  await setScene(telegramId, "c_pick_product", {});
  const keyboard = {
    inline_keyboard: [
      ...products.slice(0, 10).map((pr) => [
        {
          text: `${isHotProduct(pr) ? "🔥 " : ""}${pr.title}`,
          callback_data: `c:pick:${shortId(pr.id)}`,
        },
      ]),
      [backButton("c:home")],
    ],
  };
  await sendMessage(chatId, "Выберите продукт:", { reply_markup: keyboard });
}

export async function onClientPickProduct(
  chatId: number | string,
  telegramId: string,
  short: string
) {
  const product = await resolveProductShort(short);
  if (!product) {
    await sendMessage(chatId, "Продукт не найден.");
    return;
  }
  await setScene(telegramId, "c_fullname", { productId: product.id });
  const titleLower = product.title.toLowerCase();
  const needsAge =
    titleLower.includes("рко") ||
    titleLower.includes("ип") ||
    titleLower.includes("кредит");
  const fioHint = needsAge
    ? "Введите ФИО (для заявки, 18+):"
    : "Введите ФИО:";
  await sendMessage(
    chatId,
    `Продукт: <b>${product.title}</b>\n\n${fioHint}`
  );
}

export async function handleClientText(
  chatId: number | string,
  from: TgFrom,
  text: string
): Promise<boolean> {
  const telegramId = String(from.id);
  const sess = await getSession(telegramId);
  if (sess.scene === "idle") return false;
  const payload = parsePayload(sess.payload);

  if (sess.scene === "c_fullname") {
    const fullName = text.trim();
    if (fullName.length < 3) {
      await sendMessage(chatId, "Укажите полное ФИО (минимум 3 символа).");
      return true;
    }
    await setScene(telegramId, "c_phone", { ...payload, fullName });
    await sendMessage(chatId, "Введите телефон (например +79001234567):");
    return true;
  }

  if (sess.scene === "c_phone") {
    const phone = text.trim();
    if (phone.length < 6) {
      await sendMessage(chatId, "Укажите корректный телефон.");
      return true;
    }
    const productId = String(payload.productId || "");
    const fullName = String(payload.fullName || "");
    await clearScene(telegramId);
    await createLead(chatId, from, productId, fullName, phone);
    return true;
  }

  return false;
}

async function createLead(
  chatId: number | string,
  from: TgFrom,
  productId: string,
  fullName: string,
  phone: string
) {
  const client = await upsertBotUser(from, { role: "subscriber", forceAdminCheck: true });
  if (client.isBanned) {
    await sendMessage(chatId, "доступ закрыт");
    return;
  }
  const product = await prisma.botProduct.findUnique({ where: { id: productId } });
  if (!product || !product.isActive) {
    await sendMessage(chatId, "Продукт недоступен.");
    return;
  }

  const existing = await prisma.botLead.findFirst({
    where: {
      clientId: client.id,
      productId,
      status: { not: "rejected" },
    },
  });

  let status = "new";
  if (existing) status = "duplicate";

  const lead = await prisma.botLead.create({
    data: {
      clientId: client.id,
      referrerId: client.referrerId,
      productId,
      fullName,
      phone,
      status,
    },
  });

  if (status === "duplicate") {
    await sendMessage(
      chatId,
      "Заявка уже была по этому продукту — отмечена как дубль. Повторная оплата не начисляется."
    );
  } else {
    await sendMessage(
      chatId,
      "✅ Заявка принята. Менеджер свяжется с вами. Спасибо!"
    );
  }

  const uname = client.username || client.telegramId;
  await sendToAdmins(
    `📥 Новая заявка (${status})\n` +
      `Клиент: ${fullName} (${uname})\n` +
      `Тел: ${phone}\n` +
      `Продукт: ${product.title}\n` +
      `ID: ${lead.id}`
  );

  if (client.referrerId) {
    const ref = await prisma.botUser.findUnique({
      where: { id: client.referrerId },
    });
    if (ref) {
      await sendMessage(
        ref.telegramId,
        `🔔 Новая заявка от реферала ${uname}: ${product.title} (${status})`
      );
    }
  }

  await showClientGreeting(chatId, from);
}
