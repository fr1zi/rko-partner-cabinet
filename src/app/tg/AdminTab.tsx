"use client";

import { useEffect, useMemo, useState } from "react";
import { BANKS } from "@/lib/banks";
import {
  estimateBankCpa,
  isAdminRefAttribution,
  ownerMarginFromPayouts,
  ownerPayout,
  resolveProductPayouts,
} from "@/lib/productDefaults";
import type { AdminSubTab } from "./types";
import { LeaderboardList } from "./Leaderboard";
import { formatOrderNumber, orderIdMatchesQuery } from "@/lib/orderNumber";
import {
  formatDate,
  formatProductLabel,
  isClosedWithdrawal,
  matchesUsernameQuery,
  money,
  statusLabel,
  tgHandle,
} from "./utils";

const SUBS: Array<[AdminSubTab, string]> = [
  ["stats", "Итоги"],
  ["products", "Цены"],
  ["premiums", "Премии"],
  ["leads", "Заказы"],
  ["withdrawals", "Выводы"],
  ["users", "Юзеры"],
];

export function AdminTab({
  tab,
  setTab,
  data,
  onAction,
  loading,
  disabled,
}: {
  tab: AdminSubTab;
  setTab: (t: AdminSubTab) => void;
  data: Record<string, unknown> | null;
  onAction: (body: Record<string, unknown>) => Promise<void>;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="tg-stack">
      <div className="tg-admin-chips">
        {SUBS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={
              tab === key ? "tg-chip tg-chip-active" : "tg-chip"
            }
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <div className="tg-empty">Загрузка…</div>
      ) : (
        <AdminBody
          tab={tab}
          data={data}
          onAction={onAction}
          disabled={disabled}
        />
      )}
    </div>
  );
}

function AdminBody({
  tab,
  data,
  onAction,
  disabled,
}: {
  tab: AdminSubTab;
  data: Record<string, unknown> | null;
  onAction: (body: Record<string, unknown>) => Promise<void>;
  disabled?: boolean;
}) {
  if (!data) return <div className="tg-empty">Нет данных</div>;

  if (tab === "stats") {
    const s = (data.stats || {}) as Record<string, unknown>;
    return (
      <div className="tg-stack">
        <div className="tg-stat-grid">
          <StatTile
            label="Подписчики"
            value={String(s.channelSubscribers ?? 0)}
            wide
          />
          <StatTile label="Трафферы" value={String(s.trafters ?? 0)} />
          <StatTile label="Клиенты" value={String(s.clients ?? 0)} />
          <StatTile label="Заявки" value={String(s.leads ?? 0)} />
          <StatTile
            label="Прибыль за день"
            value={String(s.companyProfitTodayLabel ?? "0")}
          />
          <StatTile
            label="Прибыль за месяц"
            value={String(s.companyProfitMonthLabel ?? "0")}
          />
          <StatTile
            label="Общая прибыль"
            value={String(s.companyProfitLabel ?? "0")}
            wide
          />
        </div>
        <button
          type="button"
          className="tg-btn-secondary w-full text-sm"
          disabled={disabled}
          onClick={() => void onAction({ action: "send_daily_digest" })}
        >
          Дашборд сейчас
        </button>
        <TaxReportPanel
          initial={(data.taxReport || null) as TaxReportState | null}
        />
        <LeaderboardAdminPanel
          meta={(data.leaderboardMeta || null) as LeaderboardMetaState | null}
          rows={(data.leaderboard || []) as Array<{
            rank: number;
            userId: string;
            username: string | null;
            telegramId: string;
            earned: number;
            earnedLabel: string;
            leadsPaid: number;
          }>}
          onAction={onAction}
          disabled={disabled}
        />
      </div>
    );
  }

  if (tab === "products") {
    return (
      <AdminProductsEditor
        mode="prices"
        products={(data.products || []) as AdminProductRow[]}
        onAction={onAction}
        disabled={disabled}
      />
    );
  }

  if (tab === "premiums") {
    return (
      <AdminProductsEditor
        mode="premiums"
        products={(data.products || []) as AdminProductRow[]}
        onAction={onAction}
        disabled={disabled}
      />
    );
  }

  if (tab === "leads") {
    return (
      <AdminLeadsPanel
        leads={(data.leads || []) as AdminLeadRow[]}
        onAction={onAction}
        disabled={disabled}
      />
    );
  }

  if (tab === "withdrawals") {
    return (
      <AdminWithdrawalsPanel
        list={(data.withdrawals || []) as AdminWdRow[]}
        onAction={onAction}
        disabled={disabled}
      />
    );
  }

  if (tab === "users") {
    const users = (data.users || []) as AdminUserRow[];
    if (users.length === 0) return <div className="tg-empty">Пока нет юзеров</div>;
    return (
      <AdminUsersPanel
        users={users}
        onAction={onAction}
        disabled={disabled}
      />
    );
  }

  return null;
}

type LeaderboardMetaState = {
  speech?: string;
  prize?: string;
  periodDays?: number;
  periodStart?: string;
  periodEndsAt?: string | null;
  daysLeft?: number | null;
};

