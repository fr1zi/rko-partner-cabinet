"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SettingsForm({
  defaultCommission,
}: {
  defaultCommission: number;
}) {
  const router = useRouter();
  const [value, setValue] = useState(String(defaultCommission));
  const [msg, setMsg] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    setError(false);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultCommission: Number(value) || 0 }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMsg(data.error || "Ошибка");
        setError(true);
        return;
      }
      setMsg("Сохранено");
      router.refresh();
    } catch {
      setMsg("Ошибка сети");
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="ui-card p-5 sm:p-6 space-y-4">
      <label className="block">
        <span className="ui-label">
          Премия по умолчанию (₽), если продукт не найден в прайсе
        </span>
        <input
          type="number"
          className="ui-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          min={0}
          required
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={loading} className="ui-btn-primary">
          {loading ? "Сохранение…" : "Сохранить"}
        </button>
        {msg ? (
          <p
            className={`text-sm ${
              error ? "text-rose-400" : "text-emerald-400"
            }`}
          >
            {msg}
          </p>
        ) : null}
      </div>
    </form>
  );
}
