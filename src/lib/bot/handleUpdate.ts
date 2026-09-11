import { prisma } from "@/lib/prisma";
import {
  answerCallbackQuery,
  sendMessage,
  setBotCommands,
  ensureBotUx,
  setCommandsForUser,
} from "@/lib/telegram";
import {
  ensureBotProducts,
  upsertBotUser,
  isTrafferBotUser,
  type TgFrom,
} from "@/lib/bot/users";
import { clearScene, getSession, parsePayload } from "@/lib/bot/session";
import { showClientGreeting, showClientProducts, startLeadFsm, onClientPickProduct, handleClientText } from "@/lib/bot/client";
import {
  showTrafferHome,
  showRefLink,
  showStats,
  showBalance,
  showProducts,
  showReferrals,
  startWithdrawFsm,
  handleTrafferText,
} from "@/lib/bot/traffer";
import {
  showAdminHome,
  requireAdmin,
  showAdminLeads,
  approveLead,
  rejectLeadStart,
  showWithdrawals,
  handleWithdrawalAction,
  showProductsAdmin,
  startEditProductAmount,
  toggleProduct,
  showTotals,
  startNewProduct,
  startBroadcast,
  startHotPick,
  startHotFsm,
  showUsers,
  toggleBan,
  handleAdminText,
  startUserSearch,
  startAssignRole,
  setRoleByShort,
  handleRoleCommand,
} from "@/lib/bot/admin";
import { isChannelAdmin } from "@/lib/bot/channelAdmins";
import { ADMIN_INVITE_NAME, isAdminJoinSource } from "@/lib/bot/adminInvite";
import { getChannelPublicUrl } from "@/lib/telegram";

type TgUser = TgFrom & { last_name?: string; is_bot?: boolean };
type TgInviteLink = { invite_link?: string; name?: string };
type TgChatMember = { status?: string; user?: TgUser };
type TgChatMemberUpdated = {
  chat?: { id: number };
  date?: number;
  old_chat_member?: TgChatMember;
  new_chat_member?: TgChatMember;
  invite_link?: TgInviteLink;
};
type TgMessage = {
  text?: string;
  from?: TgUser;
  chat?: { id: number };
  message_id?: number;
};
type TgCallback = {
  id: string;
  from: TgUser;
  data?: string;
  message?: { message_id?: number; chat?: { id: number } };
};
type TgUpdate = {
  message?: TgMessage;
  callback_query?: TgCallback;
  chat_member?: TgChatMemberUpdated;
};

const JOIN_STATUSES = new Set(["member", "administrator", "restricted"]);
const LEFT_STATUSES = new Set(["left", "kicked"]);

let commandsBooted = false;
async function bootCommands() {
  if (commandsBooted) return;
  commandsBooted = true;
  try {
    await setBotCommands();
    await ensureBotUx();
  } catch {
    /* ignore */
  }
}

async function findPartnerByInvite(
  inviteLink?: string | null,
  inviteName?: string | null
) {
  const name = inviteName?.trim() || null;
  const url = inviteLink?.trim() || null;
  if (name) {
    const byName = await prisma.partner.findFirst({
      where: {
        OR: [
          { telegramInviteLinkName: name },
          { refCode: name.toUpperCase() },
        ],
        active: true,
      },
    });
    if (byName) return byName;
  }
  if (url) {
    return prisma.partner.findFirst({
      where: {
        OR: [{ telegramInviteLink: url }, { telegramChannelUrl: url }],
        active: true,
      },
    });
  }
  return null;
}

