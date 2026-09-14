import { prisma } from "@/lib/prisma";
import { broadcastHotOffer } from "@/lib/bot/hotBroadcast";
import {
  sendMessage,
  editMessage,
  miniAppWebAppButton,
  tgApi,
  createNamedInviteLink,
  isChannelInviteConfigured,
} from "@/lib/telegram";
import {
  adminMenu,
  backButton,
  PAGE_SIZE,
  paginateRow,
  shortId,
} from "@/lib/bot/keyboards";
import {
  clearScene,
  setScene,
  parsePayload,
  getSession,
} from "@/lib/bot/session";
import {
  ensureBotProducts,
  formatMoney,
  resolveLeadShort,
  resolveProductShort,
  resolveWithdrawalShort,
  resolveUserShort,
  refLinkFor,
} from "@/lib/bot/users";
import { setLeadStatus } from "@/lib/bot/leads";
import { isChannelAdmin } from "@/lib/bot/channelAdmins";

export async function showAdminHome(
  chatId: number | string,
  messageId?: number
) {
  const text =
    "🛠 <b>Админ-панель</b>\n\n" +
    "Кабинет — Mini App (кнопка «Кабинет»). Ниже быстрые действия в чате.";
  const keyboard = {
    inline_keyboard: [
      ...(miniAppWebAppButton() ? [[miniAppWebAppButton() as { text: string; web_app: { url: string } }]] : []),
      ...adminMenu().inline_keyboard,
    ],
  };
  if (messageId) {
    try {
      await editMessage(chatId, messageId, text, { reply_markup: keyboard });
      return;
    } catch {
      /* fallthrough */
    }
  }
  await sendMessage(chatId, text, { reply_markup: keyboard });
}

export async function requireAdmin(telegramId: string): Promise<boolean> {
  return isChannelAdmin(telegramId);
}

export async function showAdminLeads(
  chatId: number | string,
  page: number,
  messageId?: number
) {
  const leads = await prisma.botLead.findMany({
    where: { status: "new" },
    include: {
      client: true,
      product: true,
      referrer: true,
    },
    orderBy: { createdAt: "desc" },
  });
  const totalPages = Math.max(1, Math.ceil(leads.length / PAGE_SIZE));
  const p = Math.min(Math.max(0, page), totalPages - 1);
  const slice = leads.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE);
  const lines = slice.map(
    (l) =>
      `• ${l.fullName || l.client.username} / ${l.product.title} / ${l.phone}`
  );
  const text = `📥 <b>Новые заявки</b> (${leads.length})\n\n${lines.join("\n") || "Пусто"}`;
  const rows = slice.flatMap((l) => [
    [
      {
        text: `✅ ${shortId(l.id, 6)}`,
        callback_data: `a:lead:ok:${shortId(l.id, 6)}`,
      },
      {
        text: `❌ ${shortId(l.id, 6)}`,
        callback_data: `a:lead:no:${shortId(l.id, 6)}`,
      },
    ],
  ]);
  const keyboard = {
    inline_keyboard: [
      ...rows,
      paginateRow(p, totalPages, "a:leads"),
      [backButton("a:home")],
    ],
  };
  if (messageId) {
    await editMessage(chatId, messageId, text, { reply_markup: keyboard });
  } else {
    await sendMessage(chatId, text, { reply_markup: keyboard });
  }
}

export async function approveLead(short: string, chatId: number | string) {
  const lead = await resolveLeadShort(short);
  if (!lead) {
    await sendMessage(chatId, "Заявка не найдена.");
    return;
  }
  const result = await setLeadStatus({
    leadId: lead.id,
    status: "awaiting_payout",
  });
  if ("error" in result) {
    await sendMessage(chatId, "Заявку не удалось обработать.");
    return;
  }
  await sendMessage(chatId, "Статус: ждём выплату. Сумма подписчику — из цены продукта.");
}

