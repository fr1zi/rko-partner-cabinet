/** Human-readable check / order number helpers (no DB column). */

/** Display form: new RKO-YYMM-XXXX as-is; legacy ord_… → # + last 6 uppercased. */
export function formatOrderNumber(orderId: string | null | undefined): string {
  if (!orderId) return "—";
  if (orderId.startsWith("RKO-")) return orderId;
  if (orderId.startsWith("ord_")) {
    return `#${orderId.slice(-6).toUpperCase()}`;
  }
  if (orderId.length > 12) {
    return `#${orderId.slice(-6).toUpperCase()}`;
  }
  return orderId;
}

/** Case-insensitive match against raw orderId or formatted display number. */
export function orderIdMatchesQuery(
  query: string,
  orderId: string | null | undefined
): boolean {
  const q = query.trim().toLowerCase().replace(/^#/, "");
  if (!q) return true;
  if (!orderId) return false;
  const raw = orderId.toLowerCase();
  const formatted = formatOrderNumber(orderId).toLowerCase().replace(/^#/, "");
  return raw.includes(q) || formatted.includes(q);
}
