export function money(n: number) {
  return `${Math.round(n).toLocaleString("ru-RU")} ₽`;
}

export function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      timeZone: "Asia/Yekaterinburg",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function statusLabel(status: string) {
  const map: Record<string, string> = {
    approved: "Ждём выплату",
    pending: "Ожидает",
    none: "Нет заявок",
    new: "В обработке",
    processing: "В обработке",
    awaiting_payout: "Ждём выплату",
    rejected: "Отклонено",
    paid: "Выплачено",
    duplicate: "В обработке",
  };
  return map[status] || status;
}

export function roleLabel(role: string | null | undefined) {
  if (role === "ADMIN") return "Админ";
  if (role === "PARTNER") return "Траффер";
  if (role === "SUBSCRIBER") return "Подписчик";
  return "Гость";
}

export function txTypeLabel(type: string) {
  const map: Record<string, string> = {
    credit_lead: "Премия траффера",
    credit_sub: "Начисление подписчику",
    debit_withdraw: "Вывод",
    debit_reverse_lead: "Сторно премии",
    debit_reverse_sub: "Сторно выплаты",
    adjust: "Корректировка",
  };
  return map[type] || type;
}

/** Prefer @username; fall back to telegram id — never firstName as primary. */
export function tgHandle(
  username?: string | null,
  telegramId?: string | null,
  fallback?: string | null
) {
  const u = (username || "").replace(/^@/, "").trim();
  if (u) return `@${u}`;
  if (telegramId) return `id ${telegramId}`;
  const f = (fallback || "").trim();
  return f || "—";
}

export function formatProductLabel(
  title?: string | null,
  bank?: string | null
) {
  const t = (title || "").trim() || "Продукт";
  const b = (bank || "").trim();
  return b ? `${t} · ${b}` : t;
}

/** Withdrawal closed after payout or reject. */
export function isClosedWithdrawal(status: string) {
  return status === "paid" || status === "rejected";
}

/** Product order closed when paid or rejected; awaiting_payout stays open for admin action. */
export function isClosedLead(status: string) {
  const st =
    status === "new" || status === "duplicate"
      ? "processing"
      : status === "approved"
        ? "awaiting_payout"
        : status;
  return st === "paid" || st === "rejected";
}

/** Subscriber «закрытые заказы»: payout tracking (awaiting + paid + rejected). */
export function isSubscriberClosedOrder(status: string) {
  const st =
    status === "new" || status === "duplicate"
      ? "processing"
      : status === "approved"
        ? "awaiting_payout"
        : status;
  return st === "awaiting_payout" || st === "paid" || st === "rejected";
}

export function matchesUsernameQuery(
  query: string,
  username?: string | null,
  telegramId?: string | null,
  extra?: string | null
) {
  const q = query.trim().toLowerCase().replace(/^@/, "");
  if (!q) return true;
  const u = (username || "").toLowerCase().replace(/^@/, "");
  const id = (telegramId || "").toLowerCase();
  const e = (extra || "").toLowerCase();
  return u.includes(q) || id.includes(q) || e.includes(q) || `@${u}`.includes(q);
}