export async function rejectLeadStart(
  short: string,
  telegramId: string,
  chatId: number | string
) {
  const lead = await resolveLeadShort(short);
  if (!lead) {
    await sendMessage(chatId, "Заявка не найдена.");
    return;
  }
  await setScene(telegramId, "a_lead_reject", { leadId: lead.id });
  await sendMessage(chatId, "Комментарий к отклонению:");
}

export async function rejectLeadFinish(leadId: string, comment: string) {
  const full = await prisma.botLead.findUnique({
    where: { id: leadId },
    include: { product: true, referrer: true },
  });
  if (!full || (full.status !== "new" && full.status !== "processing")) return "already";
  await prisma.botLead.update({
    where: { id: leadId },
    data: { status: "rejected", adminComment: comment },
  });
  if (full.referrer) {
    await sendMessage(
      full.referrer.telegramId,
      `❌ Заявка отклонена: ${full.product.title}. ${comment}`
    );
  }
  return "ok";
}

export async function showWithdrawals(
  chatId: number | string,
  page: number,
  messageId?: number
) {
  const list = await prisma.withdrawal.findMany({
    where: { status: { in: ["new", "approved"] } },
    include: { user: true },
    orderBy: { createdAt: "desc" },
  });
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const p = Math.min(Math.max(0, page), totalPages - 1);
  const slice = list.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE);
  const lines = slice.map(
    (w) =>
      `• ${formatMoney(w.amount)} ${w.user.username || w.user.telegramId} [${w.status}]`
  );
  const text = `💸 <b>Выводы</b>\n\n${lines.join("\n") || "Пусто"}`;
  const rows = slice.map((w) => [
    {
      text: `✅ ${shortId(w.id, 6)}`,
      callback_data: `a:w:ok:${shortId(w.id, 6)}`,
    },
    {
      text: `❌ ${shortId(w.id, 6)}`,
      callback_data: `a:w:no:${shortId(w.id, 6)}`,
    },
    {
      text: `💰 ${shortId(w.id, 6)}`,
      callback_data: `a:w:pd:${shortId(w.id, 6)}`,
    },
  ]);
  const keyboard = {
    inline_keyboard: [
      ...rows,
      paginateRow(p, totalPages, "a:wd"),
      [backButton("a:home")],
    ],
  };
  if (messageId) {
    await editMessage(chatId, messageId, text, { reply_markup: keyboard });
  } else {
    await sendMessage(chatId, text, { reply_markup: keyboard });
  }
}

export async function handleWithdrawalAction(
  short: string,
  action: "ok" | "no" | "pd",
  chatId: number | string
) {
  const w = await resolveWithdrawalShort(short);
  if (!w) {
    await sendMessage(chatId, "Вывод не найден.");
    return;
  }
  const full = await prisma.withdrawal.findUnique({
    where: { id: w.id },
    include: { user: true },
  });
  if (!full) return;

  if (action === "ok") {
    await prisma.withdrawal.update({
      where: { id: full.id },
      data: { status: "approved" },
    });
    await sendMessage(full.user.telegramId, `Вывод ${formatMoney(full.amount)} одобрен.`);
    await sendMessage(chatId, "Одобрено.");
  } else if (action === "no") {
    if (full.status === "new" || full.status === "approved") {
      await prisma.$transaction([
        prisma.withdrawal.update({
          where: { id: full.id },
          data: { status: "rejected" },
        }),
        prisma.botUser.update({
          where: { id: full.userId },
          data: { balance: { increment: full.amount } },
        }),
        prisma.ledgerTx.create({
          data: {
            userId: full.userId,
            amount: full.amount,
            type: "adjust",
            comment: "возврат после отклонения вывода",
          },
        }),
      ]);
    }
    await sendMessage(full.user.telegramId, `Вывод ${formatMoney(full.amount)} отклонён, средства возвращены.`);
    await sendMessage(chatId, "Отклонено, баланс возвращён.");
  } else {
    await prisma.withdrawal.update({
      where: { id: full.id },
      data: { status: "paid" },
    });
    await sendMessage(full.user.telegramId, `Вывод ${formatMoney(full.amount)} выплачен.`);
    await sendMessage(chatId, "Отмечено как выплачено.");
  }
}

