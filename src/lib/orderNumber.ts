/** Human-readable check / order number helpers (no DB column). */

/** Display form: digit-only codes as-is; legacy RKO-/ord_ → shortened. */
export function formatOrderNumber(orderId: string | null | undefined): string {
  if (!orderId) return "—";
  if (/^\d+$/.test(orderId)) return orderId;
  if (orderId.startsWith("RKO-")) {
    const digits = orderId.replace(/\D/g, "");
    return digits || orderId;
  }
  if (orderId.startsWith("ord_")) {
    return orderId.replace(/\D/g, "").slice(-8) || orderId.slice(-6);
  }
  if (orderId.length > 12) {
    const digits = orderId.replace(/\D/g, "");
    return digits.slice(-8) || orderId.slice(-6);
  }
  return orderId;
}

/** Case-insensitive match against raw orderId or formatted display number. */
export function orderIdMatchesQuery(
  query: string,
  orderId: string | null | undefined
): boolean {
  const q = query.trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, "");
  if (!q) return true;
  if (!orderId) return false;
  const raw = orderId.toLowerCase();
  const formatted = formatOrderNumber(orderId).toLowerCase();
  const rawDigits = orderId.replace(/\D/g, "");
  const qDigits = q.replace(/\D/g, "");
  if (raw.includes(q) || formatted.includes(q)) return true;
  if (qDigits && rawDigits.includes(qDigits)) return true;
  return false;
}
