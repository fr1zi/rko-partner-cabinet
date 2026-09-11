import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import Link from "next/link";
import { getActiveProductRates } from "@/lib/products";
import { PriceList } from "@/components/PriceList";

export default async function HomePage() {
  const session = await getSession();
  if (session?.role === "ADMIN") redirect("/admin");
  if (session?.role === "PARTNER") redirect("/partner");

  const rates = await getActiveProductRates();

  return (
    <main className="min-h-screen bg-background bg-grid-fade">
      <div className="absolute inset-0 bg-hero-glow pointer-events-none" />
      <div className="relative mx-auto max-w-5xl px-4 py-12 sm:py-20 space-y-12">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500 text-slate-950 text-sm font-bold shadow-glow">
              РКО
            </div>
            <span className="text-sm font-semibold text-slate-200">
              Партнёрский кабинет
            </span>
          </div>
          <Link href="/login" className="ui-btn-secondary">
            Войти
          </Link>
        </header>

        <section className="text-center space-y-6 max-w-3xl mx-auto pt-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300">
            Только для ИП и юридических лиц
          </div>
          <h1 className="ui-page-title text-balance text-3xl sm:text-5xl leading-tight">
            Зарабатывайте на привлечении бизнеса к{" "}
            <span className="text-cyan-400">банковскому РКО</span>
          </h1>
          <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto text-balance">
            Платформа для партнёров и трафферов: реферальные ссылки, учёт лидов,
            статусы заявок и прозрачные премии за открытие продуктов для
            взрослых предпринимателей и ООО.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link href="/login" className="ui-btn-primary px-6 py-3 text-base">
              Войти в кабинет
            </Link>
            <a href="#price" className="ui-btn-secondary px-6 py-3 text-base">
              Смотреть прайс
            </a>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          {[
            {
              t: "Реф. ссылки",
              d: "Веб-лендинг /r/код и опциональный Telegram deep-link",
            },
            {
              t: "Прозрачные статусы",
              d: "От новой заявки до выдачи продукта и выплаты премии",
            },
            {
              t: "Фиксированный прайс",
              d: "Премии по продуктам: РКО, карты, эквайринг и другое",
            },
          ].map((item) => (
            <div key={item.t} className="ui-card p-5">
              <h3 className="font-semibold text-white">{item.t}</h3>
              <p className="mt-2 text-sm text-slate-400">{item.d}</p>
            </div>
          ))}
        </section>

        <div id="price">
          <PriceList rates={rates} />
        </div>

        <footer className="border-t border-border pt-8 text-center text-xs text-slate-500 space-y-2">
          <p>
            Сервис предназначен исключительно для привлечения совершеннолетних
            предпринимателей (ИП) и юридических лиц.
          </p>
          <p>Не для несовершеннолетних · не для физлиц без бизнеса</p>
        </footer>
      </div>
    </main>
  );
}