export async function showProductsAdmin(
  chatId: number | string,
  page: number,
  messageId?: number,
  mode: "prices" | "premiums" = "prices"
) {
  await ensureBotProducts();
  const products = await prisma.botProduct.findMany({
    orderBy: { createdAt: "desc" },
  });
  const totalPages = Math.max(1, Math.ceil(products.length / PAGE_SIZE));
  const p = Math.min(Math.max(0, page), totalPages - 1);
  const slice = products.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE);
  const isPrices = mode === "prices";
  const lines = slice.map((pr) => {
    const amount = isPrices
      ? formatMoney(pr.subscriberPrice)
      : formatMoney(pr.reward);
    const label = isPrices ? "цена" : "премия";
    return `• ${pr.isActive ? "✅" : "⏸"} ${pr.title} — ${label} ${amount}`;
  });
  const title = isPrices
    ? "🛍 <b>Цены для подписчиков</b>"
    : "💰 <b>Премии трафферам</b>";
  const hint = isPrices
    ? "Подписчики видят только эти цены. Премии здесь не показываем."
    : "Трафферы видят только эти премии. Цены продуктов здесь не показываем.";
  const text = `${title}\n${hint}\n\n${lines.join("\n") || "Пусто"}`;
  const prefix = isPrices ? "a:pl" : "a:pm";
  const rows = slice.map((pr) => {
    const sid = shortId(pr.id, 6);
    const name = pr.title.slice(0, 18);
    return [
      {
        text: isPrices ? `✏️ ${name}` : `✏️ ${name}`,
        callback_data: isPrices ? `a:ep:${sid}` : `a:er:${sid}`,
      },
      {
        text: pr.isActive ? "⏸" : "▶️",
        callback_data: `a:pt:${sid}`,
      },
    ];
  });
  const keyboard = {
    inline_keyboard: [
      ...rows,
      paginateRow(p, totalPages, prefix),
      [backButton("a:home")],
    ],
  };
  if (messageId) {
    await editMessage(chatId, messageId, text, { reply_markup: keyboard });
  } else {
    await sendMessage(chatId, text, { reply_markup: keyboard });
  }
}

export async function toggleProduct(short: string, chatId: number | string) {
  const pr = await resolveProductShort(short);
  if (!pr) {
    await sendMessage(chatId, "Не найдено.");
    return;
  }
  await prisma.botProduct.update({
    where: { id: pr.id },
    data: { isActive: !pr.isActive },
  });
  await sendMessage(
    chatId,
    `${pr.title}: ${!pr.isActive ? "включён" : "выключен"}`
  );
}

export async function startEditProductAmount(
  short: string,
  field: "price" | "reward",
  telegramId: string,
  chatId: number | string
) {
  const pr = await resolveProductShort(short);
  if (!pr) {
    await sendMessage(chatId, "Не найдено.");
    return;
  }
  const current = field === "price" ? pr.subscriberPrice : pr.reward;
  const label = field === "price" ? "цену для подписчика" : "премию трафферу";
  await setScene(telegramId, field === "price" ? "a_edit_price" : "a_edit_reward", {
    productId: pr.id,
  });
  await sendMessage(
    chatId,
    `${pr.title}\nТекущая ${label}: ${formatMoney(current)}\nПришлите новое число:`
  );
}