function LeaderboardAdminPanel({
  meta,
  rows,
  onAction,
  disabled,
}: {
  meta: LeaderboardMetaState | null;
  rows: Array<{
    rank: number;
    userId: string;
    username: string | null;
    telegramId: string;
    earned: number;
    earnedLabel: string;
    leadsPaid: number;
  }>;
  onAction: (body: Record<string, unknown>) => Promise<void>;
  disabled?: boolean;
}) {
  const [speech, setSpeech] = useState(meta?.speech || "");
  const [prize, setPrize] = useState(meta?.prize || "");
  const [periodDays, setPeriodDays] = useState(
    String(meta?.periodDays ?? 30)
  );

  useEffect(() => {
    setSpeech(meta?.speech || "");
    setPrize(meta?.prize || "");
    setPeriodDays(String(meta?.periodDays ?? 30));
  }, [meta?.speech, meta?.prize, meta?.periodDays, meta?.periodStart]);

  return (
    <div className="tg-stack">
      <section className="tg-card space-y-3">
        <h3 className="tg-card-title">Лидерборд — настройки</h3>
        <label className="block space-y-1">
          <span className="tg-muted text-xs">Награда (что получает топ)</span>
          <input
            className="tg-input w-full"
            value={prize}
            disabled={disabled}
            onChange={(e) => setPrize(e.target.value)}
            placeholder="Например: AirPods / 10 000 ₽ / мерка с основателем"
          />
        </label>
        <label className="block space-y-1">
          <span className="tg-muted text-xs">Мотивационная речь</span>
          <textarea
            className="tg-input w-full min-h-[88px]"
            value={speech}
            disabled={disabled}
            onChange={(e) => setSpeech(e.target.value)}
            placeholder="Текст над таблицей лидеров"
          />
        </label>
        <label className="block space-y-1">
          <span className="tg-muted text-xs">Срок периода (дней)</span>
          <input
            className="tg-input w-full"
            type="number"
            min={1}
            max={365}
            value={periodDays}
            disabled={disabled}
            onChange={(e) => setPeriodDays(e.target.value)}
          />
        </label>
        {meta?.daysLeft != null ? (
          <p className="tg-muted text-xs">
            Сейчас осталось {meta.daysLeft} дн. до конца окна.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="tg-btn-primary"
            disabled={disabled}
            onClick={() =>
              onAction({
                action: "leaderboard_save",
                speech,
                prize,
                periodDays: Number(periodDays) || 30,
              })
            }
          >
            Сохранить
          </button>
          <button
            type="button"
            className="tg-btn-secondary"
            disabled={disabled}
            onClick={() => {
              if (
                typeof window !== "undefined" &&
                !window.confirm(
                  "Сбросить лидерборд? Очки начнут считаться с этого момента."
                )
              ) {
                return;
              }
              void onAction({ action: "leaderboard_reset" });
            }}
          >
            Сброс периода
          </button>
        </div>
      </section>
      <section>
        <h3 className="tg-section-label">Текущий топ</h3>
        <LeaderboardList rows={rows} meta={meta} limit={10} />
      </section>
    </div>
  );
}

function StatTile({
  label,
  value,
  wide,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "tg-stat-tile tg-stat-wide" : "tg-stat-tile"}>
      <p className="tg-stat-label">{label}</p>
      <p className="tg-stat-value">{value}</p>
    </div>
  );
}

type TaxReportRowState = {
  id: string;
  date: string;
  orderId: string | null;
  client: string;
  product: string;
  bankCpa: number;
  subscriberPayout: number;
  trafferPayout: number;
  companyProfit: number;
  status: string;
  refType: "admin" | "traffer";
};

type TaxReportState = {
  month: string;
  summary: {
    bankCpa: number;
    bankCpaLabel: string;
    subscriberPayouts: number;
    subscriberPayoutsLabel: string;
    trafferPayouts: number;
    trafferPayoutsLabel: string;
    companyProfit: number;
    companyProfitLabel: string;
    paidPositions: number;
    withdrawalsPaid: number;
    withdrawalsPaidLabel: string;
    adminRefOwner: number;
    adminRefOwnerLabel: string;
  };
  rows: TaxReportRowState[];
};

function defaultYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthTitleRu(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const months = [
    "январь",
    "февраль",
    "март",
    "апрель",
    "май",
    "июнь",
    "июль",
    "август",
    "сентябрь",
    "октябрь",
    "ноябрь",
    "декабрь",
  ];
  const mi = (m || 1) - 1;
  const name = months[mi] ?? ym;
  return `${name} ${y || ""} г.`.trim();
}

function formatTaxDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [y, mo, d] = value.slice(0, 10).split("-");
    return `${d}.${mo}.${y}`;
  }
  try {
    const dt = new Date(value);
    if (!Number.isNaN(dt.getTime())) {
      const dd = String(dt.getDate()).padStart(2, "0");
      const mm = String(dt.getMonth() + 1).padStart(2, "0");
      const yy = dt.getFullYear();
      return `${dd}.${mm}.${yy}`;
    }
  } catch {
    /* keep raw */
  }
  return value;
}

