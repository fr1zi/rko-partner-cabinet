"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/status";

type Rate = {
  id: string;
  productKey: string;
  productName: string;
  premium: number;
  sortOrder: number;
  active: boolean;
};

export function PriceListForm({ initialRates }: { initialRates: Rate[] }) {
  const router = useRouter();
  const [rates, setRates] = useState(
    initialRates.map((r) => ({
      ...r,
      premiumStr: String(r.premium),
    }))
  );
  const [msg, setMsg] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  function updateRow(
    id: string,
    patch: Partial<{ productName: string; premiumStr: string; active: boolean }>
  ) {
    setRates((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    setError(false);
    try {
      const res = await fetch("/api/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rates: rates.map((r) => ({
            id: r.id,
            productName: r.productName,
            premium: Number(r.premiumStr) || 0,
            sortOrder: r.sortOrder,
            active: r.active,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMsg(data.error || "Ошибка");
        setError(true);
        return;
      }
      setMsg("Прайс сохранён");
      router.refresh();
    } catch {
      setMsg("Ошибка сети");
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="ui-card p-5 sm:p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-white">
          Прайс премий за открытия продуктов
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Эти ставки показываются трафферам и подставляются в заявки
        </p>
      </div>

      <div className="space-y-3">
        {rates.map((r) => (
          <div
            key={r.id}
            className={`rounded-xl border p-4 transition ${
              r.active
                ? "border-border bg-surface-raised"
                : "border-border bg-surface opacity-70"
            }`}
          >
            <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="flex-1 min-w-0">
                <label className="ui-label text-xs">Название продукта</label>
                <input
                  className="ui-input"
                  value={r.productName}
                  onChange={(e) =>
                    updateRow(r.id, { productName: e.target.value })
                  }
                  required
                />
                <p className="text-[10px] text-slate-600 mt-1 font-mono">
                  {r.productKey}
                </p>
              </div>
              <div className="w-full sm:w-36">
                <label className="ui-label text-xs">Премия ₽</label>
                <input
                  type="number"
                  min={0}
                  className="ui-input"
                  value={r.premiumStr}
                  onChange={(e) =>
                    updateRow(r.id, { premiumStr: e.target.value })
                  }
                  required
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-300 pb-2.5 shrink-0">
                <input
                  type="checkbox"
                  checked={r.active}
                  onChange={(e) =>
                    updateRow(r.id, { active: e.target.checked })
                  }
                />
                Активен
              </label>
            </div>
            <p className="mt-2 text-xs text-emerald-400/80">
              Превью: {formatMoney(Number(r.premiumStr) || 0)}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={loading} className="ui-btn-primary">
          {loading ? "Сохранение…" : "Сохранить прайс"}
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
