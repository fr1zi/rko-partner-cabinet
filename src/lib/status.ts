import type { ClientStatus, CommissionStatus } from "./types";

export const STATUS_LABELS: Record<ClientStatus, string> = {
  new: "Новая",
  application: "Заявка",
  approved: "Одобрено",
  issued: "Выдано",
  paid: "Оплачено",
  rejected: "Отклонено",
};

export const STATUS_COLORS: Record<ClientStatus, string> = {
  new: "bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30",
  application: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30",
  approved: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30",
  issued: "bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30",
  paid: "bg-green-500/15 text-green-300 ring-1 ring-green-500/30",
  rejected: "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30",
};

export const COMMISSION_LABELS: Record<CommissionStatus, string> = {
  pending: "Ожидает",
  paid: "Выплачено",
};

export const ALL_STATUSES: ClientStatus[] = [
  "new",
  "application",
  "approved",
  "issued",
  "paid",
  "rejected",
];

export function formatMoney(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(value: Date | string) {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatDateShort(value: Date | string) {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}
