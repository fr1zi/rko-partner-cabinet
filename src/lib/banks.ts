/** Canonical banks for Mini App filters and product catalog. More banks can be appended later. */
export const BANKS = [
  { key: "alfa", label: "Альфа-Банк", short: "Альфа" },
  { key: "tbank", label: "Т-Банк", short: "Т‑Банк" },
  { key: "sber", label: "Сбербанк", short: "Сбер" },
] as const;

export type BankKey = (typeof BANKS)[number]["key"];

export const BANK_LABELS = BANKS.map((b) => b.label);

export function bankShort(label: string): string {
  const hit = BANKS.find((b) => b.label === label);
  return hit?.short || label || "—";
}

export function isKnownBank(label: string | null | undefined): boolean {
  if (!label) return false;
  return BANKS.some((b) => b.label === label);
}
