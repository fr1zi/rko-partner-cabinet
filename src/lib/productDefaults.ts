import { BANKS, type BankKey } from "./banks";

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

export const PRODUCT_TYPE_KEYS = [
  "rko",
  "debit_card",
  "credit_card",
  "acquiring",
  "salary_project",
  "deposit",
] as const;

export type ProductTypeKey = (typeof PRODUCT_TYPE_KEYS)[number];

/** Product-type metadata (shared across banks). */
export const PRODUCT_TYPES = [
  {
    productKey: "rko" as const,
    productName: "РКО (открытие счёта)",
    sortOrder: 1,
    age18: true,
  },
  {
    productKey: "debit_card" as const,
    productName: "Дебетовая карта",
    sortOrder: 2,
    age18: false,
  },
  {
    productKey: "credit_card" as const,
    productName: "Кредитная карта",
    sortOrder: 3,
    age18: true,
  },
  {
    productKey: "acquiring" as const,
    productName: "Эквайринг",
    sortOrder: 4,
    age18: false,
  },
  {
    productKey: "salary_project" as const,
    productName: "Зарплатный проект",
    sortOrder: 5,
    age18: false,
  },
  {
    productKey: "deposit" as const,
    productName: "Депозит для бизнеса",
    sortOrder: 6,
    age18: false,
  },
] as const;

/**
 * Per-bank CPA (₽) — Sep 2026 public partner/CPA midpoints (integer).
 * Sources (commit/README): AlfaPartners / Pampadu OOO; tbank.ru partnership;
 * SberSolutions oferta / Sravni partner sheets. Weak estimates flagged in comments.
 * Split: traffer 10% · subscriber 45% · owner 45%.
 */
export const BANK_PRODUCT_CPA: Record<
  BankKey,
  Record<ProductTypeKey, number>
> = {
  // Альфа-Банк: Alfa РКО status_sale / Pampadu ~12533 → 12500;
  // AlfaPartners debit 18+ up to 2000; credit up to 4800;
  // acquiring conservative (MGCom); salary mid estimate; deposit sparse.
  alfa: {
    rko: 12500,
    debit_card: 2000,
    credit_card: 4800,
    acquiring: 2500,
    salary_project: 3000, // weak estimate
    deposit: 1200,
  },
  // Т-Банк: tbank.ru partnership from 8500; debit S7/activation ~1275–1400;
  // credit Platinum-class ~4032 → 4000; trade acquiring 3000;
  // salary ~300/card → project-level catalog CPA 2500; deposit sparse.
  tbank: {
    rko: 8500,
    debit_card: 1400,
    credit_card: 4000,
    acquiring: 3000,
    salary_project: 2500, // project-level Mini App catalog (not per-card)
    deposit: 1200,
  },
  // Сбербанк: SberSolutions 2500 base / packages ~7200 → mid 5000;
  // debit Sravni ~700–1000 → 900; credit conservative (weak public);
  // acquiring Sravni ~1700; salary Sravni up to 10000 → mid 5000; deposit sparse.
  sber: {
    rko: 5000,
    debit_card: 900,
    credit_card: 2500, // weak public — conservative
    acquiring: 1700,
    salary_project: 5000,
    deposit: 1200,
  },
};

/** Legacy flat productKey values (pre per-bank catalog) — deactivated on sync. */
export const LEGACY_FLAT_PRODUCT_KEYS: readonly string[] = [...PRODUCT_TYPE_KEYS];

export const PRODUCT_TITLE_BY_KEY: Record<string, string> = {
  rko: "РКО (открытие счёта)",
  debit_card: "Дебетовая карта",
  credit_card: "Кредитная карта",
  acquiring: "Эквайринг",
  salary_project: "Зарплатный проект",
  deposit: "Депозит для бизнеса",
};

export type DefaultProductRate = {
  /** Unique ProductRate key: `${bankKey}_${typeKey}` e.g. alfa_rko */
  productKey: string;
  productName: string;
  premium: number;
  sortOrder: number;
  age18: boolean;
  bank: string;
  bankKey: BankKey;
  typeKey: ProductTypeKey;
};

/** One ProductRate / catalog row per bank × product type. */
export const DEFAULT_PRODUCT_RATES: readonly DefaultProductRate[] = (() => {
  const out: DefaultProductRate[] = [];
  for (const t of PRODUCT_TYPES) {
    BANKS.forEach((bank, bankIdx) => {
      const premium = BANK_PRODUCT_CPA[bank.key][t.productKey];
      out.push({
        productKey: `${bank.key}_${t.productKey}`,
        productName: `${t.productName} · ${bank.label}`,
        premium,
        sortOrder: t.sortOrder * 10 + bankIdx,
        age18: t.age18,
        bank: bank.label,
        bankKey: bank.key,
        typeKey: t.productKey,
      });
    });
  }
  return out;
})();

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

/** One BotProduct row per bank × product type (uses per-bank CPA). */
export function catalogEntries() {
  return DEFAULT_PRODUCT_RATES.map((r) => {
    const title = PRODUCT_TITLE_BY_KEY[r.typeKey] || r.productName;
    const age = r.age18 ? " 18+" : "";
    return {
      title,
      bank: r.bank,
      description: `${PRODUCT_TITLE_BY_KEY[r.typeKey] || r.typeKey} · ${r.bank}${age}`,
      reward: trafferReward(r.premium),
      subscriberPrice: subscriberPayout(r.premium),
      ownerMargin: ownerPayout(r.premium),
      bankCpa: r.premium,
      sortKey: `${r.sortOrder}`,
      productKey: r.productKey,
      typeKey: r.typeKey,
    };
  });
}
