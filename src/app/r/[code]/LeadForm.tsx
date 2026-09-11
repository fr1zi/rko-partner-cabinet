"use client";

import { useState } from "react";

type ProductOption = { name: string; premium: number };

export function LeadForm({
  refCode,
  products = [],
}: {
  refCode: string;
  products?: ProductOption[];
}) {
  const defaultProduct = products[0]?.name || "РКО (открытие счёта)";
  const [form, setForm] = useState({
    name: "",
    phone: "",
    inn: "",
    comment: "",
    product: defaultProduct,
  });
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, refCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка отправки");
        return;
      }
      setDone(true);
    } catch {
      setError("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-5 text-center space-y-2">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-lg">
          ✓
        </div>
        <p className="text-emerald-300 font-medium">Заявка принята</p>
        <p className="text-sm text-slate-400">
          Мы свяжемся с вами по указанному телефону в рабочие часы.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3.5">
      {error ? (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm px-3 py-2.5">
          {error}
        </div>
      ) : null}
      <div>
        <label className="ui-label">ФИО / название *</label>
        <input
          required
          className="ui-input"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Иванов Иван Иванович / ООО «Ромашка»"
        />
      </div>
      <div>
        <label className="ui-label">Телефон *</label>
        <input
          required
          type="tel"
          className="ui-input"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="+7 900 000-00-00"
        />
      </div>
      {products.length > 0 ? (
        <div>
          <label className="ui-label">Интересующий продукт *</label>
          <select
            required
            className="ui-input"
            value={form.product}
            onChange={(e) => setForm({ ...form, product: e.target.value })}
          >
            {products.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div>
        <label className="ui-label">ИНН (необязательно)</label>
        <input
          className="ui-input"
          value={form.inn}
          onChange={(e) => setForm({ ...form, inn: e.target.value })}
          placeholder="10 или 12 цифр"
        />
      </div>
      <div>
        <label className="ui-label">Комментарий</label>
        <textarea
          className="ui-input min-h-[88px]"
          value={form.comment}
          onChange={(e) => setForm({ ...form, comment: e.target.value })}
          placeholder="Форма бизнеса, город, пожелания"
        />
      </div>
      <p className="text-xs text-slate-500">
        Отправляя заявку, вы подтверждаете, что вам исполнилось 18 лет и вы
        представляете ИП или ООО.
      </p>
      <button
        type="submit"
        disabled={loading}
        className="ui-btn-primary w-full py-3"
      >
        {loading ? "Отправка…" : "Отправить заявку"}
      </button>
    </form>
  );
}