function refSourceLabel(refType: "admin" | "traffer") {
  return refType === "admin" ? "Админ" : "Траффер";
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function generatedTodayRu() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}.${mm}.${yy}`;
}

function downloadTaxCsv(report: TaxReportState) {
  const header = [
    "Дата",
    "Чек",
    "Клиент",
    "Продукт",
    "CPA",
    "Выплата_подписчику",
    "Выплата_трафферу",
    "Прибыль_компании",
    "Статус",
    "Источник_рефки",
  ];
  const lines = [header.join(",")];
  for (const r of report.rows) {
    const cells = [
      formatTaxDate(r.date),
      r.orderId || "",
      r.client,
      r.product,
      String(r.bankCpa),
      String(r.subscriberPayout),
      String(r.trafferPayout),
      String(r.companyProfit),
      statusLabel(r.status),
      refSourceLabel(r.refType),
    ].map((c) => {
      const s = String(c);
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    });
    lines.push(cells.join(","));
  }
  const blob = new Blob(["\uFEFF" + lines.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reestr-${report.month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadTaxDocx(month: string) {
  const res = await fetch(
    `/api/tg/bot-admin?tab=tax_docx&month=${encodeURIComponent(month)}`,
    { credentials: "include" }
  );
  if (!res.ok) {
    throw new Error(`Не удалось скачать Word (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reestr-${month}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

function printTaxReport(report: TaxReportState) {
  const s = report.summary;
  const period = monthTitleRu(report.month);
  const generated = generatedTodayRu();
  const totals = report.rows.reduce(
    (acc, r) => {
      acc.cpa += r.bankCpa;
      acc.sub += r.subscriberPayout;
      acc.traf += r.trafferPayout;
      acc.comp += r.companyProfit;
      return acc;
    },
    { cpa: 0, sub: 0, traf: 0, comp: 0 }
  );

  const summaryRows: Array<[string, string]> = [
    ["Оборот (банковский CPA)", money(s.bankCpa)],
    ["Выплаты подписчикам", money(s.subscriberPayouts)],
    ["Выплаты трафферам", money(s.trafferPayouts)],
    ["Прибыль компании", money(s.companyProfit)],
    ["в т.ч. рефка админов (55%)", money(s.adminRefOwner)],
    ["Выплаченные выводы", money(s.withdrawalsPaid)],
    ["Количество позиций", String(s.paidPositions)],
  ];

  const summaryHtml = summaryRows
    .map(
      ([k, v]) =>
        `<tr><th>${escapeHtml(k)}</th><td class="num">${escapeHtml(v)}</td></tr>`
    )
    .join("");

  const bodyRows = report.rows
    .map(
      (r, i) => `<tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(formatTaxDate(r.date))}</td>
      <td>${escapeHtml(r.client)}</td>
      <td>${escapeHtml(r.product)}</td>
      <td>${escapeHtml(r.orderId || "—")}</td>
      <td class="num">${escapeHtml(money(r.bankCpa))}</td>
      <td class="num">${escapeHtml(money(r.subscriberPayout))}</td>
      <td class="num">${escapeHtml(money(r.trafferPayout))}</td>
      <td class="num">${escapeHtml(money(r.companyProfit))}</td>
      <td>${escapeHtml(refSourceLabel(r.refType))}</td>
      <td>${escapeHtml(statusLabel(r.status))}</td>
    </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8"/>
<title>Реестр операций — ${escapeHtml(period)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Times New Roman", Times, serif;
    color: #000;
    background: #fff;
    margin: 0;
    padding: 0;
    font-size: 11pt;
    line-height: 1.35;
  }
  h1 {
    font-size: 14pt;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    margin: 0 0 6px;
    text-align: center;
  }
  .meta { font-size: 10pt; color: #222; margin: 2px 0; text-align: center; }
  .note { font-size: 9pt; color: #444; margin: 10px 0 14px; text-align: center; }
  h2 { font-size: 11pt; margin: 16px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  th, td { border: 1px solid #333; padding: 4px 6px; vertical-align: top; }
  th { background: #eee; text-align: left; font-weight: 600; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .sign { margin-top: 28px; font-size: 10pt; display: flex; justify-content: space-between; gap: 24px; }
  .brand { font-size: 9pt; color: #555; text-align: center; margin-top: 4px; }
</style>
</head>
<body>
  <h1>Реестр операций за месяц</h1>
  <p class="meta">Период: ${escapeHtml(period)}</p>
  <p class="meta">Сформирован: ${escapeHtml(generated)}</p>
  <p class="brand">РКО · партнёрский кабинет</p>
  <p class="note">Документ для внутреннего учёта и подготовки отчётности. Суммы в рублях.</p>

  <h2>Сводка</h2>
  <table>
    <tbody>${summaryHtml}</tbody>
  </table>

  <h2>Реестр</h2>
  <table>
    <thead>
      <tr>
        <th>№</th><th>Дата</th><th>Клиент</th><th>Продукт</th><th>Чек</th>
        <th>CPA</th><th>Подписчику</th><th>Трафферу</th><th>Компании</th>
        <th>Источник</th><th>Статус</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows || `<tr><td colspan="11">Нет позиций за выбранный месяц</td></tr>`}
      <tr>
        <th colspan="5">Итого</th>
        <td class="num"><strong>${escapeHtml(money(totals.cpa))}</strong></td>
        <td class="num"><strong>${escapeHtml(money(totals.sub))}</strong></td>
        <td class="num"><strong>${escapeHtml(money(totals.traf))}</strong></td>
        <td class="num"><strong>${escapeHtml(money(totals.comp))}</strong></td>
        <td colspan="2"></td>
      </tr>
    </tbody>
  </table>

  <div class="sign">
    <span>Ответственный _______________</span>
    <span>Дата _______________</span>
  </div>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;

  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function TaxReportPanel({
  initial,
}: {
  initial: TaxReportState | null;
}) {
  const [month, setMonth] = useState(
    () => initial?.month || defaultYearMonth()
  );
  const [report, setReport] = useState<TaxReportState | null>(initial);
  const [loading, setLoading] = useState(false);
  const [docxLoading, setDocxLoading] = useState(false);

  useEffect(() => {
    if (initial?.month === month) {
      setReport(initial);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/tg/bot-admin?tab=stats&month=${encodeURIComponent(month)}`,
          { credentials: "include" }
        );
        if (!res.ok) return;
        const data = (await res.json()) as { taxReport?: TaxReportState };
        if (!cancelled && data.taxReport) setReport(data.taxReport);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [month, initial]);

  const s = report?.summary;
  const periodTitle = monthTitleRu(month);
  const generated = generatedTodayRu();

  const totals = useMemo(() => {
    const rows = report?.rows || [];
    return rows.reduce(
      (acc, r) => {
        acc.cpa += r.bankCpa;
        acc.sub += r.subscriberPayout;
        acc.traf += r.trafferPayout;
        acc.comp += r.companyProfit;
        return acc;
      },
      { cpa: 0, sub: 0, traf: 0, comp: 0 }
    );
  }, [report]);

  return (
    <section className="tg-stack">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="tg-section-label">Бумажный отчёт</h3>
          <p className="tg-muted text-xs mt-1">
            Реестр для бухгалтерии / налоговой. Печать, CSV и Word.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block space-y-1">
            <span className="tg-muted text-xs">Месяц</span>
            <input
              className="tg-input"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="tg-btn-primary text-sm"
            disabled={!report || !s}
            onClick={() => report && printTaxReport(report)}
          >
            Печать / PDF
          </button>
          <button
            type="button"
            className="tg-btn-secondary text-sm"
            disabled={!report || report.rows.length === 0}
            onClick={() => report && downloadTaxCsv(report)}
          >
            Скачать CSV
          </button>
          <button
            type="button"
            className="tg-btn-secondary text-sm"
            disabled={!report || docxLoading}
            onClick={async () => {
              setDocxLoading(true);
              try {
                await downloadTaxDocx(month);
              } catch (e) {
                console.error(e);
                alert(
                  e instanceof Error
                    ? e.message
                    : "Не удалось скачать Word"
                );
              } finally {
                setDocxLoading(false);
              }
            }}
          >
            {docxLoading ? "Word…" : "Скачать Word"}
          </button>
          {loading ? (
            <span className="tg-muted text-xs self-center">Обновление…</span>
          ) : null}
        </div>
      </div>

      {loading && !report ? (
        <div className="tg-empty">Загрузка отчёта…</div>
      ) : !s ? (
        <div className="tg-empty">Нет данных за месяц</div>
      ) : (
        <div className="tg-tax-paper">
          <div className="tg-tax-doc-title">Реестр операций за месяц</div>
          <p className="tg-tax-meta">Период: {periodTitle}</p>
          <p className="tg-tax-meta">Сформирован: {generated}</p>
          <p className="tg-tax-meta">РКО · партнёрский кабинет</p>
          <p className="tg-tax-meta" style={{ marginTop: 8 }}>
            Документ для внутреннего учёта и подготовки отчётности. Суммы в
            рублях.
          </p>

          <h4 style={{ margin: "14px 0 8px" }}>Сводка</h4>
          <table className="tg-tax-summary">
            <tbody>
              <tr>
                <th>Оборот (банковский CPA)</th>
                <td className="tg-tax-num">{money(s.bankCpa)}</td>
              </tr>
              <tr>
                <th>Выплаты подписчикам</th>
                <td className="tg-tax-num">{money(s.subscriberPayouts)}</td>
              </tr>
              <tr>
                <th>Выплаты трафферам</th>
                <td className="tg-tax-num">{money(s.trafferPayouts)}</td>
              </tr>
              <tr>
                <th>Прибыль компании</th>
                <td className="tg-tax-num">{money(s.companyProfit)}</td>
              </tr>
              <tr>
                <th>в т.ч. рефка админов (55%)</th>
                <td className="tg-tax-num">{money(s.adminRefOwner)}</td>
              </tr>
              <tr>
                <th>Выплаченные выводы</th>
                <td className="tg-tax-num">{money(s.withdrawalsPaid)}</td>
              </tr>
              <tr>
                <th>Количество позиций</th>
                <td className="tg-tax-num">{s.paidPositions}</td>
              </tr>
            </tbody>
          </table>

          <h4 style={{ margin: "14px 0 8px" }}>Реестр</h4>
          {report && report.rows.length > 0 ? (
            <div className="tg-tax-scroll">
              <table className="tg-tax-register">
                <thead>
                  <tr>
                    <th>№</th>
                    <th>Дата</th>
                    <th>Клиент</th>
                    <th>Продукт</th>
                    <th>Чек</th>
                    <th>CPA</th>
                    <th>Подписчику</th>
                    <th>Трафферу</th>
                    <th>Компании</th>
                    <th>Источник</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r, i) => (
                    <tr key={r.id}>
                      <td>{i + 1}</td>
                      <td>{formatTaxDate(r.date)}</td>
                      <td>{r.client}</td>
                      <td>{r.product}</td>
                      <td>{r.orderId || "—"}</td>
                      <td className="tg-tax-num">{money(r.bankCpa)}</td>
                      <td className="tg-tax-num">
                        {money(r.subscriberPayout)}
                      </td>
                      <td className="tg-tax-num">{money(r.trafferPayout)}</td>
                      <td className="tg-tax-num">{money(r.companyProfit)}</td>
                      <td>{refSourceLabel(r.refType)}</td>
                      <td>{statusLabel(r.status)}</td>
                    </tr>
                  ))}
                  <tr>
                    <th colSpan={5}>Итого</th>
                    <td className="tg-tax-num">
                      <strong>{money(totals.cpa)}</strong>
                    </td>
                    <td className="tg-tax-num">
                      <strong>{money(totals.sub)}</strong>
                    </td>
                    <td className="tg-tax-num">
                      <strong>{money(totals.traf)}</strong>
                    </td>
                    <td className="tg-tax-num">
                      <strong>{money(totals.comp)}</strong>
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="tg-empty" style={{ color: "#444" }}>
              Нет позиций за выбранный месяц
            </div>
          )}

          <div className="tg-tax-sign">
            <span>Ответственный _______________</span>
            <span>Дата _______________</span>
          </div>
        </div>
      )}
    </section>
  );
}

