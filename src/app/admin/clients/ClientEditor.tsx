"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ALL_STATUSES, STATUS_LABELS } from "@/lib/status";
import type { ClientStatus, CommissionStatus } from "@/lib/types";

type ProductOption = { name: string; premium: number };

export function ClientEditor({
  id,
  status,
  commission,
  commissionStatus,
  amount,
  product,
  productOptions = [],
}: {
  id: string;
  status: ClientStatus;
  commission: number;
  commissionStatus: CommissionStatus;
  amount: number | null;
  product: string;
  productOptions?: ProductOption[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    status,
    commission: String(commission),
    commissionStatus,
    amount: amount != null ? String(amount) : "",
    product,
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [autoPremium, setAutoPremium] = useState(true);

  function onProductChange(nextProduct: string) {
    const match = productOptions.find((p) => p.name === nextProduct);
    setForm((prev) => ({
      ...prev,
      product: nextProduct,
      ...(autoPremium && match
        ? { commission: String(match.premium) }
        : {}),
    }));
  }

  async function save() {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/clients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          status: form.status,
          commission: Number(form.commission) || 0,
          commissionStatus: form.commissionStatus,
          amount: form.amount === "" ? null : Number(form.amount),
          product: form.product,
          applyPriceList: autoPremium,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMsg(data.error || "Ошибка");
        return;
      }
      setMsg("Сохранено");
      router.refresh();
    } catch {
      setMsg("Ошибка сети");
    } finally {
      setSaving(false);
    }
  }

  const knownProducts = productOptions.map((p) => p.name);
  const productInList = knownProducts.includes(form.product);

  return (
    <div className="w-full min-w-[240px] max-w-xs space-y-2 rounded-xl bg-surface-raised p-3 border border-border">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-slate-400 col-span-2">
          Статус
          <select
            className="ui-input mt-1 py-1.5"
            value={form.status}
            onChange={(e) =>
              setForm({ ...form, status: e.target.value as ClientStatus })
            }
          >
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-400 col-span-2">
          Продукт
          <select
            className="ui-input mt-1 py-1.5"
            value={productInList ? form.product : "__custom__"}
            onChange={(e) => {
              if (e.target.value === "__custom__") return;
              onProductChange(e.target.value);
            }
            }
          >
            {!productInList ? (
              <option value="__custom__">{form.product}</option>
            ) : null}
            {productOptions.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name} ({p.premium} ₽)
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-400">
          Премия ₽
          <input
            type="number"
            className="ui-input mt-1 py-1.5"
            value={form.commission}
            onChange={(e) => {
              setAutoPremium(false);
              setForm({ ...form, commission: e.target.value });
            }}
          />
        </label>
        <label className="text-xs text-slate-400">
          Выплата
          <select
            className="ui-input mt-1 py-1.5"
            value={form.commissionStatus}
            onChange={(e) =>
              setForm({
                ...form,
                commissionStatus: e.target.value as CommissionStatus,
              })
            }
          >
            <option value="pending">Ожидает</option>
            <option value="paid">Выплачено</option>
          </select>
        </label>
        <label className="text-xs text-slate-400 col-span-2">
          Сумма ₽
          <input
            type="number"
            className="ui-input mt-1 py-1.5"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
        </label>
        <label className="text-xs text-slate-400 col-span-2 flex items-center gap-2">
          <input
            type="checkbox"
            checked={autoPremium}
            onChange={(e) => setAutoPremium(e.target.checked)}
          />
          Подставлять премию из прайса при смене продукта
        </label>
      </div>
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="ui-btn-primary w-full py-1.5 text-xs"
      >
        {saving ? "Сохранение…" : "Сохранить"}
      </button>
      {msg ? <p className="text-xs text-center text-slate-400">{msg}</p> : null}
    </div>
  );
}