export async function showTotals(chatId: number | string, messageId?: number) {
  const traffers = await prisma.botUser.count({
    where: { role: { in: ["traffer", "admin"] } },
  });
  const clients = await prisma.botUser.count({ where: { role: { in: ["client", "subscriber"] } } });
  const leads = await prisma.botLead.count();
  const sum = await prisma.ledgerTx.aggregate({
    where: { type: "credit_lead" },
    _sum: { amount: true },
  });
  const text =
    `📊 <b>Итоги</b>\n\n` +
    `Трафферы: ${traffers}\nКлиенты: ${clients}\nЗаявки: ${leads}\n` +
    `Сумма начислений: ${formatMoney(sum._sum.amount || 0)}`;
  const keyboard = {
    inline_keyboard: [[backButton("a:home")]],
  };
  if (messageId) {
    await editMessage(chatId, messageId, text, { reply_markup: keyboard });
  } else {
    await sendMessage(chatId, text, { reply_markup: keyboard });
  }
}

export async function startNewProduct(telegramId: string, chatId: number | string) {
  await setScene(telegramId, "a_np_title", {});
  await sendMessage(chatId, "Название продукта:");
}

export async function startBroadcast(telegramId: string, chatId: number | string) {
  await setScene(telegramId, "a_bc_mode", {});
  await sendMessage(chatId, "Рассылка: отправьте «all» или «balance» затем текст сообщением следующим шагом. Сейчас введите режим (all/balance):");
}

export async function startHotPick(
  chatId: number | string,
  page: number,
  messageId?: number
) {
  await ensureBotProducts();
  const products = await prisma.botProduct.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });
  const totalPages = Math.max(1, Math.ceil(products.length / PAGE_SIZE));
  const p = Math.min(Math.max(0, page), totalPages - 1);
  const slice = products.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE);
  const text = "🔥 Выберите продукт для горящего оффера:";
  const rows = slice.map((pr) => [
    {
      text: pr.title.slice(0, 40),
      callback_data: `a:hs:${shortId(pr.id, 6)}`,
    },
  ]);
  const keyboard = {
    inline_keyboard: [
      ...rows,
      paginateRow(p, totalPages, "a:hot"),
      [backButton("a:home")],
    ],
  };
  if (messageId) {
    await editMessage(chatId, messageId, text, { reply_markup: keyboard });
  } else {
    await sendMessage(chatId, text, { reply_markup: keyboard });
  }
}

export async function startHotFsm(
  short: string,
  telegramId: string,
  chatId: number | string
) {
  const pr = await resolveProductShort(short);
  if (!pr) {
    await sendMessage(chatId, "Не найдено.");
    return;
  }
  await setScene(telegramId, "a_hot_text", { productId: pr.id });
  await sendMessage(chatId, "Текст горящего оффера:");
}

export async function showUsers(
  chatId: number | string,
  page: number,
  messageId?: number
) {
  const users = await prisma.botUser.findMany({
    orderBy: { createdAt: "desc" },
  });
  const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  const p = Math.min(Math.max(0, page), totalPages - 1);
  const slice = users.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE);
  const roleRu = (r: string) =>
    r === "admin"
      ? "админ"
      : r === "traffer"
        ? "траффер"
        : r === "subscriber" || r === "client"
          ? "подписчик"
          : r;
  const userLabel = (u: {
    username: string | null;
    firstName: string | null;
    telegramId: string;
  }) => {
    const un = (u.username || "").replace(/^@/, "").trim();
    if (un && !un.startsWith("pending:")) return `@${un}`.slice(0, 32);
    const fn = (u.firstName || "").trim();
    if (fn && fn !== ".") return fn.slice(0, 32);
    if (u.telegramId.startsWith("pending:")) {
      return `@${u.telegramId.slice("pending:".length)}`.slice(0, 32);
    }
    return `id ${u.telegramId}`.slice(0, 32);
  };
  const lines = slice.map(
    (u) =>
      `• ${u.isBanned ? "🚫" : "✅"} ${userLabel(u)} — <b>${roleRu(u.role)}</b> · ${formatMoney(u.balance)}`
  );
  const textMsg = `👥 <b>Пользователи</b> (${users.length})\n\n${lines.join("\n") || "Пусто"}`;
  const rows = slice.flatMap((u) => {
    const sid = shortId(u.id, 6);
    const name = userLabel(u);
    const isAdm = u.role === "admin";
    if (isAdm) {
      return [[{ text: `🛡 ${name} · админ канала`, callback_data: "noop" }]];
    }
    return [
      [{ text: name, callback_data: "noop" }],
      [
        {
          text: `Траффер${u.role === "traffer" ? " ✓" : ""}`,
          callback_data: `a:ur:t:${sid}`,
        },
        {
          text: `Подписчик${u.role === "subscriber" || u.role === "client" ? " ✓" : ""}`,
          callback_data: `a:ur:s:${sid}`,
        },
      ],
      [
        {
          text: u.isBanned ? `🔓 разбан ${name}` : `🔒 бан`,
          callback_data: `a:ub:${sid}`,
        },
      ],
    ];
  });
  const keyboard = {
    inline_keyboard: [
      [{ text: "🎖 Назначить роль", callback_data: "a:role" }],
      [{ text: "🔎 Поиск @username", callback_data: "a:us" }],
      ...rows,
      paginateRow(p, totalPages, "a:usr"),
      [backButton("a:home")],
    ],
  };
  if (messageId) {
    await editMessage(chatId, messageId, textMsg, { reply_markup: keyboard });
  } else {
    await sendMessage(chatId, textMsg, { reply_markup: keyboard });
  }
}

