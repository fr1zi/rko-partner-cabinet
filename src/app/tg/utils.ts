export function money(n: number) {
  return `${Math.round(n).toLocaleString("ru-RU")} ₽`;
}

export function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
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
    approved: "Одобрено",
    pending: "Ожидает",
    none: "Нет заявок",
    new: "Новая",
    rejected: "Отклонено",
    paid: "Выплачено",
    duplicate: "Дубль",
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
    credit_lead: "Начисление",
    debit_withdraw: "Вывод",
    adjust: "Корректировка",
  };
  return map[type] || type;
}
