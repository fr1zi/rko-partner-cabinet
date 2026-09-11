import Link from "next/link";
import { ALL_STATUSES, STATUS_LABELS } from "@/lib/status";
import type { ClientStatus } from "@/lib/types";

export function StatusFilterChips({
  basePath,
  active,
}: {
  basePath: string;
  active?: ClientStatus;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href={basePath}
        className={`ui-chip ${!active ? "ui-chip-active" : "ui-chip-idle"}`}
      >
        Все
      </Link>
      {ALL_STATUSES.map((s) => (
        <Link
          key={s}
          href={`${basePath}?status=${s}`}
          className={`ui-chip ${
            active === s ? "ui-chip-active" : "ui-chip-idle"
          }`}
        >
          {STATUS_LABELS[s]}
        </Link>
      ))}
    </div>
  );
}