export async function toggleBan(short: string, chatId: number | string) {
  const u = await resolveUserShort(short);
  if (!u) {
    await sendMessage(chatId, "Не найден.");
    return;
  }
  await prisma.botUser.update({
    where: { id: u.id },
    data: { isBanned: !u.isBanned },
  });
  await sendMessage(
    chatId,
    `${u.username || u.telegramId}: ${!u.isBanned ? "забанен" : "разбанен"}`
  );
}

function pendingTelegramId(username: string) {
  return `pending:${username.replace(/^@/, "").toLowerCase()}`;
}

/** Set BotUser.role to traffer|subscriber; notify user; refuse channel admins. */
export async function setBotUserRole(
  target: { id: string; telegramId: string; username: string | null; role: string },
  nextRole: "traffer" | "subscriber",
  adminChatId: number | string
): Promise<{ ok: boolean; error?: string }> {
  const isPending = target.telegramId.startsWith("pending:");
  if (target.role === "admin") {
    await sendMessage(
      adminChatId,
      "Нельзя менять роль администратора канала."
    );
    return { ok: false, error: "admin" };
  }
  if (!isPending && (await isChannelAdmin(target.telegramId))) {
    await sendMessage(
      adminChatId,
      "Нельзя менять роль администратора канала."
    );
    return { ok: false, error: "admin" };
  }

  const updated = await prisma.botUser.update({
    where: { id: target.id },
    data: { role: nextRole },
  });

  let inviteNote = "";
  let userMsg = "";

  if (nextRole === "traffer") {
    const ref = isPending
      ? "(ссылка появится после /start пользователя)"
      : refLinkFor(updated.telegramId);
    let inviteLine = "";
    if (!isPending && isChannelInviteConfigured()) {
      const shortCode = `t${updated.telegramId.slice(-8)}`;
      const inv = await createNamedInviteLink(shortCode);
      if ("inviteLink" in inv) {
        inviteLine = `\nКанал (именная ссылка): ${inv.inviteLink}`;
        inviteNote = `\nInvite: ${inv.inviteLink} (${inv.name})`;
        await prisma.botUser.update({
          where: { id: updated.id },
          data: {
            inviteLink: inv.inviteLink,
            inviteLinkName: inv.name || shortCode,
          },
        });
      } else {
        inviteNote = `\nInvite: не создан (${inv.error})`;
      }
    }
    userMsg =
      `✅ Вам выдали роль траффера.\n\n` +
      `🔗 Ваша реф-ссылка:\n<code>${ref}</code>` +
      inviteLine +
      `\n\nДелитесь ссылкой с ИП и ООО. Кабинет: /cabinet`;
    await sendMessage(
      adminChatId,
      `Готово: ${updated.username || updated.telegramId} → траффер\nРеф: ${ref}${inviteNote}`
    );
  } else {
    userMsg =
      "✅ Вам выдали роль подписчика.\n\nРеф-ссылка и вывод партнёра больше не доступны. Смотрите продукты и канал.";
    await sendMessage(
      adminChatId,
      `Готово: ${updated.username || updated.telegramId} → подписчик`
    );
  }

  if (!isPending) {
    try {
      await sendMessage(updated.telegramId, userMsg);
    } catch {
      /* blocked */
    }
  }

  return { ok: true };
}

