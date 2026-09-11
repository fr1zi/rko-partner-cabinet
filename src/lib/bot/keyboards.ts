export type InlineButton = {
  text: string;
  callback_data?: string;
  url?: string;
  web_app?: { url: string };
  switch_inline_query?: string;
};

export type InlineKeyboard = { inline_keyboard: InlineButton[][] };

export const PAGE_SIZE = 5;

export function trafferMenu(): InlineKeyboard {
  return {
    inline_keyboard: [
      [{ text: "🔗 Моя реф-ссылка", callback_data: "t:ref" }],
      [{ text: "📊 Статистика", callback_data: "t:st" }],
      [{ text: "💰 Баланс и выплаты", callback_data: "t:bal" }],
      [{ text: "💰 Премии", callback_data: "t:pr:0" }],
      [{ text: "📈 Мои рефералы", callback_data: "t:ls:0" }],
    ],
  };
}

export function clientMenu(channelUrl: string): InlineKeyboard {
  return {
    inline_keyboard: [
      [{ text: "Вступить в канал", url: channelUrl }],
      [{ text: "🛍 Продукты", callback_data: "c:prod:0" }],
      [{ text: "✅ Оформил продукт", callback_data: "c:done" }],
    ],
  };
}

export function adminMenu(): InlineKeyboard {
  return {
    inline_keyboard: [
      [{ text: "➕ Продукт", callback_data: "a:np" }],
      [{ text: "🛍 Цены (продукты)", callback_data: "a:pl:0" }],
      [{ text: "💰 Премии", callback_data: "a:pm:0" }],
      [{ text: "🔥 Горящее предложение", callback_data: "a:hot:0" }],
      [{ text: "📥 Заявки (new)", callback_data: "a:leads:0" }],
      [{ text: "💸 Выводы", callback_data: "a:wd:0" }],
      [{ text: "👥 Пользователи", callback_data: "a:usr:0" }],
      [{ text: "🎖 Назначить роль", callback_data: "a:role" }],
      [{ text: "📣 Рассылка", callback_data: "a:bc" }],
      [{ text: "📊 Итоги", callback_data: "a:tot" }],
    ],
  };
}

export function backButton(data = "t:back"): InlineButton {
  return { text: "⬅️ Назад", callback_data: data };
}

export function paginateRow(
  page: number,
  totalPages: number,
  prefix: string
): InlineButton[] {
  const row: InlineButton[] = [];
  if (page > 0) row.push({ text: "◀️", callback_data: `${prefix}:${page - 1}` });
  row.push({ text: `${page + 1}/${Math.max(totalPages, 1)}`, callback_data: "noop" });
  if (page < totalPages - 1)
    row.push({ text: "▶️", callback_data: `${prefix}:${page + 1}` });
  return row;
}

export function shortId(id: string, n = 8): string {
  return id.slice(0, n);
}

export function withMarkup(
  reply_markup: InlineKeyboard
): { reply_markup: InlineKeyboard } {
  return { reply_markup };
}

export function persistentReplyKeyboard(): {
  keyboard: Array<Array<{ text: string }>>;
  resize_keyboard: boolean;
  is_persistent: boolean;
} {
  return {
    keyboard: [[{ text: "📋 Меню" }, { text: "🛍 Продукты" }]],
    resize_keyboard: true,
    is_persistent: true,
  };
}
