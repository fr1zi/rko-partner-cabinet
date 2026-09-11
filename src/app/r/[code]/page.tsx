import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProductRates } from "@/lib/products";
import { formatMoney } from "@/lib/status";
import { getBotDeepLink, isBotConfigured } from "@/lib/telegram";

export default async function RefLandingPage({
  params,
}: {
  params: { code: string };
}) {
  const partner = await prisma.partner.findUnique({
    where: { refCode: params.code.toUpperCase() },
    include: { user: true },
  });

  if (!partner || !partner.active) notFound();

  const rates = await getActiveProductRates();
  const partnerName =
    partner.displayName || partner.user.name || partner.refCode;

  const tgLink =
    partner.telegramInviteLink ||
    partner.telegramChannelUrl ||
    getBotDeepLink(partner.refCode);
  const botOk = isBotConfigured();

  return (
    <main className="min-h-screen bg-background bg-grid-fade">
      <div className="absolute inset-0 bg-hero-glow pointer-events-none" />
      <div className="relative mx-auto max-w-xl px-4 py-10 sm:py-16">
        <div className="text-center space-y-4 mb-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500 text-slate-950 font-bold shadow-glow">
            РКО
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white text-balance">
            Банковские продукты для бизнеса
          </h1>
          <p className="text-slate-400 text-sm sm:text-base text-balance">
            РКО, карты, эквайринг для ИП и ООО. Общение и оформление — в
            Telegram, не через формы на сайте.
          </p>
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-1 text-xs text-amber-300 font-medium">
            Только ИП и ООО
          </div>
        </div>

        <div className="ui-card p-5 sm:p-6 space-y-4 text-center">
          <p className="text-sm text-slate-400">
            Партнёр: <span className="text-slate-200">{partnerName}</span>
            {" · "}
            <span className="font-mono text-cyan-400/80 text-xs">
              {partner.refCode}
            </span>
          </p>

          {tgLink ? (
            <a
              href={tgLink}
              target="_blank"
              rel="noreferrer"
              className="ui-btn-primary w-full sm:w-auto px-8 inline-flex"
            >
              Перейти в Telegram
            </a>
          ) : (
            <p className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2.5">
              Ссылка Telegram ещё не привязана — свяжитесь с партнёром{" "}
              {partnerName}
              {!botOk ? " (бот не подключён)" : ""}
            </p>
          )}

          <p className="text-xs text-slate-500">
            Заявки принимаются в чате. Статусы и премии ведёт администратор.
          </p>
        </div>

        {rates.length > 0 ? (
          <div className="mt-6 rounded-2xl border border-border bg-surface p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-3">
              Продукты (ориентир)
            </p>
            <ul className="space-y-2">
              {rates.slice(0, 5).map((r) => (
                <li
                  key={r.productName}
                  className="flex items-center justify-between text-sm gap-3"
                >
                  <span className="text-slate-300">{r.productName}</span>
                  <span className="text-xs text-slate-500 shrink-0">
                    премия партнёру {formatMoney(r.premium)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </main>
  );
}