export async function setRoleByShort(
  short: string,
  nextRole: "traffer" | "subscriber",
  chatId: number | string,
  adminTelegramId?: string
) {
  const u = await resolveUserShort(short);
  if (!u) {
    await sendMessage(chatId, "Пользователь не найден.");
    return;
  }
  if (adminTelegramId) await clearScene(adminTelegramId);
  await setBotUserRole(u, nextRole, chatId);
}

export async function startAssignRole(
  telegramId: string,
  chatId: number | string
) {
  await setScene(telegramId, "a_role_who", {});
  await sendMessage(
    chatId,
    "Назначить роль: отправьте @username или числовой telegram id:"
  );
}

async function resolveTargetUser(query: string): Promise<{
  id: string;
  telegramId: string;
  username: string | null;
  role: string;
} | null> {
  const q = query.trim();
  if (!q) return null;

  // numeric telegram id
  if (/^\d+$/.test(q)) {
    let u = await prisma.botUser.findUnique({ where: { telegramId: q } });
    if (!u) {
      u = await prisma.botUser.create({
        data: { telegramId: q, username: null, role: "subscriber" },
      });
    }
    return u;
  }

  const uname = q.replace(/^@/, "").toLowerCase();
  const withAt = `@${uname}`;

  const found = await prisma.botUser.findFirst({
    where: {
      OR: [
        { username: { equals: withAt } },
        { username: { equals: uname } },
        { username: { contains: uname } },
        { telegramId: pendingTelegramId(uname) },
      ],
    },
  });
  if (found) return found;

  // try getChat(@username)
  try {
    const data = await tgApi<{ id: number; username?: string; first_name?: string }>(
      "getChat",
      { chat_id: `@${uname}` }
    );
    if (data.ok && data.result?.id) {
      const tid = String(data.result.id);
      let u = await prisma.botUser.findUnique({ where: { telegramId: tid } });
      if (!u) {
        u = await prisma.botUser.create({
          data: {
            telegramId: tid,
            username: data.result.username
              ? `@${data.result.username}`
              : withAt,
            firstName: data.result.first_name || null,
            role: "subscriber",
          },
        });
      }
      return u;
    }
  } catch {
    /* ignore */
  }

  // pending placeholder until they /start
  const pendingId = pendingTelegramId(uname);
  let pending = await prisma.botUser.findUnique({
    where: { telegramId: pendingId },
  });
  if (!pending) {
    pending = await prisma.botUser.create({
      data: {
        telegramId: pendingId,
        username: withAt,
        role: "subscriber",
      },
    });
  }
  return pending;
}

export async function handleRoleCommand(
  chatId: number | string,
  fromId: string,
  text: string
): Promise<boolean> {
  // /role @user traffer | /role @user subscriber
  const m = text.match(
    /^\/role(?:@\w+)?\s+(\S+)\s+(traffer|subscriber|траффер|подписчик)\s*$/i
  );
  if (!m) {
    if (/^\/role(?:@\w+)?/i.test(text)) {
      await sendMessage(
        chatId,
        "Формат: /role @username traffer|subscriber"
      );
      return true;
    }
    return false;
  }
  if (!(await isChannelAdmin(fromId))) {
    await sendMessage(chatId, "Только для админов канала.");
    return true;
  }
  const target = await resolveTargetUser(m[1]);
  if (!target) {
    await sendMessage(chatId, "Не удалось найти пользователя.");
    return true;
  }
  const raw = m[2].toLowerCase();
  const nextRole: "traffer" | "subscriber" =
    raw === "traffer" || raw === "траффер" ? "traffer" : "subscriber";
  await setBotUserRole(target, nextRole, chatId);
  return true;
}

