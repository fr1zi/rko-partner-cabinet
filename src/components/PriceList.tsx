import { formatMoney } from "@/lib/status";

export type PriceListItem = {
  productName: string;
  premium: number;
};

export function PriceList({
  rates,
  compact = false,
  title = "Прайс премий за открытия продуктов",
}: {
  rates: PriceListItem[];
  compact?: boolean;
  title?: string;
}) {
  return (
    <section
      className={`relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-surface to-cyan-500/5 shadow-card ${
        compact ? "p-4 sm:p-5" : "p-5 sm:p-7"
      }`}
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-400/10 blur-3xl" />
      <div className="relative space-y-1 mb-5">
        <p className="text-xs uppercase tracking-[0.16em] text-emerald-400 font-semibold">
          Мотивация партнёров
        </p>
        <h2
          className={`font-bold text-white ${
            compact ? "text-base sm:text-lg" : "text-xl sm:text-2xl"
          }`}
        >
          {title}
        </h2>
        <p className="text-sm text-slate-400 max-w-2xl">
          Фиксированные премии за привлечение взрослых предпринимателей и ООО.
          Только ИП и юридические лица.
        </p>
      </div>

      {rates.length === 0 ? (
        <p className="text-sm text-slate-500">Прайс пока не настроен</p>
      ) : compact ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface scrollbar-thin">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-raised text-left text-slate-400">
              <tr>
                <th className="px-4 py-2.5 font-medium">Продукт</th>
                <th className="px-4 py-2.5 font-medium text-right">
                  Премия
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rates.map((r) => (
                <tr key={r.productName}>
                  <td className="px-4 py-2.5 text-slate-200">{r.productName}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-emerald-400">
                    {formatMoney(r.premium)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rates.map((r) => (
            <div
              key={r.productName}
              className="rounded-xl border border-border bg-surface p-4 backdrop-blur"
            >
              <p className="text-sm font-medium text-slate-200">
                {r.productName}
              </p>
              <p className="mt-2 text-2xl font-bold text-emerald-400">
                {formatMoney(r.premium)}
              </p>
              <p className="text-xs text-slate-500 mt-1">премия за открытие</p>
            </div>
          ))}
        </div>
      )}

      <p className="relative mt-5 text-xs text-slate-500">
        Премия фиксируется по прайсу на момент создания заявки. Выплата — после
        подтверждения открытия продукта банком.
      </p>
    </section>
  );
}
