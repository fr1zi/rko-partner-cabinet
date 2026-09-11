import { STATUS_COLORS, STATUS_LABELS, COMMISSION_LABELS } from "@/lib/status";
import type { ClientStatus, CommissionStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: ClientStatus }) {
  return (
    <span className={`ui-badge ${STATUS_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function CommissionBadge({ status }: { status: CommissionStatus }) {
  const cls =
    status === "paid"
      ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
      : "bg-slate-500/15 text-slate-300 ring-1 ring-slate-500/30";
  return (
    <span className={`ui-badge ${cls}`}>{COMMISSION_LABELS[status]}</span>
  );
}
