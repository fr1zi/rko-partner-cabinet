export const AUDIT_ACTIONS = [
  "lead_status_change",
  "leads_bulk_status",
  "remove_order_line",
  "restore_order_line",
  "set_balance",
  "user_adjust",
  "product_hot",
  "product_create",
  "product_delete",
  "wd_reject",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  lead_status_change: "Статус заявки",
  leads_bulk_status: "Массовый статус",
  remove_order_line: "Удаление из чека",
  restore_order_line: "Возврат в чек",
  set_balance: "Баланс",
  user_adjust: "Корректировка баланса",
  product_hot: "HOT",
  product_create: "Создание оффера",
  product_delete: "Удаление оффера",
  wd_reject: "Отклонение вывода",
};
