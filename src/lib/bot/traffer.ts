import { prisma } from "@/lib/prisma";
import { sendMessage, editMessage, miniAppWebAppButton } from "@/lib/telegram";
import {
  backButton,
  PAGE_SIZE,
  paginateRow,
} from "@/lib/bot/keyboards";
import { clearScene, setScene, parsePayload, getSession } from "@/lib/bot/session";
import {
  ensureBotProducts,
  formatMoney,
  isHotProduct,
  refLinkFor,
  type TgFrom,
} from "@/lib/bot/users";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function cabinetWebAppKeyboard() {
  const rows: Array<Array<Record<string, unknown>>> = [];
  const app = miniAppWebAppButton();
  if (app) rows.push([app]);
  rows.push([{ text: "🔗 Моя реф-ссылка", callback_data: "t:ref" }]);
  rows.push([{ text: "📊 Статистика", callback_data: "t:st" }]);
  rows.push([{ text: "💰 Баланс и выплаты", callback_data: "t:bal" }]);
  rows.push([{ text: "💰 Премии", callback_data: "t:pr:0" }]);
  rows.push([{ text: "📈 Мои рефералы", callback_data: "t:ls:0" }]);
  return { inline_keyboard: rows };
}

export async function showTrafferHome(
  chatId: number | string,
  user: { telegramId: string; firstName: string | null; isBanned: boolean },
  editMsgId?: number
) {
  if (user.isBanned) {
    await sendMessage(chatId, "доступ закрыт");
    return;
  }
  const text =
    `👋 <b>${esc(user.firstName || "Траффер")}</b>, кабинет РКО\n\n` +
      "Открой Mini App кнопкой «Кабинет» или «Открыть кабинет».";
  const markup = { reply_markup: cabinetWebAppKeyboard() };
  if (editMsgId) {
    const edited = await editMessage(chatId, editMsgId, text, markup);
    if (edited.ok) return;
  }
  await sendMessage(chatId, text, markup);
}

export async function showRefLink(
  chatId: number | string,
  telegramId: string,
  messageId?: number
) {
  const link = refLinkFor(telegramId);
  const text =
    `🔗 <b>Ваша реф-ссылка</b>\n\n<code>${link}</code>\n\n` +
    "Делитесь с ИП и ООО. Переходы и заявки учитываются в статистике.";
  const keyboard = {
    inline_keyboard: [
      [{ text: "📤 Поделиться", switch_inline_query: link }],
      ...(miniAppWebAppButton() ? [[miniAppWebAppButton() as { text: string; web_app: { url: string } }]] : []),
      [backButton("t:back")],
    ],
  };
  if (messageId) {
    await editMessage(chatId, messageId, text, { reply_markup: keyboard });
  } else {
    await sendMessage(chatId, text, { reply_markup: keyboard });
  }
}

export async function showStats(
  chatId: number | string,
  botUserId: string,
  telegramId: string,
  messageId?: number
) {
  const clicks = await prisma.referralClick.count({
    where: { referrerId: botUserId },
  });
  const regs = await prisma.botUser.count({ where: { referrerId: botUserId } });
  const leads = await prisma.botLead.findMany({ where: { referrerId: botUserId } });
  const approved = leads.filter((l) => l.status === "approved").length;
  const rejected = leads.filter((l) => l.status === "rejected").length;
  const sumAgg = await prisma.ledgerTx.aggregate({
    where: { userId: botUserId, type: "credit_lead" },
    _sum: { amount: true },
  });
  const text =
    `📊 <b>Статистика</b>\n\n` +
    `Клики: <b>${clicks}</b>\n` +
    `Регистрации: <b>${regs}</b>\n` +
    `Заявки: <b>${leads.length}</b>\n` +
    `Одобрено: <b>${approved}</b>\n` +
    `Отклонено: <b>${rejected}</b>\n` +
    `Начислено: <b>${formatMoney(sumAgg._sum.amount || 0)}</b>`;
  const keyboard = {
    inline_keyboard: [
      ...(miniAppWebAppButton() ? [[miniAppWebAppButton() as { text: string; web_app: { url: string } }]] : []),
      [backButton("t:back")],
    ],
  };
  if (messageId) {
    await editMessage(chatId, messageId, text, { reply_markup: keyboard });
  } else {
    await sendMessage(chatId, text, { reply_markup: keyboard });
  }
}

export async function showBalance(
  chatId: number | string,
  user: { id: string; balance: number; telegramId: string },
  messageId?: number
) {
  const wds = await prisma.withdrawal.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  const txs = await prisma.ledgerTx.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  const wdLines = wds
    .map(
      (w) =>
        `• ${formatMoney(w.amount)} — ${w.status} (${w.createdAt.toLocaleDateString("ru-RU")})`
    )
    .join("\n");
  const txLines = txs
    .map((t) => `• ${t.type}: ${formatMoney(t.amount)}`)
    .join("\n");
  const text =
    `💰 <b>Баланс:</b> ${formatMoney(user.balance)}\n\n` +
    `<b>Выводы:</b>\n${wdLines || "—"}\n\n` +
    `<b>Последние операции:</b>\n${txLines || "—"}`;
  const keyboard = {
    inline_keyboard: [
      [{ text: "💸 Запросить вывод", callback_data: "t:wd" }],
      ...(miniAppWebAppButton() ? [[miniAppWebAppButton() as { text: string; web_app: { url: string } }]] : []),
      [backButton("t:back")],
    ],
  };
  if (messageId) {
    await editMessage(chatId, messageId, text, { reply_markup: keyboard });
  } else {
    await sendMessage(chatId, text, { reply_markup: keyboard });
  }
}