async function handleChatMember(update: TgChatMemberUpdated) {
  const newMember = update.new_chat_member;
  const oldMember = update.old_chat_member;
  const user = newMember?.user;
  if (!user || !newMember?.status) return { ignored: true, reason: "no user" };

  const becameMember =
    JOIN_STATUSES.has(newMember.status) &&
    (!oldMember?.status || LEFT_STATUSES.has(oldMember.status));
  if (!becameMember) return { ignored: true, reason: "not a join" };

  const invite = update.invite_link;
  const inviteLink = invite?.invite_link || null;
  const inviteName = invite?.name || null;
  // Still record organic joins (no named invite) — otherwise people "vanish" from stats
  const partner = await findPartnerByInvite(inviteLink, inviteName);
  const telegramId = String(user.id);
  const username = user.username ? `@${user.username}` : null;
  const firstName = user.first_name || null;
  const joinedAt = update.date ? new Date(update.date * 1000) : new Date();

  if (user.is_bot) {
    return { ignored: true, reason: "bot join" };
  }

  // Anything that is not a traffer named invite = admin (t.me/w1nstr1k3, search, ADMIN +link)
  const fromAdmin = !partner && isAdminJoinSource(inviteLink, inviteName);
  const storedInviteName = partner
    ? inviteName || partner.telegramInviteLinkName || partner.refCode
    : inviteName || ADMIN_INVITE_NAME;
  const storedInviteLink =
    inviteLink ||
    partner?.telegramInviteLink ||
    (fromAdmin ? getChannelPublicUrl() : null);

  const subscriber = await prisma.subscriber.upsert({
    where: { telegramId },
    create: {
      telegramId,
      username,
      partnerId: partner?.id ?? null,
      inviteLink: storedInviteLink,
      inviteLinkName: storedInviteName,
      joinedAt,
      isDemo: false,
    },
    update: {
      username,
      partnerId: partner?.id ?? undefined,
      inviteLink: storedInviteLink || undefined,
      inviteLinkName: storedInviteName || undefined,
      joinedAt,
      isDemo: false,
    },
  });

  await prisma.telegramUser.upsert({
    where: { telegramId },
    create: {
      telegramId,
      username,
      firstName,
      lastName: user.last_name || null,
      partnerId: partner?.id ?? null,
      refCode: partner?.refCode ?? inviteName ?? (fromAdmin ? ADMIN_INVITE_NAME : null),
      joinedAt,
    },
    update: {
      username,
      firstName,
      lastName: user.last_name || null,
      ...(partner
        ? { partnerId: partner.id, refCode: partner.refCode, joinedAt }
        : {}),
    },
  });

  // Appear in admin «Юзеры» even if they never pressed /start
  const existing = await prisma.botUser.findUnique({ where: { telegramId } });
  if (!existing) {
    await prisma.botUser.create({
      data: {
        telegramId,
        username,
        firstName,
        role: "subscriber",
      },
    });
  } else {
    await prisma.botUser.update({
      where: { telegramId },
      data: {
        username: username ?? undefined,
        firstName: firstName ?? undefined,
      },
    });
  }

  return {
    type: "chat_member",
    attributed: Boolean(partner) || fromAdmin,
    organic: fromAdmin,
    subscriberId: subscriber.id,
    partnerId: partner?.id ?? null,
  };
}

async function handleLegacyPartnerRef(from: TgUser, refCodeRaw: string) {
  const partner = await prisma.partner.findUnique({
    where: { refCode: refCodeRaw.toUpperCase() },
  });
  if (!partner || !partner.active) return null;
  const telegramId = String(from.id);
  const username = from.username ? `@${from.username}` : null;
  await prisma.telegramUser.upsert({
    where: { telegramId },
    create: {
      telegramId,
      username,
      firstName: from.first_name || null,
      lastName: from.last_name || null,
      partnerId: partner.id,
      refCode: partner.refCode,
      joinedAt: new Date(),
    },
    update: {
      username,
      firstName: from.first_name || null,
      lastName: from.last_name || null,
      partnerId: partner.id,
      refCode: partner.refCode,
      joinedAt: new Date(),
    },
  });
  const existing = await prisma.client.findFirst({
    where: { telegramId, partnerId: partner.id },
  });
  if (!existing) {
    const display =
      [from.first_name, from.last_name].filter(Boolean).join(" ") ||
      username ||
      `TG ${telegramId}`;
    await prisma.client.create({
      data: {
        partnerId: partner.id,
        name: display,
        phone: `tg:${telegramId}`,
        comment: "Лид из Telegram-бота (/start)",
        product: "РКО (открытие счёта)",
        status: "new",
        telegramId,
      },
    });
  }
  return partner;
}