type AdminUserIssue = {
  id: string;
  status: string;
  productId: string;
  product: string;
  premium: number;
  orderId?: string | null;
};

type AdminUserRow = {
  id: string;
  username: string | null;
  firstName?: string | null;
  telegramId: string;
  role: string;
  balance: number;
  isBanned: boolean;
  createdAt?: string;
  refSource?: string | null;
  issues?: AdminUserIssue[];
};

type AdminLeadRow = {
  id: string;
  status: string;
  orderId?: string | null;
  referrerId?: string | null;
  fullName: string;
  phone: string;
  createdAt?: string;
  subscriberAmount?: number | null;
  premiumAmount?: number | null;
  adminComment?: string | null;
  product: { title: string; bank?: string; subscriberPrice?: number; reward?: number };
  client: {
    username: string | null;
    telegramId: string;
    firstName?: string | null;
    inviteLinkName?: string | null;
  };
  referrer?: {
    username: string | null;
    telegramId?: string;
    firstName?: string | null;
    role?: string | null;
  } | null;
};

type AdminWdRow = {
  id: string;
  amount: number;
  status: string;
  details: string;
  adminComment?: string | null;
  user: { username: string | null; telegramId: string };
};

function groupLeadsByOrder(leads: AdminLeadRow[]) {
  const groups: Array<{ key: string; orderId: string | null; lines: AdminLeadRow[] }> =
    [];
  const byOrder = new Map<string, AdminLeadRow[]>();
  const singles: AdminLeadRow[] = [];
  for (const l of leads) {
    if (l.orderId) {
      const list = byOrder.get(l.orderId) || [];
      list.push(l);
      byOrder.set(l.orderId, list);
    } else {
      singles.push(l);
    }
  }
  for (const [orderId, lines] of Array.from(byOrder.entries())) {
    groups.push({ key: orderId, orderId, lines });
  }
  for (const l of singles) {
    groups.push({ key: l.id, orderId: null, lines: [l] });
  }
  return groups;
}

function isRemovedFromCheck(l: AdminLeadRow) {
  const st = normalizeLeadSt(l.status);
  return st === "rejected" && (l.adminComment || "").startsWith("Удалено из чека");
}


function leadLineSplit(l: AdminLeadRow) {
  const adminRefResolved =
    isAdminRefAttribution({
      referrerId: l.referrerId ?? null,
      referrerRole: l.referrer?.role,
      inviteLinkName: l.client.inviteLinkName,
    }) || (!l.referrer && (l.referrerId == null || l.referrerId === ""));
  const split = resolveProductPayouts(
    l.product.subscriberPrice ?? 0,
    l.product.reward ?? 0,
    { adminRef: adminRefResolved }
  );
  const rawSub = l.subscriberAmount;
  const looksLikeLegacyCpa =
    split.legacy &&
    rawSub != null &&
    Math.abs(Number(rawSub) - split.bankCpa) < 0.01;
  const subscriber =
    rawSub != null && rawSub > 0 && !looksLikeLegacyCpa
      ? Number(rawSub)
      : split.subscriber;
  const traffer = adminRefResolved
    ? 0
    : l.premiumAmount != null && l.premiumAmount > 0
      ? Number(l.premiumAmount)
      : split.traffer;
  const owner = ownerMarginFromPayouts(subscriber, traffer);
  return { subscriber, traffer, owner, adminRefResolved };
}

function leadOwnerProfit(l: AdminLeadRow): number {
  return leadLineSplit(l).owner;
}