export async function showProducts(
  chatId: number | string,
  page: number,
  messageId?: number
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
    const hot = isHotProduct(pr) ? `🔥 ${pr.hotText || ""} ` : "";
    return `• ${hot}<b>${pr.title}</b> — премия ${formatMoney(pr.reward)}`;
  });
  const text = `🛍 <b>Премии за открытие</b>\n\n${lines.join("\n") || "Пусто"}`;
  const keyboard = {
    inline_keyboard: [
      paginateRow(p, totalPages, "t:pr"),
      [backButton("t:back")],
    ],
  };
  if (messageId) {
    await editMessage(chatId, messageId, text, { reply_markup: keyboard });
  } else {
    await sendMessage(chatId, text, { reply_markup: keyboard });
  }
}

export async function showReferrals(
  chatId: number | string,
  botUserId: string,
  page: number,
  messageId?: number
) {
  const refs = await prisma.botUser.findMany({
    where: { referrerId: botUserId },
    orderBy: { createdAt: "desc" },
  });
  const totalPages = Math.max(1, Math.ceil(refs.length / PAGE_SIZE));
  const p = Math.min(Math.max(0, page), totalPages - 1);
  const slice = refs.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE);
  const lines: string[] = [];
  for (const r of slice) {
    const leads = await prisma.botLead.findMany({
      where: { clientId: r.id },
      select: { status: true },
    });
    let st = "нет заявок";
    if (leads.some((l) => l.status === "approved")) st = "есть одобренная";
    else if (leads.some((l) => l.status === "new" || l.status === "duplicate"))
      st = "ожидает";
    lines.push(
      `• ${r.username || r.firstName || r.telegramId} — ${st}`
    );
  }
  const text = `📈 <b>Рефералы</b> (${refs.length})\n\n${lines.join("\n") || "Пока пусто"}`;
  const keyboard = {
    inline_keyboard: [
      paginateRow(p, totalPages, "t:ls"),
      [backButton("t:back")],
    ],
  };
  if (messageId) {
    await editMessage(chatId, messageId, text, { reply_markup: keyboard });
  } else {
    await sendMessage(chatId, text, { reply_markup: keyboard });
  }
}

export async function startWithdrawFsm(chatId: number | string, telegramId: string) {
  await setScene(telegramId, "t_wd_amount", {});
  await sendMessage(chatId, "Введите сумму вывода (₽):");
}

export async function handleTrafferText(
  chatId: number | string,
  from: TgFrom,
  text: string,
  user: { id: string; balance: number; telegramId: string }
): Promise<boolean> {
  const telegramId = String(from.id);
  const sess = await getSession(telegramId);
  if (sess.scene === "idle") return false;
  const payload = parsePayload(sess.payload);

  if (sess.scene === "t_wd_amount") {
    const amount = Number(text.replace(",", ".").replace(/\s/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      await sendMessage(chatId, "Введите корректную сумму.");
      return true;
    }
    if (amount > user.balance) {
      await sendMessage(
        chatId,
        `Недостаточно средств. Баланс: ${formatMoney(user.balance)}`
      );
      await clearScene(telegramId);
      return true;
    }
    await setScene(telegramId, "t_wd_details", { amount });
    await sendMessage(chatId, "Укажите реквизиты для выплаты:");
    return true;
  }

  if (sess.scene === "t_wd_details") {
    const amount = Number(payload.amount);
    const details = text.trim();
    if (details.length < 3) {
      await sendMessage(chatId, "Укажите реквизиты подробнее.");
      return true;
    }
    const fresh = await prisma.botUser.findUnique({ where: { id: user.id } });
    if (!fresh || amount > fresh.balance) {
      await sendMessage(chatId, "Недостаточно средств.");
      await clearScene(telegramId);
      return true;
    }
    await prisma.$transaction([
      prisma.botUser.update({
        where: { id: user.id },
        data: { balance: { decrement: amount } },
      }),
      prisma.withdrawal.create({
        data: {
          userId: user.id,
          amount,
          details,
          status: "new",
        },
      }),
      prisma.ledgerTx.create({
        data: {
          userId: user.id,
          amount: -amount,
          type: "debit_withdraw",
          comment: "hold вывода",
        },
      }),
    ]);
    await clearScene(telegramId);
    await sendMessage(
      chatId,
      `Заявка на вывод ${formatMoney(amount)} создана. Ожидайте решения админа.`
    );
    const { sendToAdmins } = await import("@/lib/telegram");
    await sendToAdmins(
      `💸 Запрос вывода ${formatMoney(amount)}\nОт: ${fresh.username || fresh.telegramId}\nРеквизиты: ${details}`
    );
    return true;
  }

  return false;
}
