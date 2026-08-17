export function cn(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(" ");
}

export function formatCurrency(n: number): string {
  const val = n ?? 0;
  return "₹" + val.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatQty(n: number, unit: string): string {
  const val = n ?? 0;
  return val.toLocaleString("en-IN", { maximumFractionDigits: 3 }) + " " + (unit ?? '');
}

// Supabase/Postgres timestamp-without-timezone columns (orders.created_at,
// orders.ready_at, etc.) come back from the client as naive strings with no
// 'Z' or offset, e.g. "2026-08-15T22:32:03.774" — but the DB always stores
// these in UTC (see Postgres default / this project's `now()` usage). A bare
// `new Date(thatString)` is parsed as LOCAL browser time, not UTC, silently
// shifting every such timestamp by the browser's UTC offset (+5:30 for IST).
// Route every raw DB timestamp through this before doing math or formatting.
// Was previously only applied in useOrders.ts's getOrderTime() — every other
// call site (order urgency color, delay alerts, "Ready by", customer-facing
// countdown, KOT/Bill print date+time, revenue-by-day charts) had the bug.
export function parseDbTimestamp(s: string): Date {
  return new Date(/[Zz]|[+-]\d\d:?\d\d$/.test(s) ? s : s + "Z")
}

// Strips non-digits, drops any leading zeros (a 10-digit phone number
// can't start with 0), and caps at 10 digits. Used by every phone-number
// input that collects a 10-digit mobile number.
export function sanitizePhoneDigits(raw: string): string {
  return raw.replace(/\D/g, "").replace(/^0+/, "").slice(0, 10);
}

export function calcYield(
  qty: number,
  yieldPct: number
): { usable: number; wastage: number; costPerUnit: number } {
  const usable = qty * (yieldPct / 100);
  const wastage = qty - usable;
  const costPerUnit = usable > 0 ? qty / usable : 0;
  return { usable, wastage, costPerUnit };
}
