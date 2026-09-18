# РКО Партнёрский кабинет

Веб + **Telegram Mini App** для трафферов, привлекающих взрослых предпринимателей (ИП/ООО) к банковскому РКО.

Стек: **Next.js 14 (App Router) + TypeScript + Tailwind CSS + Prisma + SQLite**.

**Основной UX — Mini App** в боте [@rko_referal_bot](https://t.me/rko_referal_bot). Клиенты по реф-ссылке получают сообщения в боте (канал + оформление продукта). Веб `/login`, `/partner`, `/admin` — запасной кабинет.

## Быстрый старт

```bash
cd /workspace/rko-partner-cabinet
npm install
npx prisma db push
# не запускайте db:seed на живых данных (seed делает deleteMany)
npm run dev -- -H 0.0.0.0 -p 3000
npm run telegram:poll
```

Откройте: http://localhost:3000

## Telegram: Mini App + бот

| Что | Как |
|-----|-----|
| Mini App | `/tg` — кнопка `web_app` «Открыть кабинет» |
| Deep-link | `https://t.me/rko_referal_bot?start=ref_<telegram_id>` |
| Админ | администраторы канала `TELEGRAM_CHANNEL_ID` (getChatAdministrators, кэш ~60с) |
| Клиент | `/start ref_…` → приветствие, «Вступить в канал», FSM «Оформил продукт» |
| Траффер | `/start` без payload → upsert BotUser + Mini App |
| `/admin` в боте | только если вы админ канала |

### Переменные

```
DATABASE_URL="file:./dev.db"
AUTH_SECRET="..."
NEXT_PUBLIC_APP_URL="http://localhost:3000"   # для prod — https
TELEGRAM_BOT_TOKEN="..."
TELEGRAM_BOT_USERNAME="rko_referal_bot"
TELEGRAM_CHANNEL_ID="@w1nstr1k3"             # или -100...
TELEGRAM_CHANNEL_PUBLIC_URL="https://t.me/w1nstr1k3"
```

Админ-доступ **не** через списки id/username в env: добавьте себя администратором канала, бот должен быть админом канала с правом читать список админов.

### Long-poll (localhost)

```bash
npm run telegram:poll
```

`allowed_updates`: `message`, `callback_query`, `chat_member`.

### Как проверить

1. Вы — админ канала → `/admin` в боте или Mini App показывает админ-вкладки.
2. `/start` → кнопка «Открыть кабинет» (Mini App).
3. Реф: `?start=ref_<ваш_tg_id>` с другого аккаунта → клиентское меню + канал @w1nstr1k3.
4. Клиент оформляет продукт → заявка `BotLead` → админ Approve в Mini App → `LedgerTx credit_lead` трафферу.

## Модели бота (Prisma)

`BotUser`, `BotProduct`, `BotLead`, `LedgerTx`, `Withdrawal`, `ReferralClick`, `BotSession` — рядом с прежними `User` / `Partner` / `Client` / `Subscriber` (не переименовывались).

Продукты по умолчанию (upsert, bank CPA Sep 2026 mid-market): РКО 7500, дебет 1800, кредит 4000, эквайринг 2500, зарплатный 2500, депозит 1200.

## Веб-маршруты

| Путь | Назначение |
|------|------------|
| `/login` `/partner` `/admin` | Веб-кабинет |
| `/tg` | **Mini App** |
| `/r/{CODE}` | Старый веб-реф лендинг |
| `POST /api/telegram/webhook` | Бот |
| `POST /api/tg/auth` | initData HMAC → сессия |
| `GET/POST /api/tg/cabinet` | Кабинет траффера (BotUser) |
| `GET/POST /api/tg/bot-admin` | Админ Mini App (только админы канала) |
| `GET/POST /api/cron/daily-digest` | Утренний дайджест админам (Vercel Cron 06:00 UTC) |

## Cron / daily digest

Vercel cron: `0 6 * * *` → `/api/cron/daily-digest` (≈ 09:00 МСК). Задайте **`CRON_SECRET`** в Vercel Environment Variables; запрос: `Authorization: Bearer <CRON_SECRET>` или `?secret=`. Без секрета в production — 401; в `NODE_ENV=development` без секрета разрешено. Ручной запуск: Mini App → Итоги → «Дайджест сейчас».

## Примечание

Аудитория — только совершеннолетние ИП и юрлица. Метрики — из БД. Файлы leftover Mini App wiring сохранены и используются; inline-кнопки — fallback.
