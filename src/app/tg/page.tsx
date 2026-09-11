"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Script from "next/script";
import { AdminTab } from "./AdminTab";
import { DEMO_ADMIN, DEMO_CABINET } from "./demo";
import { HomeTab } from "./HomeTab";
import { PeopleTab } from "./PeopleTab";
import { ProductsTab } from "./ProductsTab";
import { PreviewBanner, TgHeader } from "./TgHeader";
import { TgTabBar } from "./TgTabBar";
import type {
  AdminSubTab,
  AppTab,
  AuthState,
  CabinetData,
  TgRole,
} from "./types";
import { WithdrawTab } from "./WithdrawTab";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        ready: () => void;
        expand: () => void;
        setHeaderColor?: (color: string) => void;
        setBackgroundColor?: (color: string) => void;
      };
    };
  }
}

const BG = "#070b12";

function useTelegramBoot(onReady: (initData: string) => void) {
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    let done = false;
    const finish = (initData: string) => {
      if (done) return;
      done = true;
      onReady(initData);
    };

    const paint = (wa: NonNullable<NonNullable<typeof window.Telegram>["WebApp"]>) => {
      try {
        wa.ready();
        wa.expand();
        wa.setHeaderColor?.(BG);
        wa.setBackgroundColor?.(BG);
      } catch {
        /* older clients */
      }
    };

    const started = Date.now();
    const poll = window.setInterval(() => {
      const wa = window.Telegram?.WebApp;
      if (!wa) {
        // No WebApp yet — after CDN grace, give up with empty (not demo)
        if (scriptReady && Date.now() - started > 4000) {
          window.clearInterval(poll);
          finish("");
        }
        return;
      }
      paint(wa);
      // Desktop often mounts WebApp before initData is filled — wait for it
      if (wa.initData) {
        window.clearInterval(poll);
        finish(wa.initData);
        return;
      }
      if (Date.now() - started > 12000) {
        window.clearInterval(poll);
        finish(wa.initData || "");
      }
    }, 100);

    return () => window.clearInterval(poll);
  }, [scriptReady, onReady]);

  return setScriptReady;
}