async function handleStart(message: TgMessage) {
  const from = message.from;
  const chatId = message.chat?.id;
  const text = message.text?.trim() || "";
  if (!from || chatId == null) return { ignored: true };

  const normalized = text.replace(/[\u200B-\u200D\uFEFF\u2060]/g, "").trim();
  const startMatch = normalized.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i);
  if (!startMatch) return { ignored: true };

  await ensureBotProducts();
  await bootCommands();

  const payload = (startMatch[1] || "").trim();
  const telegramId = String(from.id);
  await setCommandsForUser(telegramId, await isChannelAdmin(telegramId));

  // ref_<telegram_id>
  if (/^ref_/i.test(payload)) {
    const refTgId = payload.replace(/^ref_/i, "").trim();
    if (refTgId === telegramId) {
      const self = await upsertBotUser(from);
      await sendMessage(chatId, "Нельзя пригласить себя.");
      if (await isTrafferBotUser(self) || self.role === "admin") {
        await showTrafferHome(chatId, self);
      } else {
        await showClientGreeting(chatId, from);
      }
      return { type: "start_ref_self" };
    }

    const referrer = await prisma.botUser.findFirst({
      where: { telegramId: refTgId, role: "traffer" },
    });
    if (referrer) {
      await prisma.referralClick.create({
        data: {
          referrerId: referrer.id,
          clientTelegramId: telegramId,
        },
      });
    }

    const client = await upsertBotUser(from, {
      role: "subscriber",
      referrerId: referrer?.id,
      bindReferrerIfEmpty: true,
    });

    if (client.isBanned) {
      await sendMessage(chatId, "доступ закрыт");
      return { type: "banned" };
    }

    if (referrer && client.referrerId === referrer.id) {
      await sendMessage(
        referrer.telegramId,
        `👤 Новая регистрация по вашей ссылке: ${client.username || client.telegramId}`
      );
    }

    if (client.role === "admin" || (await isTrafferBotUser(client))) {
      await showTrafferHome(chatId, client);
    } else {
      await showClientGreeting(chatId, from);
    }
    return { type: "start_ref", referrerId: referrer?.id };
  }

  // legacy partner codes DEMO01 etc.
  if (payload && !/^cabinet$/i.test(payload) && !/^ref_/i.test(payload)) {
    await handleLegacyPartnerRef(from, payload);
  }

  const user = await upsertBotUser(from);
  if (user.isBanned) {
    await sendMessage(chatId, "доступ закрыт");
    return { type: "banned" };
  }
  if (user.role === "admin" || (await isChannelAdmin(telegramId))) {
    await showAdminHome(chatId);
    return { type: "start_admin" };
  }
  if (await isTrafferBotUser(user)) {
    await showTrafferHome(chatId, user);
    return { type: "start_traffer" };
  }
  await showClientGreeting(chatId, from);
  return { type: "start_subscriber" };
}

async function handleAdminCmd(message: TgMessage) {
  const from = message.from;
  const chatId = message.chat?.id;
  if (!from || chatId == null) return { ignored: true };
  const ok = await requireAdmin(String(from.id));
  if (!ok) {
    await setCommandsForUser(String(from.id), false);
    return { ignored: true, type: "admin_hidden" };
  }
  await upsertBotUser(from, { role: "admin" });
  await showAdminHome(chatId);
  return { type: "admin" };
}

