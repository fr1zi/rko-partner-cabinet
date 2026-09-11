export const DEFAULT_PRODUCT_RATES = [
  {
    productKey: "rko",
    productName: "РКО (открытие счёта)",
    premium: 3500,
    sortOrder: 1,
  },
  {
    productKey: "debit_card",
    productName: "Дебетовая карта",
    premium: 1500,
    sortOrder: 2,
  },
  {
    productKey: "credit_card",
    productName: "Кредитная карта",
    premium: 2500,
    sortOrder: 3,
  },
  {
    productKey: "acquiring",
    productName: "Эквайринг",
    premium: 2000,
    sortOrder: 4,
  },
  {
    productKey: "salary_project",
    productName: "Зарплатный проект",
    premium: 1800,
    sortOrder: 5,
  },
  {
    productKey: "deposit",
    productName: "Депозит для бизнеса",
    premium: 1200,
    sortOrder: 6,
  },
] as const;
