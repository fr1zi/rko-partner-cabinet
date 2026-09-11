import { BANKS } from "./banks";

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

/** One BotProduct row per bank × product type. */
export function catalogEntries() {
  const out: Array<{
    title: string;
    bank: string;
    description: string;
    reward: number;
    subscriberPrice: number;
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
        reward: r.premium,
        subscriberPrice: r.premium,
        sortKey: `${r.sortOrder}-${bank.key}`,
      });
    }
  }
  return out;
}
