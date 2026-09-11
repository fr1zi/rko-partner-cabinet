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
    adjust: "Корректировка",
  };
  return map[type] || type;
}