async function routeCallback(cb: TgCallback) {
  const data = cb.data || "";
  const from = cb.from;
  const chatId = cb.message?.chat?.id;
  const messageId = cb.message?.message_id;
  if (chatId == null) {
    await answerCallbackQuery(cb.id);
    return { ignored: true };
  }
  const telegramId = String(from.id);
  await answerCallbackQuery(cb.id);

  if (data === "noop") return { type: "noop" };

  const user = await upsertBotUser(from);
  if (user.isBanned) {
    await sendMessage(chatId, "доступ закрыт");
    return { type: "banned" };
  }

  // Client
  if (data === "c:home") {
    await clearScene(telegramId);
    await showClientGreeting(chatId, from, messageId);
    return { type: "c_home" };
  }
  if (data === "c:done") {
    await startLeadFsm(chatId, telegramId);
    return { type: "c_done" };
  }
  if (data.startsWith("c:prod:")) {
    const page = Number(data.split(":")[2] || 0);
    await showClientProducts(chatId, messageId, page);
    return { type: "c_prod" };
  }
  if (data.startsWith("c:pick:")) {
    await onClientPickProduct(chatId, telegramId, data.split(":")[2] || "");
    return { type: "c_pick" };
  }

  // Traffer — only if role=traffer
  if (data.startsWith("t:")) {
    if (!(await isTrafferBotUser(user)) && user.role !== "admin") {
      await sendMessage(chatId, "Доступно только трафферам. Обратитесь к админу канала.");
      await showClientGreeting(chatId, from);
      return { type: "t_denied" };
    }
  }
  if (data === "t:back") {
    await clearScene(telegramId);
    await showTrafferHome(chatId, user, messageId);
    return { type: "t_back" };
  }
  if (data === "t:ref") {
    await showRefLink(chatId, telegramId, messageId);
    return { type: "t_ref" };
  }
  if (data === "t:st") {
    await showStats(chatId, user.id, telegramId, messageId);
    return { type: "t_st" };
  }
  if (data === "t:bal") {
    await showBalance(chatId, user, messageId);
    return { type: "t_bal" };
  }
  if (data === "t:wd") {
    await startWithdrawFsm(chatId, telegramId);
    return { type: "t_wd" };
  }
  if (data.startsWith("t:pr:")) {
    await showProducts(chatId, Number(data.split(":")[2] || 0), messageId);
    return { type: "t_pr" };
  }
  if (data.startsWith("t:ls:")) {
    await showReferrals(
      chatId,
      user.id,
      Number(data.split(":")[2] || 0),
      messageId
    );
    return { type: "t_ls" };
  }

  // Admin
  if (data.startsWith("a:")) {
    const isAdm = await isChannelAdmin(telegramId);
    if (!isAdm) {
      await sendMessage(chatId, "Только для админов канала.");
      return { type: "admin_denied" };
    }
    if (data === "a:home") {
      await showAdminHome(chatId, messageId);
      return { type: "a_home" };
    }
    if (data === "a:np") {
      await startNewProduct(telegramId, chatId);
      return { type: "a_np" };
    }
    if (data === "a:bc") {
      await startBroadcast(telegramId, chatId);
      return { type: "a_bc" };
    }
    if (data === "a:tot") {
      await showTotals(chatId, messageId);
      return { type: "a_tot" };
    }
    if (data === "a:us") {
      await startUserSearch(telegramId, chatId);
      return { type: "a_us" };
    }
    if (data.startsWith("a:leads:")) {
      await showAdminLeads(chatId, Number(data.split(":")[2] || 0), messageId);
      return { type: "a_leads" };
    }
    if (data.startsWith("a:lead:ok:")) {
      await approveLead(data.split(":")[3] || "", chatId);
      return { type: "a_lead_ok" };
    }
    if (data.startsWith("a:lead:no:")) {
      await rejectLeadStart(data.split(":")[3] || "", telegramId, chatId);
      return { type: "a_lead_no" };
    }
    if (data.startsWith("a:wd:")) {
      await showWithdrawals(chatId, Number(data.split(":")[2] || 0), messageId);
      return { type: "a_wd" };
    }
    if (data.startsWith("a:w:")) {
      const parts = data.split(":");
      const act = parts[2] as "ok" | "no" | "pd";
      await handleWithdrawalAction(parts[3] || "", act, chatId);
      return { type: "a_w" };
    }
    if (data.startsWith("a:pl:")) {
      await showProductsAdmin(
        chatId,
        Number(data.split(":")[2] || 0),
        messageId,
        "prices"
      );
      return { type: "a_pl" };
    }
    if (data.startsWith("a:pm:")) {
      await showProductsAdmin(
        chatId,
        Number(data.split(":")[2] || 0),
        messageId,
        "premiums"
      );
      return { type: "a_pm" };
    }
    if (data.startsWith("a:ep:")) {
      await startEditProductAmount(
        data.split(":")[2] || "",
        "price",
        telegramId,
        chatId
      );
      return { type: "a_ep" };
    }
    if (data.startsWith("a:er:")) {
      await startEditProductAmount(
        data.split(":")[2] || "",
        "reward",
        telegramId,
        chatId
      );
      return { type: "a_er" };
    }
    if (data.startsWith("a:pt:")) {
      await toggleProduct(data.split(":")[2] || "", chatId);
      return { type: "a_pt" };
    }
    if (data.startsWith("a:hot:")) {
      await startHotPick(chatId, Number(data.split(":")[2] || 0), messageId);
      return { type: "a_hot" };
    }
    if (data.startsWith("a:hs:")) {
      await startHotFsm(data.split(":")[2] || "", telegramId, chatId);
      return { type: "a_hs" };
    }
    if (data.startsWith("a:usr:")) {
      await showUsers(chatId, Number(data.split(":")[2] || 0), messageId);
      return { type: "a_usr" };
    }
    if (data === "a:role") {
      await startAssignRole(telegramId, chatId);
      return { type: "a_role" };
    }
    if (data.startsWith("a:ur:")) {
      // a:ur:t:<short> | a:ur:s:<short>
      const parts = data.split(":");
      const kind = parts[2];
      const short = parts[3] || "";
      const nextRole = kind === "t" ? "traffer" : "subscriber";
      await setRoleByShort(short, nextRole, chatId, telegramId);
      return { type: "a_ur" };
    }
    if (data.startsWith("a:ub:")) {
      await toggleBan(data.split(":")[2] || "", chatId);
      return { type: "a_ub" };
    }
  }

  return { type: "unknown_cb", data };
}

