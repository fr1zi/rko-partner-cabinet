"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ALL_STATUSES, STATUS_LABELS } from "@/lib/status";
import type { ClientStatus } from "@/lib/types";

type PartnerOpt = { id: string; label: string; refCode: string };
type ProductOpt = { name: string; premium: number };

export function CreateLeadForm({
  partners,
  products,
}: {
  partners: PartnerOpt[];
  products: ProductOpt[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const defaultProduct = products[0]?.name || "РКО (открытие счёта)";
  const [form, setForm] = useState({
    partnerId: partners[0]?.id || "",
    name: "",
    telegramUsername: "",
    phone: "",
    product: defaultProduct,
    status: "new" as ClientStatus,
    commission: String(products[0]?.premium ?? 3500),
    comment: "",
  });
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoPremium, setAutoPremium] = useState(true);

  function onProductChange(product: string) {
    const match = products.find((p) => p.name === product);
    setForm((prev) => ({
      ...prev,
      product,
      ...(autoPremium && match ? { commission: String(match.premium) } : {}),
    }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setOk("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerId: form.partnerId,
          name: form.name.trim(),
          telegramUsername: form.telegramUsername.trim() || null,
          phone: form.phone.trim() || null,
          product: form.product,
          status: form.status,
          commission: Number(form.commission) || 0,
          comment: form.comment.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка");
        return;
      }
      setOk("Лид добавлен");
      setForm((prev) => ({
        ...prev,
        name: "",
        telegramUsername: "",
        phone: "",
        comment: "",
        status: "new",
      }));
      router.refresh();
    } catch {
      setError("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }

  if (partners.length === 0) {
    return (
      <div className="ui-card p-4 text-sm text-slate-400">
        Сначала создайте траффера — затем можно вручную заносить лиды.
      </div>
    );
  }

  return (
    <div className="ui-card p-5 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white text-lg">Добавить лид вручную</h2>
          <p className="text-sm text-slate-400 mt-1">
            Лиды приходят из Telegram. Админ заносит человека, статус и премию.
          </p>
        </div>
        <button
          type="button"
          className={open ? "ui-btn-secondary shrink-0" : "ui-btn-primary shrink-0"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Скрыть" : "Новый лид"}
        </button>
      </div>

      {open ? (
        <form onSubmit={onSubmit} className="space-y-4 border-t border-border pt-4">
          {error ? (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm px-3 py-2">
              {error}
            </div>
          ) : null}
          {ok ? (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm px-3 py-2">
              {ok}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="ui-label text-xs">Траффер *</label>
              <select
                className="ui-input"
                required
                value={form.partnerId}
                onChange={(e) => setForm({ ...form, partnerId: e.target.value })}
              >
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} · {p.refCode}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="ui-label text-xs">Имя / компания *</label>
              <input
                className="ui-input"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="ИП Иванов / @username"
              />
            </div>
            <div>
              <label className="ui-label text-xs">Telegram @username</label>
              <input
                className="ui-input"
                value={form.telegramUsername}
                onChange={(e) =>
                  setForm({ ...form, telegramUsername: e.target.value })
                }
                placeholder="@client"
              />
            </div>
            <div>
              <label className="ui-label text-xs">Телефон (опц.)</label>
              <input
                className="ui-input"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+7 …"
              />
            </div>
            <div>
              <label className="ui-label text-xs">Статус</label>
              <select
                className="ui-input"
                value={form.status}
                onChange={(e) =>
                  setForm({
                    ...form,
                    status: e.target.value as ClientStatus,
                  })
                }
              >
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="ui-label text-xs">Продукт</label>
              <select
                className="ui-input"
                value={form.product}
                onChange={(e) => onProductChange(e.target.value)}
              >
                {products.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} ({p.premium} ₽)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="ui-label text-xs">Премия ₽</label>
              <input
                type="number"
                className="ui-input"
                value={form.commission}
                onChange={(e) => {
                  setAutoPremium(false);
                  setForm({ ...form, commission: e.target.value });
                }}
                min={0}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="ui-label text-xs">Комментарий</label>
              <input
                className="ui-input"
                value={form.comment}
                onChange={(e) => setForm({ ...form, comment: e.target.value })}
                placeholder="Из Telegram-чата…"
              />
            </div>
            <label className="sm:col-span-2 flex items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={autoPremium}
                onChange={(e) => setAutoPremium(e.target.checked)}
              />
              Подставлять премию из прайса при смене продукта
            </label>
          </div>

          <button type="submit" disabled={loading} className="ui-btn-primary">
            {loading ? "Сохранение…" : "Добавить лид"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