function AdminLeadLineControls({
  l,
  onAction,
  disabled,
  showRestoreButton,
}: {
  l: AdminLeadRow;
  onAction: (body: Record<string, unknown>) => Promise<void>;
  disabled?: boolean;
  /** Per-line restore — keep on rejected filter; hide on active check cards. */
  showRestoreButton?: boolean;
}) {
  const st =
    l.status === "new" || l.status === "duplicate"
      ? "processing"
      : l.status === "approved"
        ? "awaiting_payout"
        : l.status;
  const adminRefResolved =
    isAdminRefAttribution({
      referrerId: l.referrerId ?? null,
      referrerRole: l.referrer?.role,
      inviteLinkName: l.client.inviteLinkName,
    }) || (!l.referrer && (l.referrerId == null || l.referrerId === ""));
  const split = resolveProductPayouts(
    l.product.subscriberPrice ?? 0,
    l.product.reward ?? 0,
    { adminRef: adminRefResolved }
  );
  const rawSub = l.subscriberAmount;
  const looksLikeLegacyCpa =
    split.legacy &&
    rawSub != null &&
    Math.abs(Number(rawSub) - split.bankCpa) < 0.01;
  const defAmt =
    rawSub != null && rawSub > 0 && !looksLikeLegacyCpa
      ? Number(rawSub)
      : split.subscriber;
  const prem = adminRefResolved ? 0 : l.premiumAmount ?? split.traffer;
  const ours = split.owner;
  const productLabel = formatProductLabel(l.product.title, l.product.bank);
  const removedHint =
    (l.adminComment || "").startsWith("Удалено из чека") && st === "rejected";

  return (
    <div className="space-y-2 rounded-xl border border-white/5 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{productLabel} ×1</p>
          {l.phone ? (
            <p className="tg-muted text-xs mt-0.5">{l.phone}</p>
          ) : null}
        </div>
        <span className={`tg-status tg-status-${st} shrink-0`}>
          {statusLabel(st)}
        </span>
      </div>
      <div className="tg-edit-block">
        <label className="tg-label">Сумма подписчику, ₽</label>
        <input
          className="tg-input"
          type="number"
          defaultValue={defAmt}
          disabled={disabled}
          id={`amt-${l.id}`}
        />
        <p className="tg-muted text-xs">
          {adminRefResolved
            ? `Рефка Админы · нам 55%: ${money(ours)} · подписчику 45%: ${money(defAmt)} · CPA: ${money(split.bankCpa)}`
            : `Премия траффера: ${money(prem)} · нам: ${money(ours)} · CPA: ${money(split.bankCpa)}`}
        </p>
        {removedHint ? (
          <p className="tg-muted text-xs">Удалено из чека · {l.adminComment}</p>
        ) : l.adminComment ? (
          <p className="tg-muted text-xs">{l.adminComment}</p>
        ) : null}
      </div>
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          className="tg-btn-secondary text-xs"
          disabled={disabled || st === "processing"}
          onClick={() =>
            void onAction({
              action: "lead_set_status",
              id: l.id,
              status: "processing",
            })
          }
        >
          В обработке
        </button>
        <button
          type="button"
          className="tg-btn-primary text-xs"
          disabled={disabled || st === "awaiting_payout"}
          onClick={() => {
            const el = document.getElementById(
              `amt-${l.id}`
            ) as HTMLInputElement | null;
            void onAction({
              action: "lead_set_status",
              id: l.id,
              status: "awaiting_payout",
              subscriberAmount: Number(el?.value || defAmt),
            });
          }}
        >
          Ждём выплату
        </button>
        <button
          type="button"
          className="tg-btn-primary text-xs"
          disabled={disabled || st === "paid"}
          onClick={() => {
            const el = document.getElementById(
              `amt-${l.id}`
            ) as HTMLInputElement | null;
            void onAction({
              action: "lead_set_status",
              id: l.id,
              status: "paid",
              subscriberAmount: Number(el?.value || defAmt),
            });
          }}
        >
          Выплачено
        </button>
        <button
          type="button"
          className="tg-btn-secondary text-xs"
          disabled={disabled || st === "rejected"}
          onClick={() => {
            const comment = prompt("Почему не прошло") || "не прошло";
            void onAction({
              action: "lead_set_status",
              id: l.id,
              status: "rejected",
              comment,
            });
          }}
        >
          Не прошло
        </button>
        <button
          type="button"
          className="tg-btn-secondary text-xs"
          disabled={disabled || st === "rejected"}
          onClick={() => {
            const reason = String(
              prompt("Причина удаления из чека (обязательно)") || ""
            ).trim();
            if (!reason) {
              alert("Нужна причина — удаление отменено");
              return;
            }
            void onAction({
              action: "remove_order_line",
              leadId: l.id,
              reason,
            });
          }}
        >
          Удалить из чека
        </button>
        {showRestoreButton ? (
          <button
            type="button"
            className="tg-btn-primary text-xs"
            disabled={disabled || st !== "rejected"}
            onClick={() => {
              const note = String(
                prompt("Заметка: почему вернули в заказ (обязательно)") || ""
              ).trim();
              if (!note) {
                alert("Нужна заметка — возврат отменён");
                return;
              }
              void onAction({
                action: "restore_order_line",
                leadId: l.id,
                note,
              });
            }}
          >
            Вернуть в заказ
          </button>
        ) : null}
      </div>
    </div>
  );
}

function groupUserIssuesByOrder(issues: AdminUserIssue[]) {
  const groups: Array<{
    key: string;
    orderId: string | null;
    lines: AdminUserIssue[];
  }> = [];
  const byOrder = new Map<string, AdminUserIssue[]>();
  const singles: AdminUserIssue[] = [];
  for (const iss of issues) {
    if (iss.orderId) {
      const list = byOrder.get(iss.orderId) || [];
      list.push(iss);
      byOrder.set(iss.orderId, list);
    } else {
      singles.push(iss);
    }
  }
  for (const [orderId, lines] of Array.from(byOrder.entries())) {
    groups.push({ key: orderId, orderId, lines });
  }
  for (const iss of singles) {
    groups.push({ key: iss.id, orderId: null, lines: [iss] });
  }
  return groups;
}