export default function TelegramMiniAppPage() {
  const [auth, setAuth] = useState<AuthState>({ status: "booting" });
  const [cabinet, setCabinet] = useState<CabinetData | null>(null);
  const [cabinetForbidden, setCabinetForbidden] = useState(false);
  const [tab, setTab] = useState<AppTab>("home");
  const [adminSub, setAdminSub] = useState<AdminSubTab>("stats");
  const [adminData, setAdminData] = useState<Record<string, unknown> | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [wdAmount, setWdAmount] = useState("");
  const [wdDetails, setWdDetails] = useState("");
  const [msg, setMsg] = useState("");
  const isDemo = auth.status === "no_telegram";

  const authenticate = useCallback(async (initData: string) => {
    // Never auto-load fake "Алексей" demo — that looked like a real traffer on PC
    if (!initData) {
      const wantDemo =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("demo") === "1";
      if (wantDemo) {
        setAuth({ status: "no_telegram" });
        setCabinet(DEMO_CABINET);
        setAdminData(DEMO_ADMIN as Record<string, unknown>);
        return;
      }
      setAuth({
        status: "auth_error",
        message: "Нет данных Telegram. Открой кабинет кнопкой в @rko_referal_bot",
      });
      return;
    }
    try {
      const res = await fetch("/api/tg/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ initData }),
      });
      const data = await res.json();
      if (!res.ok || !data.role) {
        setAuth({
          status: "auth_error",
          message: data.error || "Не удалось войти",
        });
        return;
      }
      setAuth({
        status: "ready",
        role: data.role as TgRole,
        firstName: data.telegram?.firstName || null,
        channelMember: Boolean(data.channelMember),
      });
    } catch {
      setAuth({ status: "auth_error", message: "Ошибка сети" });
    }
  }, []);

  const onScriptReady = useTelegramBoot(authenticate);

  const loadCabinet = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tg/cabinet", { credentials: "include" });
      if (res.ok) {
        setCabinet(await res.json());
        setCabinetForbidden(false);
      } else if (res.status === 401 || res.status === 403) {
        setCabinetForbidden(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAdmin = useCallback(async (sub: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tg/bot-admin?tab=${sub}`, {
        credentials: "include",
      });
      if (res.ok) setAdminData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (auth.status !== "ready") return;
    void loadCabinet();
    if (auth.role === "ADMIN") {
      setTab("admin");
      void loadAdmin(adminSub);
    }
  }, [auth, adminSub, loadCabinet, loadAdmin]);

  useEffect(() => {
    if (auth.status !== "ready") return;
    if (auth.role === "ADMIN" && cabinetForbidden) {
      setTab("admin");
    }
  }, [auth, cabinetForbidden]);

  async function requestWithdraw(e: React.FormEvent) {
    e.preventDefault();
    if (isDemo) {
      setMsg("Демо: вывод доступен только из бота");
      return;
    }
    setMsg("");
    const res = await fetch("/api/tg/cabinet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        action: "withdraw",
        amount: Number(wdAmount),
        details: wdDetails,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error || "Ошибка");
      return;
    }
    setMsg("Заявка на вывод создана");
    setWdAmount("");
    setWdDetails("");
    await loadCabinet();
  }

  async function adminAction(body: Record<string, unknown>) {
    if (isDemo) {
      setMsg("Демо: действия доступны только из бота");
      return;
    }
    setMsg("");
    const res = await fetch("/api/tg/bot-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error || "Ошибка");
      return;
    }
    setMsg("Сохранено");
    await Promise.all([loadCabinet(), loadAdmin(adminSub)]);
  }

  const showAdmin =
    isDemo || (auth.status === "ready" && auth.role === "ADMIN");
  const isPartner =
    isDemo || (auth.status === "ready" && auth.role === "PARTNER");
  const isSubscriber =
    auth.status === "ready" && auth.role === "SUBSCRIBER";

  const tabs = useMemo(() => {
    const list: AppTab[] = [];
    if (showAdmin) {
      // Full bar for admins; HomeTab itself is admin-safe (no fake traffer identity)
      list.push("home", "products", "premiums", "people", "withdraw", "admin");
    } else if (isPartner) {
      list.push("home", "products", "people", "withdraw");
    } else if (isSubscriber) {
      list.push("home", "products");
    }
    return list;
  }, [showAdmin, isPartner, isSubscriber]);

  useEffect(() => {
    if (tabs.length && !tabs.includes(tab)) {
      setTab(tabs[0]);
    }
  }, [tabs, tab]);

  const displayCabinet = cabinet;
  const firstName =
    auth.status === "ready"
      ? auth.firstName ||
        displayCabinet?.botUser.firstName ||
        displayCabinet?.botUser.username ||
        "Партнёр"
      : isDemo
        ? DEMO_CABINET.botUser.firstName || "Демо"
        : "Партнёр";

  const roleForHeader: string | null =
    auth.status === "ready"
      ? auth.role
      : isDemo
        ? "PARTNER"
        : null;

  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
        onLoad={() => onScriptReady(true)}
      />
      <div className="tg-shell" style={{ background: BG }}>
        {isDemo ? <PreviewBanner /> : null}

        {auth.status === "booting" ? (
          <div className="tg-boot">
            <div className="tg-spinner" />
            <p className="tg-muted text-sm mt-3">Загрузка кабинета…</p>
            <p className="tg-muted text-xs mt-2 text-center px-6">
              Ждём Telegram… на ПК initData иногда приходит с задержкой
            </p>
          </div>
        ) : null}

        {auth.status === "auth_error" ? (
          <div className="tg-pad">
            <div className="tg-card text-sm text-rose-300">{auth.message}</div>
            <p className="tg-muted text-sm mt-4 text-center">
              Откройте Mini App из бота{" "}
              <span className="text-cyan-300">@rko_referal_bot</span>
            </p>
          </div>
        ) : null}

        {(auth.status === "ready" || isDemo) && (
          <>
            <div className="tg-pad tg-pad-top">
              <TgHeader
                firstName={firstName || "Партнёр"}
                role={roleForHeader}
                isDemo={isDemo}
              />

              {msg ? (
                <div className="tg-toast" role="status">
                  {msg}
                </div>
              ) : null}

              <main className="tg-main">
                {loading && !displayCabinet && tab !== "admin" ? (
                  <div className="tg-empty">Обновление…</div>
                ) : null}

                {tab === "home" && displayCabinet ? (
                  <HomeTab
                    data={displayCabinet}
                    role={
                      auth.status === "ready"
                        ? auth.role
                        : isDemo
                          ? "PARTNER"
                          : null
                    }
                    channelMember={
                      auth.status === "ready"
                        ? auth.channelMember
                        : true
                    }
                    adminStats={
                      (adminData?.stats as
                        | {
                            trafters?: number;
                            clients?: number;
                            leads?: number;
                            credited?: number;
                            creditedLabel?: string;
                          }
                        | undefined) || null
                    }
                  />
                ) : null}

                {tab === "products" && displayCabinet ? (
                  <ProductsTab
                    products={displayCabinet.products}
                    mode={
                      showAdmin ||
                      (auth.status === "ready" && auth.role === "SUBSCRIBER")
                        ? "shop"
                        : "premiums"
                    }
                    channelUrl={displayCabinet.channelUrl}
                    channelMember={
                      auth.status === "ready"
                        ? auth.channelMember
                        : true
                    }
                    previewNote={
                      showAdmin
                        ? "Превью: так видит подписчик (цены, без премий)"
                        : undefined
                    }
                  />
                ) : null}

                {tab === "premiums" && displayCabinet ? (
                  <ProductsTab
                    products={displayCabinet.products}
                    mode="premiums"
                    previewNote={
                      showAdmin
                        ? "Превью: так видит траффер (премии, без цен)"
                        : undefined
                    }
                  />
                ) : null}

                {tab === "people" && displayCabinet ? (
                  <PeopleTab referrals={displayCabinet.referrals} />
                ) : null}

                {tab === "withdraw" && displayCabinet ? (
                  <WithdrawTab
                    data={displayCabinet}
                    wdAmount={wdAmount}
                    wdDetails={wdDetails}
                    setWdAmount={setWdAmount}
                    setWdDetails={setWdDetails}
                    onWithdraw={requestWithdraw}
                    disabled={isDemo}
                  />
                ) : null}

                {tab === "admin" ? (
                  <AdminTab
                    tab={adminSub}
                    setTab={setAdminSub}
                    data={
                      isDemo
                        ? (DEMO_ADMIN as Record<string, unknown>)
                        : adminData
                    }
                    onAction={adminAction}
                    loading={loading}
                    disabled={isDemo}
                  />
                ) : null}

                {tab !== "admin" &&
                !displayCabinet &&
                !loading &&
                auth.status === "ready" ? (
                  <div className="tg-empty">Нет данных кабинета</div>
                ) : null}
              </main>
            </div>

            <TgTabBar
              tabs={tabs}
              active={tab}
              onChange={setTab}
              role={
                showAdmin
                  ? "ADMIN"
                  : auth.status === "ready"
                    ? auth.role
                    : isDemo
                      ? "PARTNER"
                      : null
              }
            />
          </>
        )}
      </div>
    </>
  );
}
