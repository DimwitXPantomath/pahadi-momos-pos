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

export function calcYield(
  qty: number,
  yieldPct: number
): { usable: number; wastage: number; costPerUnit: number } {
  const usable = qty * (yieldPct / 100);
  const wastage = qty - usable;
  const costPerUnit = usable > 0 ? qty / usable : 0;
  return { usable, wastage, costPerUnit };
}
