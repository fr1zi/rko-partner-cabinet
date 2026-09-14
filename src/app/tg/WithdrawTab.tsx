"use client";

import type { CabinetData } from "./types";
import {
  formatDate,
  isClosedWithdrawal,
  money,
  statusLabel,
  txTypeLabel,
} from "./utils";

export function WithdrawTab({
  data,
  wdAmount,
  wdDetails,
  setWdAmount,
  setWdDetails,
  onWithdraw,
  disabled,
}: {
  data: CabinetData;
  wdAmount: string;
  wdDetails: string;
  setWdAmount: (v: string) => void;
  setWdDetails: (v: string) => void;
  onWithdraw: (e: React.FormEvent) => void;
  disabled?: boolean;
}) {
  const openWd = data.withdrawals.filter((w) => !isClosedWithdrawal(w.status));
  const closedWd = data.withdrawals.filter((w) => isClosedWithdrawal(w.status));

  return (
    <div className="tg-stack">
      <section className="tg-card">
        <p className="tg-muted text-xs mb-1">Баланс</p>
        <p className="text-2xl font-semibold text-money tracking-tight">
          {money(data.botUser.balance)}
        </p>
      </section>

      {data.supportUrl ? (
        <a
          className="tg-btn-secondary w-full text-center"
          href={data.supportUrl}
          target="_blank"
          rel="noreferrer"
        >
          Написать в ЛС за выплатой
        </a>
      ) : null}

      <form onSubmit={onWithdraw} className="tg-card space-y-3">
        <h2 className="tg-card-title">Запросить вывод</h2>
        <p className="tg-muted text-xs">
          Когда заявка в статусе «ждём выплату» или «выплачено» — можно
          вывести начисленные деньги или написать в ЛС.
        </p>
        <label className="block">
          <span className="tg-label">Сумма, ₽</span>
          <input
            className="tg-input"
            type="number"
            min={1}
            step={1}
            placeholder="Например, 5000"
            value={wdAmount}
            onChange={(e) => setWdAmount(e.target.value)}
            required
            disabled={disabled}
          />
        </label>
        <label className="block">
          <span className="tg-label">Реквизиты</span>
          <textarea
            className="tg-input tg-textarea"
            placeholder="СБП / карта / счёт ИП"
            value={wdDetails}
            onChange={(e) => setWdDetails(e.target.value)}
            required
            disabled={disabled}
          />
        </label>
        <button type="submit" className="tg-btn-primary w-full" disabled={disabled}>
          {disabled ? "Только в боте" : "Отправить заявку"}
        </button>
      </form>

      <section className="tg-stack-sm">
        <h2 className="tg-section-label">Заявки на вывод</h2>
        {openWd.length === 0 ? (
          <div className="tg-empty-sm">Нет открытых заявок</div>
        ) : (
          openWd.map((w) => (
            <div key={w.id} className="tg-card tg-tx-row">
              <div>
                <p className="font-semibold text-white">{money(w.amount)}</p>
                <p className="tg-muted text-xs mt-0.5 truncate max-w-[200px]">
                  {w.details}
                </p>
              </div>
              <div className="text-right">
                <span className={`tg-status tg-status-${w.status}`}>
                  {statusLabel(w.status)}
                </span>
                <p className="tg-muted text-[11px] mt-1">
                  {formatDate(w.createdAt)}
                </p>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="tg-stack-sm">
        <h2 className="tg-section-label">Закрытые заявки</h2>
        {closedWd.length === 0 ? (
          <div className="tg-empty-sm">Пока пусто</div>
        ) : (
          closedWd.map((w) => (
            <div key={w.id} className="tg-card tg-tx-row">
              <div>
                <p className="font-semibold text-white">{money(w.amount)}</p>
                <p className="tg-muted text-xs mt-0.5 truncate max-w-[200px]">
                  {w.details}
                </p>
              </div>
              <div className="text-right">
                <span className={`tg-status tg-status-${w.status}`}>
                  {statusLabel(w.status)}
                </span>
                <p className="tg-muted text-[11px] mt-1">
                  {formatDate(w.createdAt)}
                </p>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="tg-stack-sm">
        <h2 className="tg-section-label">Операции</h2>
        {data.txs.length === 0 ? (
          <div className="tg-empty-sm">Нет операций</div>
        ) : (
          data.txs.map((t) => (
            <div key={t.id} className="tg-card tg-tx-row">
              <div>
                <p className="text-sm text-white">{txTypeLabel(t.type)}</p>
                {t.comment ? (
                  <p className="tg-muted text-xs mt-0.5 truncate max-w-[200px]">
                    {t.comment}
                  </p>
                ) : null}
              </div>
              <div className="text-right">
                <p
                  className={
                    t.amount >= 0
                      ? "font-semibold text-money"
                      : "font-semibold text-rose-300"
                  }
                >
                  {t.amount >= 0 ? "+" : ""}
                  {money(t.amount)}
                </p>
                <p className="tg-muted text-[11px] mt-1">
                  {formatDate(t.createdAt)}
                </p>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