function AdminUsersPanel({
  users,
  onAction,
  disabled,
}: {
  users: AdminUserRow[];
  onAction: (body: Record<string, unknown>) => Promise<void>;
  disabled?: boolean;
}) {
  const [historyId, setHistoryId] = useState<string | null>(null);

  return (
    <div className="tg-stack">
      <p className="tg-note-plate">
        База юзеров: роль, рефка, бан. Оформление чека — во вкладке «Люди».
        Здесь можно посмотреть историю заявок.
      </p>
      {users.map((u) => {
        const isAdm = u.role === "admin";
        const roleRu =
          u.role === "admin"
            ? "админ"
            : u.role === "traffer"
              ? "траффер"
              : "подписчик";
        const issues = u.issues || [];
        const groups = groupUserIssuesByOrder(issues);
        const viewing = historyId === u.id;
        return (
          <div key={u.id} className="tg-card space-y-3">
            <div>
              <p className="tg-card-title">
                {u.isBanned ? "🚫 " : ""}
                {tgHandle(u.username, u.telegramId)}
              </p>
              <p className="tg-muted text-sm mt-1">
                {roleRu} · рефка: {u.refSource || "Админы"}
              </p>
              <p className="tg-muted text-xs mt-1">
                {u.createdAt ? formatDate(u.createdAt) : ""}
              </p>
              <p className="text-sm mt-1">
                Баланс: {money(Number(u.balance ?? 0))}
              </p>
            </div>

            <button
              type="button"
              className="tg-btn-secondary text-xs w-full"
              onClick={() =>
                setHistoryId((cur) => (cur === u.id ? null : u.id))
              }
            >
              {viewing ? "Скрыть историю" : "История заявок"}
              {issues.length > 0 ? ` · ${issues.length}` : ""}
            </button>

            {viewing ? (
              <div className="space-y-2">
                {groups.length === 0 ? (
                  <p className="tg-muted text-xs">Заявок пока нет</p>
                ) : (
                  groups.map((g) => (
                    <div key={g.key} className="space-y-1">
                      <p className="tg-muted text-xs">
                        {g.orderId
                          ? `Чек ${formatOrderNumber(g.orderId)} · ${g.lines.length}`
                          : "Без чека"}
                      </p>
                      {g.lines.map((iss) => (
                        <div
                          key={iss.id}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <span className="truncate">{iss.product} ×1</span>
                          <span className="tg-muted text-xs shrink-0">
                            {money(iss.premium)} · {statusLabel(iss.status)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            ) : null}

            {!isAdm ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  className="tg-btn-secondary text-xs flex-1"
                  disabled={disabled || u.role === "traffer"}
                  onClick={() =>
                    void onAction({
                      action: "user_set_role",
                      id: u.id,
                      role: "traffer",
                    })
                  }
                >
                  сделать траффером
                </button>
                <button
                  type="button"
                  className="tg-btn-secondary text-xs flex-1"
                  disabled={
                    disabled ||
                    u.role === "subscriber" ||
                    u.role === "client"
                  }
                  onClick={() =>
                    void onAction({
                      action: "user_set_role",
                      id: u.id,
                      role: "subscriber",
                    })
                  }
                >
                  сделать подписчиком
                </button>
              </div>
            ) : (
              <p className="tg-muted text-xs">Админ канала — роль не меняется</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                className="tg-btn-secondary text-xs flex-1"
                disabled={disabled}
                onClick={() => void onAction({ action: "user_ban", id: u.id })}
              >
                {u.isBanned ? "Разбан" : "Бан"}
              </button>
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <input
                className="tg-input flex-1 min-w-[100px]"
                type="number"
                placeholder="Новый баланс"
                disabled={disabled}
                defaultValue={Math.round(Number(u.balance ?? 0))}
                id={`bal-${u.id}`}
              />
              <button
                type="button"
                className="tg-btn-secondary text-xs"
                disabled={disabled}
                onClick={() => {
                  const el = document.getElementById(
                    `bal-${u.id}`
                  ) as HTMLInputElement | null;
                  const bal = Number(el?.value);
                  if (!Number.isFinite(bal) || bal < 0) {
                    alert("Укажите корректный баланс ≥ 0");
                    return;
                  }
                  if (
                    !confirm(
                      `Установить баланс ${money(bal)} для ${tgHandle(u.username, u.telegramId)}?`
                    )
                  ) {
                    return;
                  }
                  void onAction({
                    action: "set_balance",
                    userId: u.id,
                    balance: bal,
                  });
                }}
              >
                Изменить баланс
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function normalizeLeadSt(status: string) {
  if (status === "new" || status === "duplicate") return "processing";
  if (status === "approved") return "awaiting_payout";
  return status;
}

function AdminLeadsPanel({
  leads,
  onAction,
  disabled,
}: {
  leads: AdminLeadRow[];
  onAction: (body: Record<string, unknown>) => Promise<void>;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "processing" | "awaiting_payout" | "paid" | "rejected"
  >("processing");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [restorePanelOrderId, setRestorePanelOrderId] = useState<string | null>(
    null
  );

  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      const userHit = matchesUsernameQuery(
        q,
        l.client.username,
        l.client.telegramId,
        l.fullName
      );
      const orderHit = orderIdMatchesQuery(q, l.orderId);
      if (q.trim() && !userHit && !orderHit) return false;
      const st = normalizeLeadSt(l.status);
      if (st !== statusFilter) return false;
      return true;
    });
  }, [leads, q, statusFilter]);

  const groups = useMemo(() => {
    // Keep full чек together: include sibling lines of the same orderId
    const orderIds = new Set(
      filteredLeads.map((l) => l.orderId).filter((x): x is string => Boolean(x))
    );
    const withSiblings = leads.filter(
      (l) =>
        filteredLeads.some((m) => m.id === l.id) ||
        (l.orderId != null && orderIds.has(l.orderId))
    );
    return groupLeadsByOrder(withSiblings);
  }, [leads, filteredLeads]);

  const filteredIds = useMemo(
    () => filteredLeads.map((l) => l.id),
    [filteredLeads]
  );
  const selectedIds = filteredIds.filter((id) => selected[id]);
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selected[id]);

  function toggleSelect(id: string) {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelected((s) => {
        const next = { ...s };
        for (const id of filteredIds) delete next[id];
        return next;
      });
    } else {
      setSelected((s) => {
        const next = { ...s };
        for (const id of filteredIds) next[id] = true;
        return next;
      });
    }
  }

  async function runBulk(
    status: "awaiting_payout" | "paid" | "rejected"
  ) {
    if (selectedIds.length === 0 || disabled || bulkBusy) return;
    let comment: string | undefined;
    if (status === "rejected") {
      comment = String(prompt("Причина отказа") || "").trim();
      if (!comment) {
        alert("Нужна причина");
        return;
      }
    }
    setBulkBusy(true);
    try {
      await onAction({
        action: "leads_bulk_status",
        leadIds: selectedIds,
        status,
        comment,
      });
      setSelected({});
    } finally {
      setBulkBusy(false);
    }
  }

  const statusChips: Array<[typeof statusFilter, string]> = [
    ["processing", "Заказы"],
    ["awaiting_payout", "Ждём выплату"],
    ["paid", "Выплачено"],
    ["rejected", "Отказ"],
  ];

  return (
    <div className="tg-stack">
      <p className="tg-note-plate">
        Заказы по продуктам. Фильтр + массовый статус. Чек группирует позиции.
      </p>
      <input
        className="tg-input"
        placeholder="Поиск @username или код чека"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="tg-admin-chips">
        {statusChips.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={
              statusFilter === key ? "tg-chip tg-chip-active" : "tg-chip"
            }
            onClick={() => setStatusFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {filteredIds.length > 0 ? (
        <label className="flex items-center gap-2 text-sm px-1">
          <input
            type="checkbox"
            checked={allFilteredSelected}
            disabled={disabled}
            onChange={toggleSelectAll}
          />
          <span className="tg-muted text-xs">
            Выбрать все в фильтре · {filteredIds.length}
            {selectedIds.length > 0 ? ` · выбрано ${selectedIds.length}` : ""}
          </span>
        </label>
      ) : null}
      {groups.length === 0 ? (
        <div className="tg-empty">Нет заказов</div>
      ) : (
        groups.map((g) => {
          const head = g.lines[0];
          const who = tgHandle(head.client.username, head.client.telegramId);
          const refName = head.referrer
            ? tgHandle(head.referrer.username, head.referrer.telegramId)
            : "Админы";
          const rejectedFocus = statusFilter === "rejected";
          const mainLines = rejectedFocus
            ? g.lines.filter((l) => normalizeLeadSt(l.status) === "rejected")
            : g.lines.filter((l) => normalizeLeadSt(l.status) !== "rejected");
          const removedForOrder = g.orderId
            ? leads.filter(
                (l) => l.orderId === g.orderId && isRemovedFromCheck(l)
              )
            : g.lines.filter(isRemovedFromCheck);
          const panelOpen =
            Boolean(g.orderId) && restorePanelOrderId === g.orderId;
          const activeCount = mainLines.length;
          if (activeCount === 0) return null;
          return (
            <div key={g.key} className="tg-card space-y-3">
              <div>
                <p className="tg-card-title">{who}</p>
                {head.fullName && !String(head.fullName).startsWith("@") ? (
                  <p className="tg-muted text-xs mt-1">
                    ФИО в заявке: {head.fullName}
                  </p>
                ) : null}
                <p className="tg-muted text-xs mt-1">рефка: {refName}</p>
                {g.orderId ? (
                  <p className="tg-muted text-xs mt-1">
                    Чек {formatOrderNumber(g.orderId)} · {activeCount} поз.
                    {removedForOrder.length > 0 && !rejectedFocus
                      ? ` · удалено ${removedForOrder.length}`
                      : ""}
                  </p>
                ) : (
                  <p className="tg-muted text-xs mt-1">Одна позиция</p>
                )}
              </div>
              {mainLines.map((l) => (
                <div key={l.id} className="flex gap-2 items-start">
                  <input
                    type="checkbox"
                    className="mt-4 shrink-0"
                    checked={Boolean(selected[l.id])}
                    disabled={disabled}
                    onChange={() => toggleSelect(l.id)}
                    aria-label="Выбрать позицию"
                  />
                  <div className="min-w-0 flex-1">
                    <AdminLeadLineControls
                      l={l}
                      onAction={onAction}
                      disabled={disabled}
                      showRestoreButton={rejectedFocus}
                    />
                  </div>
                </div>
              ))}
              {g.orderId && !rejectedFocus ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm font-medium">
                      Итог · прибыль:{" "}
                      <span className="tabular-nums">
                        {money(
                          mainLines.reduce(
                            (sum, line) => sum + leadOwnerProfit(line),
                            0
                          )
                        )}
                      </span>
                    </p>
                    <button
                      type="button"
                      className="tg-btn-secondary text-xs shrink-0"
                      disabled={disabled}
                      onClick={() =>
                        setRestorePanelOrderId((cur) =>
                          cur === g.orderId ? null : g.orderId || null
                        )
                      }
                    >
                      {panelOpen
                        ? "Скрыть"
                        : removedForOrder.length > 0
                          ? `Вернуть в чек (${removedForOrder.length})`
                          : "Вернуть в чек"}
                    </button>
                  </div>
                  {panelOpen ? (
                    <div className="rounded-xl border border-white/10 p-3 space-y-2">
                      <p className="tg-muted text-xs font-medium">
                        Можно вернуть в чек
                      </p>
                      {removedForOrder.length === 0 ? (
                        <p className="tg-muted text-xs">Нет удалённых позиций</p>
                      ) : (
                        removedForOrder.map((l) => {
                          const label = formatProductLabel(
                            l.product.title,
                            l.product.bank
                          );
                          const reason = (l.adminComment || "")
                            .replace(/^Удалено из чека:\s*/, "")
                            .trim();
                          return (
                            <div
                              key={l.id}
                              className="flex items-start justify-between gap-2 border-b border-white/5 pb-2 last:border-0 last:pb-0"
                            >
                              <div className="min-w-0">
                                <p className="text-sm">{label}</p>
                                {reason ? (
                                  <p className="tg-muted text-xs mt-0.5">
                                    {reason}
                                  </p>
                                ) : null}
                                {l.createdAt ? (
                                  <p className="tg-muted text-xs">
                                    {formatDate(l.createdAt)}
                                  </p>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                className="tg-btn-primary text-xs shrink-0"
                                disabled={disabled}
                                onClick={() => {
                                  const note = String(
                                    prompt(
                                      "Заметка: почему вернули в чек (обязательно)"
                                    ) || ""
                                  ).trim();
                                  if (!note) {
                                    alert("Нужна заметка — возврат отменён");
                                    return;
                                  }
                                  void onAction({
                                    action: "restore_order_line",
                                    leadId: l.id,
                                    note,
                                  });
                                }}
                              >
                                Вернуть
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })
      )}
      {selectedIds.length > 0 ? (
        <div className="tg-bulk-sticky">
          <p className="tg-muted text-xs mb-2">
            Выбрано: {selectedIds.length}
          </p>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              className="tg-btn-primary text-xs flex-1"
              disabled={disabled || bulkBusy}
              onClick={() => void runBulk("awaiting_payout")}
            >
              Ждём выплату
            </button>
            <button
              type="button"
              className="tg-btn-primary text-xs flex-1"
              disabled={disabled || bulkBusy}
              onClick={() => void runBulk("paid")}
            >
              Выплачено
            </button>
            <button
              type="button"
              className="tg-btn-secondary text-xs flex-1"
              disabled={disabled || bulkBusy}
              onClick={() => void runBulk("rejected")}
            >
              Отклонить
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AdminWithdrawalsPanel({
  list,
  onAction,
  disabled,
}: {
  list: AdminWdRow[];
  onAction: (body: Record<string, unknown>) => Promise<void>;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const [bucket, setBucket] = useState<"open" | "closed">("open");
  const filtered = useMemo(() => {
    return list.filter((w) => {
      const closed = isClosedWithdrawal(w.status);
      if (bucket === "open" && closed) return false;
      if (bucket === "closed" && !closed) return false;
      return matchesUsernameQuery(q, w.user.username, w.user.telegramId);
    });
  }, [list, q, bucket]);

  return (
    <div className="tg-stack">
      <p className="tg-note-plate">
        Выплаченные и отклонённые выводы — в «Закрытые». Поиск по @username.
      </p>
      <input
        className="tg-input"
        placeholder="Поиск @username"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="tg-admin-chips">
        <button
          type="button"
          className={bucket === "open" ? "tg-chip tg-chip-active" : "tg-chip"}
          onClick={() => setBucket("open")}
        >
          Открытые
        </button>
        <button
          type="button"
          className={bucket === "closed" ? "tg-chip tg-chip-active" : "tg-chip"}
          onClick={() => setBucket("closed")}
        >
          Закрытые
        </button>
      </div>
      {filtered.length === 0 ? (
        <div className="tg-empty">Нет выводов</div>
      ) : (
        filtered.map((w) => (
          <div key={w.id} className="tg-card space-y-3">
            <div>
              <p className="tg-card-title">{money(w.amount)}</p>
              <p className="tg-muted text-sm mt-1">
                {tgHandle(w.user.username, w.user.telegramId)} ·{" "}
                {statusLabel(w.status)}
              </p>
              <p className="tg-muted text-xs mt-1">{w.details}</p>
              {w.adminComment ? (
                <p className="tg-muted text-xs mt-1">Причина: {w.adminComment}</p>
              ) : null}
            </div>
            {!isClosedWithdrawal(w.status) ? (
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  className="tg-btn-secondary text-xs"
                  disabled={disabled}
                  onClick={() =>
                    void onAction({ action: "wd_approve", id: w.id })
                  }
                >
                  Одобрить
                </button>
                <button
                  type="button"
                  className="tg-btn-secondary text-xs"
                  disabled={disabled}
                  onClick={() => {
                    const reason = String(
                      prompt("Причина отклонения вывода (обязательно)") || ""
                    ).trim();
                    if (!reason) {
                      alert("Нужна причина");
                      return;
                    }
                    void onAction({
                      action: "wd_reject",
                      id: w.id,
                      reason,
                    });
                  }}
                >
                  Отклонить
                </button>
                <button
                  type="button"
                  className="tg-btn-primary text-xs"
                  disabled={disabled}
                  onClick={() => void onAction({ action: "wd_paid", id: w.id })}
                >
                  Выплачено
                </button>
              </div>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}

type AdminProductRow = {
  id: string;
  title: string;
  bank?: string;
  reward: number;
  subscriberPrice: number;
  bankCpa?: number;
  ownerMargin?: number;
  isActive: boolean;
  isHot: boolean;
};

function AdminProductsEditor({
  mode,
  products,
  onAction,
  disabled,
}: {
  mode: "prices" | "premiums";
  products: AdminProductRow[];
  onAction: (body: Record<string, unknown>) => Promise<void>;
  disabled?: boolean;
}) {
  const [bank, setBank] = useState<string>(BANKS[0].label);
  const isPrices = mode === "prices";

  const bankOptions = useMemo(() => {
    const present = new Set(
      products.map((p) => p.bank || "").filter(Boolean)
    );
    const known = BANKS.filter((b) => present.has(b.label));
    const extras = Array.from(present)
      .filter((label) => !BANKS.some((b) => b.label === label))
      .sort()
      .map((label) => ({ key: label, label, short: label }));
    return [...known, ...extras];
  }, [products]);

  useEffect(() => {
    if (bankOptions.length === 0) return;
    if (!bankOptions.some((b) => b.label === bank)) {
      setBank(bankOptions[0].label);
    }
  }, [bankOptions, bank]);

  const filtered = useMemo(() => {
    return products.filter((p) => (p.bank || "") === bank);
  }, [products, bank]);

  return (
    <div className="tg-stack">
      <p className="tg-note-plate">
        {isPrices
          ? "CPA банка → 10/45/45. Наша премия 45% считается сама. Ручная цена — опционально."
          : "CPA банка → 10/45/45. Наша премия 45% считается сама. Ручная премия трафферу — опционально."}
      </p>
      <div className="tg-bank-filters" role="tablist" aria-label="Банки">
        {bankOptions.map((b) => (
          <button
            key={b.key}
            type="button"
            className={bank === b.label ? "tg-chip tg-chip-active" : "tg-chip"}
            onClick={() => setBank(b.label)}
          >
            {b.short}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="tg-empty">
          <p>Нет продуктов для этого банка</p>
        </div>
      ) : (
        filtered.map((p) => {
          const sub = p.subscriberPrice ?? 0;
          const prem = p.reward ?? 0;
          const cpa =
            p.bankCpa && p.bankCpa > 0
              ? p.bankCpa
              : estimateBankCpa(sub, prem) || Math.round(sub + prem);
          const ours =
            p.ownerMargin && p.ownerMargin > 0
              ? p.ownerMargin
              : ownerMarginFromPayouts(sub, prem) || ownerPayout(cpa);
          return (
            <div key={p.id} className="tg-card space-y-3">
              <div className="tg-product-title-row">
                <div className="min-w-0 flex-1">
                  <p className="tg-card-title">{p.title}</p>
                  {p.bank ? <p className="tg-product-bank">{p.bank}</p> : null}
                </div>
                {p.isHot ? <span className="tg-hot-badge">HOT</span> : null}
                <span
                  className={
                    p.isActive
                      ? "tg-status tg-status-approved"
                      : "tg-status tg-status-none"
                  }
                >
                  {p.isActive ? "Вкл" : "Выкл"}
                </span>
              </div>
              <div className="tg-stat-grid">
                <div className="tg-stat-tile">
                  <p className="tg-stat-label">Подписчик</p>
                  <p className="tg-stat-value text-base">{money(sub)}</p>
                </div>
                <div className="tg-stat-tile">
                  <p className="tg-stat-label">Траффер</p>
                  <p className="tg-stat-value text-base">{money(prem)}</p>
                </div>
                <div className="tg-stat-tile tg-stat-wide">
                  <p className="tg-stat-label">Наша премия (45%)</p>
                  <p className="tg-stat-value text-base text-money">
                    {money(ours)}
                  </p>
                </div>
              </div>
              <div className="tg-edit-block">
                <label className="tg-label">CPA банка, ₽</label>
                <input
                  className="tg-input"
                  type="number"
                  defaultValue={cpa}
                  disabled={disabled}
                  id={`cpa-${p.id}`}
                />
                <p className="tg-muted text-xs mt-1">
                  10% траффер · 45% подписчик · 45% нам
                </p>
              </div>
              <button
                type="button"
                className="tg-btn-primary w-full text-sm"
                disabled={disabled}
                onClick={() => {
                  const el = document.getElementById(
                    `cpa-${p.id}`
                  ) as HTMLInputElement | null;
                  const bankCpa = Number(el?.value || cpa);
                  void onAction({
                    action: "product_set_cpa",
                    id: p.id,
                    bankCpa,
                  });
                }}
              >
                Применить 10/45/45 от CPA
              </button>
              <div className="tg-edit-block">
                <label className="tg-label">
                  {isPrices ? "Цена для подписчика, ₽" : "Премия трафферу, ₽"}
                </label>
                <input
                  className="tg-input"
                  type="number"
                  defaultValue={
                    isPrices ? p.subscriberPrice ?? p.reward : p.reward
                  }
                  disabled={disabled}
                  id={`${isPrices ? "price" : "prem"}-${p.id}`}
                />
              </div>
              <button
                type="button"
                className="tg-btn-secondary w-full text-sm"
                disabled={disabled}
                onClick={() => {
                  const el = document.getElementById(
                    `${isPrices ? "price" : "prem"}-${p.id}`
                  ) as HTMLInputElement | null;
                  if (isPrices) {
                    const subscriberPrice = Number(
                      el?.value || p.subscriberPrice || p.reward
                    );
                    void onAction({
                      action: "product_update",
                      id: p.id,
                      subscriberPrice,
                    });
                  } else {
                    const reward = Number(el?.value || p.reward);
                    void onAction({
                      action: "product_update",
                      id: p.id,
                      reward,
                    });
                  }
                }}
              >
                {isPrices
                  ? "Сохранить только цену"
                  : "Сохранить только премию"}
              </button>
              {isPrices ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="tg-btn-secondary text-xs flex-1"
                    disabled={disabled}
                    onClick={() =>
                      void onAction({ action: "product_toggle", id: p.id })
                    }
                  >
                    {p.isActive ? "Выключить" : "Включить"}
                  </button>
                  <button
                    type="button"
                    className="tg-btn-secondary text-xs flex-1"
                    disabled={disabled}
                    onClick={() =>
                      void onAction({
                        action: "product_hot",
                        id: p.id,
                        isHot: !p.isHot,
                        hotText: "Акция",
                        days: 7,
                      })
                    }
                  >
                    {p.isHot ? "Снять HOT" : "HOT 7д"}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}