function normalizeCmd(raw: string): string {
  return raw.replace(/[\u200B-\u200D\uFEFF\u2060]/g, "").trim();
}

async function openHome(message: TgMessage) {
  const from = message.from!;
  const chatId = message.chat!.id;
  await setCommandsForUser(String(from.id), await isChannelAdmin(String(from.id)));
  const user = await upsertBotUser(from);
  if (user.isBanned) {
    await sendMessage(chatId, "доступ закрыт");
    return { type: "banned" };
  }
  if (user.role === "admin" || (await isChannelAdmin(String(from.id)))) {
    await showAdminHome(chatId);
    return { type: "home_admin" };
  }
  if (await isTrafferBotUser(user)) {
    await showTrafferHome(chatId, user);
    return { type: "home_traffer" };
  }
  await showClientGreeting(chatId, from);
  return { type: "home_sub" };
}

async function handleMessage(message: TgMessage) {
  const from = message.from;
  const chatId = message.chat?.id;
  const text = normalizeCmd(message.text || "");
  if (!from || chatId == null || !text) return { ignored: true };

  const low = text.toLowerCase();
  const isMenu =
    /^(?:\/)?(?:menu|start|cabinet|меню|кабинет|старт)(?:@\w+)?$/i.test(low) ||
    text === "📋 Меню";
  const isProducts = text === "🛍 Продукты" || low === "продукты";

  if (/^\/admin(?:@\w+)?$/i.test(text)) {
    return handleAdminCmd(message);
  }
  if (isProducts) {
    const user = await upsertBotUser(from);
    if (user.isBanned) {
      await sendMessage(chatId, "доступ закрыт");
      return { type: "banned" };
    }
    if (await isTrafferBotUser(user) || user.role === "admin") {
      await showProducts(chatId, 0);
    } else {
      await showClientProducts(chatId, undefined, 0);
    }
    return { type: "reply_products" };
  }
  if (isMenu && !/^\/start(?:@\w+)?/i.test(text) && !/^\/cabinet(?:@\w+)?$/i.test(text)) {
    return openHome(message);
  }
  if (/^\/start(?:@\w+)?/i.test(text) || /^\/cabinet(?:@\w+)?$/i.test(text)) {
    if (/^\/cabinet/i.test(text)) {
      const user = await upsertBotUser(from);
      if (user.isBanned) {
        await sendMessage(chatId, "доступ закрыт");
        return { type: "banned" };
      }
      if (user.role === "admin" || (await isChannelAdmin(String(from.id)))) {
        await showAdminHome(chatId);
      } else if (await isTrafferBotUser(user)) {
        await showTrafferHome(chatId, user);
      } else {
        await showClientGreeting(chatId, from);
      }
      return { type: "cabinet" };
    }
    return handleStart(message);
  }

  if (await handleRoleCommand(chatId, String(from.id), text)) {
    return { type: "role_cmd" };
  }

  const telegramId = String(from.id);
  const sess = await getSession(telegramId);
  if (sess.scene !== "idle") {
    if (await handleAdminText(chatId, telegramId, text)) {
      return { type: "fsm_admin" };
    }
    if (await handleClientText(chatId, from, text)) {
      return { type: "fsm_client" };
    }
    const user = await upsertBotUser(from);
    if (await handleTrafferText(chatId, from, text, user)) {
      return { type: "fsm_traffer" };
    }
    // unknown scene — reset
    const payload = parsePayload(sess.payload);
    void payload;
    await clearScene(telegramId);
  }

  return { ignored: true };
}

export async function handleUpdate(update: TgUpdate) {
  await ensureBotProducts();

  if (update.chat_member) {
    return handleChatMember(update.chat_member);
  }
  if (update.callback_query) {
    return routeCallback(update.callback_query);
  }
  if (update.message) {
    return handleMessage(update.message);
  }
  return { ignored: true };
}