export async function handleAdminText(
  chatId: number | string,
  telegramId: string,
  text: string
): Promise<boolean> {
  const sess = await getSession(telegramId);
  if (sess.scene === "idle") return false;
  const payload = parsePayload(sess.payload);
  const t = text.trim();

  if (sess.scene === "a_lead_reject") {
    const leadId = String(payload.leadId || "");
    await clearScene(telegramId);
    await rejectLeadFinish(leadId, t);
    await sendMessage(chatId, "Отклонено.");
    return true;
  }

  if (sess.scene === "a_role_who") {
    const target = await resolveTargetUser(t);
    if (!target) {
      await sendMessage(chatId, "Не найден. Попробуйте ещё раз @username или id:");
      return true;
    }
    if (target.role === "admin" || (await isChannelAdmin(target.telegramId))) {
      await clearScene(telegramId);
      await sendMessage(chatId, "Это админ канала — роль менять нельзя.");
      return true;
    }
    await setScene(telegramId, "a_role_pick", { userId: target.id });
    await sendMessage(chatId, `Пользователь: ${target.username || target.telegramId}\nВыберите роль:`, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Траффер", callback_data: `a:ur:t:${shortId(target.id, 6)}` },
            { text: "Подписчик", callback_data: `a:ur:s:${shortId(target.id, 6)}` },
          ],
          [backButton("a:home")],
        ],
      },
    });
    return true;
  }


  if (sess.scene === "a_edit_price" || sess.scene === "a_edit_reward") {
    const n = Number(t.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) {
      await sendMessage(chatId, "Число, пожалуйста.");
      return true;
    }
    const productId = String(payload.productId || "");
    const pr = await prisma.botProduct.findUnique({ where: { id: productId } });
    if (!pr) {
      await sendMessage(chatId, "Не найдено.");
      await clearScene(telegramId);
      return true;
    }
    const isPrice = sess.scene === "a_edit_price";
    await prisma.botProduct.update({
      where: { id: productId },
      data: isPrice ? { subscriberPrice: n } : { reward: n },
    });
    await clearScene(telegramId);
    await sendMessage(
      chatId,
      isPrice
        ? `Цена «${pr.title}»: ${formatMoney(n)}`
        : `Премия «${pr.title}»: ${formatMoney(n)}`
    );
    return true;
  }

  if (sess.scene === "a_np_title") {
    await setScene(telegramId, "a_np_bank", { title: t });
    await sendMessage(chatId, "Банк:");
    return true;
  }
  if (sess.scene === "a_np_bank") {
    await setScene(telegramId, "a_np_desc", { ...payload, bank: t });
    await sendMessage(chatId, "Описание:");
    return true;
  }
  if (sess.scene === "a_np_desc") {
    await setScene(telegramId, "a_np_reward", { ...payload, description: t });
    await sendMessage(chatId, "Премия трафферу за открытие (число):");
    return true;
  }
  if (sess.scene === "a_np_reward") {
    const reward = Number(t.replace(",", "."));
    if (!Number.isFinite(reward)) {
      await sendMessage(chatId, "Число, пожалуйста.");
      return true;
    }
    await setScene(telegramId, "a_np_subprice", { ...payload, reward });
    await sendMessage(
      chatId,
      `Цена для подписчика (число; "-" = как премия ${reward}):`
    );
    return true;
  }
  if (sess.scene === "a_np_subprice") {
    let subscriberPrice = Number(t.replace(",", "."));
    if (!Number.isFinite(subscriberPrice) || t.trim() === "" || t.trim() === "-") {
      subscriberPrice = Number(payload.reward) || 0;
    }
    await setScene(telegramId, "a_np_rtype", {
      ...payload,
      subscriberPrice,
    });
    await sendMessage(chatId, "Тип: fixed или percent");
    return true;
  }
  if (sess.scene === "a_np_rtype") {
    const rewardType = t === "percent" ? "percent" : "fixed";
    await setScene(telegramId, "a_np_url", { ...payload, rewardType });
    await sendMessage(chatId, "URL (или -):");
    return true;
  }
  if (sess.scene === "a_np_url") {
    const url = t === "-" ? "" : t;
    const reward = Number(payload.reward);
    const subscriberPrice =
      Number(payload.subscriberPrice) > 0
        ? Number(payload.subscriberPrice)
        : reward;
    await prisma.botProduct.create({
      data: {
        title: String(payload.title),
        bank: String(payload.bank || ""),
        description: String(payload.description || ""),
        reward,
        subscriberPrice,
        rewardType: String(payload.rewardType || "fixed"),
        url,
        isActive: true,
      },
    });
    await clearScene(telegramId);
    await sendMessage(chatId, "Продукт создан.");
    return true;
  }

  if (sess.scene === "a_hot_text") {
    await setScene(telegramId, "a_hot_days", { ...payload, hotText: t });
    await sendMessage(chatId, "На сколько дней (число) или 0 = бессрочно:");
    return true;
  }
  if (sess.scene === "a_hot_days") {
    const days = Number(t);
    const productId = String(payload.productId);
    const hotUntil =
      Number.isFinite(days) && days > 0
        ? new Date(Date.now() + days * 86400000)
        : null;
    const updated = await prisma.botProduct.update({
      where: { id: productId },
      data: {
        isHot: true,
        hotText: String(payload.hotText || ""),
        hotUntil,
      },
    });
    const broadcast = await broadcastHotOffer(updated);
    await clearScene(telegramId);
    await sendMessage(
      chatId,
      `Горящий оффер установлен. Рассылка: ${broadcast.sent} ок, ${broadcast.failed} ошибок.`
    );
    return true;
  }

  if (sess.scene === "a_bc_mode") {
    const mode = t === "balance" ? "balance" : "all";
    await setScene(telegramId, "a_bc_text", { mode });
    await sendMessage(chatId, "Текст рассылки:");
    return true;
  }
  if (sess.scene === "a_bc_text") {
    const mode = String(payload.mode || "all");
    const where =
      mode === "balance"
        ? { role: { in: ["traffer", "admin"] }, balance: { gt: 0 } }
        : { role: { in: ["traffer", "admin"] } };
    const users = await prisma.botUser.findMany({ where });
    let n = 0;
    for (const u of users) {
      try {
        await sendMessage(u.telegramId, t);
        n++;
      } catch {
        /* skip */
      }
    }
    await clearScene(telegramId);
    await sendMessage(chatId, `Отправлено: ${n}`);
    return true;
  }

  if (sess.scene === "a_us_search") {
    const q = t.replace(/^@/, "").toLowerCase();
    const found = await prisma.botUser.findMany({
      where: {
        OR: [
          { username: { contains: q } },
          { telegramId: { contains: q } },
        ],
      },
      take: 10,
    });
    await clearScene(telegramId);
    const lines = found.map(
      (u) =>
        `• ${u.username || u.telegramId} [${u.role}] ${formatMoney(u.balance)} id=${shortId(u.id, 8)}`
    );
    await sendMessage(chatId, lines.join("\n") || "Не найдено");
    return true;
  }

  return false;
}

export async function startUserSearch(telegramId: string, chatId: number | string) {
  await setScene(telegramId, "a_us_search", {});
  await sendMessage(chatId, "Введите @username или telegram id:");
}
