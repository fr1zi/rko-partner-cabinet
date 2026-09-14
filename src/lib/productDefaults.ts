import { BANKS } from "./banks";

/** Bank CPA split: traffer 10% · subscriber 45% · owner 45%. */
export const TRAFFER_SHARE = 0.1;
export const SUBSCRIBER_SHARE = 0.45;
export const OWNER_SHARE = 0.45;

/**
 * When ref is Admins (no external traffer): owner absorbs the 10% traffer slice.
 * subscriber 45% · owner 55% · traffer 0.
 */
export const OWNER_SHARE_ADMIN_REF = 0.55;

const ADMIN_INVITE_NAME = "ADMIN";

/** `premium` = bank CPA (total payout from bank for one approved lead). */
export const DEFAULT_PRODUCT_RATES = [
  {
    productKey: "rko",
    productName: "РКО (открытие счёта)",
    premium: 3500,
    sortOrder: 1,
    age18: true,
  },
  {
    productKey: "debit_card",
    productName: "Дебетовая карта",
    premium: 1500,
    sortOrder: 2,
    age18: false,
  },
  {
    productKey: "credit_card",
    productName: "Кредитная карта",
    premium: 2500,
    sortOrder: 3,
    age18: true,
  },
  {
    productKey: "acquiring",
    productName: "Эквайринг",
    premium: 2000,
    sortOrder: 4,
    age18: false,
  },
  {
    productKey: "salary_project",
    productName: "Зарплатный проект",
    premium: 1800,
    sortOrder: 5,
    age18: false,
  },
  {
    productKey: "deposit",
    productName: "Депозит для бизнеса",
    premium: 1200,
    sortOrder: 6,
    age18: false,
  },
] as const;

export const PRODUCT_TITLE_BY_KEY: Record<string, string> = {
  rko: "РКО (открытие счёта)",
  debit_card: "Дебетовая карта",
  credit_card: "Кредитная карта",
  acquiring: "Эквайринг",
  salary_project: "Зарплатный проект",
  deposit: "Депозит для бизнеса",
};

export function trafferReward(cpa: number) {
  return Math.round(cpa * TRAFFER_SHARE);
}

export function subscriberPayout(cpa: number) {
  return Math.round(cpa * SUBSCRIBER_SHARE);
}

export function ownerPayout(cpa: number) {
  return Math.round(cpa * OWNER_SHARE);
}

export function ownerPayoutAdminRef(cpa: number) {
  return Math.round(cpa * OWNER_SHARE_ADMIN_REF);
}

/**
 * Detect admin / «Админы» attribution for payout formula.
 * True when: no referrer, referrer is admin, or invite attributed to ADMIN.
 */
export function isAdminRefAttribution(opts: {
  referrerId?: string | null;
  referrerRole?: string | null;
  inviteLinkName?: string | null;
}): boolean {
  if (!opts.referrerId) return true;
  if ((opts.referrerRole || "").toLowerCase() === "admin") return true;
  if ((opts.inviteLinkName || "").trim().toUpperCase() === ADMIN_INVITE_NAME) {
    return true;
  }
  return false;
}

/** Infer bank CPA from subscriber + traffer legs (inverse of 45/10 or 45/0 admin-ref). */
export function estimateBankCpa(subscriber: number, traffer: number) {
  const sub = Math.max(0, subscriber);
  const prem = Math.max(0, traffer);
  const out = sub + prem;
  if (out <= 0) return 0;
  if (Math.abs(sub - prem) < 0.01 && prem > 0) {
    // Legacy equal payouts: treat listed amount as CPA itself.
    return Math.round(sub);
  }
  // Admin-ref (or no traffer paid): only subscriber leg → CPA = sub / 0.45
  if (prem < 0.01) {
    return Math.round(sub / SUBSCRIBER_SHARE);
  }
  const paidShare = SUBSCRIBER_SHARE + TRAFFER_SHARE;
  return Math.round(out / paidShare);
}

/**
 * Company margin from actual subscriber + traffer payouts.
 * Admin-ref (traffer≈0): owner gets 55% of CPA.
 * Normal: owner gets 45% of CPA.
 */
export function ownerMarginFromPayouts(subscriber: number, traffer: number) {
  const sub = Math.max(0, subscriber);
  const prem = Math.max(0, traffer);
  if (sub <= 0 && prem <= 0) return 0;
  if (Math.abs(sub - prem) < 0.01 && prem > 0) return 0;
  const cpa = estimateBankCpa(sub, prem);
  if (!cpa) return 0;
  if (prem < 0.01) return ownerPayoutAdminRef(cpa);
  return ownerPayout(cpa);
}

export type ResolvePayoutOpts = {
  /** No external traffer — 55/45 owner/subscriber. */
  adminRef?: boolean;
};

/**
 * Resolve payout legs from BotProduct fields.
 * Legacy catalog stored bank CPA in BOTH reward and subscriberPrice.
 */
export function resolveProductPayouts(
  subscriberPrice: number,
  reward: number,
  opts?: ResolvePayoutOpts
) {
  const sub = Math.max(0, Number(subscriberPrice) || 0);
  const prem = Math.max(0, Number(reward) || 0);
  const adminRef = Boolean(opts?.adminRef);

  if (sub > 0 && Math.abs(sub - prem) < 0.01) {
    const cpa = Math.round(sub);
    if (adminRef) {
      return {
        bankCpa: cpa,
        subscriber: subscriberPayout(cpa),
        traffer: 0,
        owner: ownerPayoutAdminRef(cpa),
        legacy: true as const,
        adminRef: true as const,
      };
    }
    return {
      bankCpa: cpa,
      subscriber: subscriberPayout(cpa),
      traffer: trafferReward(cpa),
      owner: ownerPayout(cpa),
      legacy: true as const,
      adminRef: false as const,
    };
  }

  if (adminRef) {
    // Prefer catalog subscriberPrice as 45% leg; fall back to inverse from reward as CPA.
    const cpa =
      sub > 0
        ? Math.round(sub / SUBSCRIBER_SHARE)
        : prem > 0
          ? Math.round(prem / TRAFFER_SHARE)
          : 0;
    return {
      bankCpa: cpa,
      subscriber: subscriberPayout(cpa),
      traffer: 0,
      owner: ownerPayoutAdminRef(cpa),
      legacy: false as const,
      adminRef: true as const,
    };
  }

  const cpa = estimateBankCpa(sub, prem);
  return {
    bankCpa: cpa,
    subscriber: Math.round(sub),
    traffer: Math.round(prem),
    owner: ownerMarginFromPayouts(sub, prem),
    legacy: false as const,
    adminRef: false as const,
  };
}

/** One BotProduct row per bank × product type. */
export function catalogEntries() {
  const out: Array<{
    title: string;
    bank: string;
    description: string;
    reward: number;
    subscriberPrice: number;
    ownerMargin: number;
    bankCpa: number;
    sortKey: string;
  }> = [];
  for (const bank of BANKS) {
    for (const r of DEFAULT_PRODUCT_RATES) {
      const title = PRODUCT_TITLE_BY_KEY[r.productKey] || r.productName;
      const age = "age18" in r && r.age18 ? " 18+" : "";
      out.push({
        title,
        bank: bank.label,
        description: `${r.productName} · ${bank.label}${age}`,
        reward: trafferReward(r.premium),
        subscriberPrice: subscriberPayout(r.premium),
        ownerMargin: ownerPayout(r.premium),
        bankCpa: r.premium,
        sortKey: `${r.sortOrder}-${bank.key}`,
      });
    }
  }
  return out;
}
