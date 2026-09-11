import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SettingsForm } from "./SettingsForm";
import { PriceListForm } from "./PriceListForm";
import { getAllProductRates } from "@/lib/products";
import {
  isBotConfigured,
  getBotUsername,
  getTelegramChannelId,
  isChannelInviteConfigured,
} from "@/lib/telegram";

export default async function AdminSettingsPage() {
  const session = await requireSession("ADMIN");
  if (!session) redirect("/login");

  let settings = await prisma.settings.findUnique({ where: { id: "default" } });
  if (!settings) {
    settings = await prisma.settings.create({
      data: { id: "default", defaultCommission: 3500 },
    });
  }

  const rates = await getAllProductRates();

  const botOk = isBotConfigured();
  const botUser = getBotUsername();
  const channelId = getTelegramChannelId();
  const inviteOk = isChannelInviteConfigured();

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="ui-page-title">Настройки</h1>
        <p className="ui-page-sub">
          Прайс премий, комиссия и статус Telegram-бота
        </p>
      </div>

      <div className="ui-card p-5 space-y-3">
        <h2 className="ui-section-title">Telegram</h2>
        <p className="text-sm text-slate-400">
          Токен и канал задаются в env (BotFather отдельно). Здесь только статус.
        </p>
        <ul className="text-sm space-y-1.5">
          <li>
            TELEGRAM_BOT_TOKEN:{" "}
            {botOk ? (
              <span className="text-emerald-400">задан</span>
            ) : (
              <span className="text-amber-400">пусто — подключите бота</span>
            )}
          </li>
          <li>
            TELEGRAM_BOT_USERNAME:{" "}
            <span className="font-mono text-slate-300">
              {botUser ? `@${botUser}` : "—"}
            </span>
          </li>
          <li>
            TELEGRAM_CHANNEL_ID:{" "}
            <span className="font-mono text-slate-300">
              {channelId || "—"}
            </span>
          </li>
          <li>
            Авто-invite:{" "}
            {inviteOk ? (
              <span className="text-emerald-400">доступен</span>
            ) : (
              <span className="text-amber-400">нужны token + channel</span>
            )}
          </li>
        </ul>
      </div>

      <PriceListForm
        initialRates={rates.map((r) => ({
          id: r.id,
          productKey: r.productKey,
          productName: r.productName,
          premium: r.premium,
          sortOrder: r.sortOrder,
          active: r.active,
        }))}
      />

      <div>
        <h2 className="ui-section-title mb-3">Запасная ставка</h2>
        <SettingsForm defaultCommission={settings.defaultCommission} />
      </div>
    </div>
  );
}
