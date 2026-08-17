// Shared category list for ingredients + vendors (see migration
// 026_procurement_categories.sql). Kept as a plain string union / TEXT
// column in the DB rather than a Postgres enum, so adding a new
// category later is a frontend-only change — no migration needed.
// If the DB has a category value not in this list (e.g. hand-entered
// via SQL), UI code should still render it, just without a preset
// button highlighted.

export const PROCUREMENT_CATEGORIES = [
  "Dry Store",
  "Vegetable",
  "Poultry & Meat",
  "Dairy",
  "Beverages",
  "Packaging",
  "Other",
] as const

export type ProcurementCategory = typeof PROCUREMENT_CATEGORIES[number]

const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  "Dry Store":       { bg: "#fef3c7", color: "#92400e" },
  "Vegetable":       { bg: "#dcfce7", color: "#166534" },
  "Poultry & Meat":  { bg: "#fee2e2", color: "#991b1b" },
  "Dairy":           { bg: "#dbeafe", color: "#1e40af" },
  "Beverages":       { bg: "#e0e7ff", color: "#3730a3" },
  "Packaging":       { bg: "#f3e8ff", color: "#6b21a8" },
  "Other":           { bg: "#f3f4f6", color: "#374151" },
}

export function categoryColor(category: string | null | undefined) {
  if (!category) return { bg: "#f3f4f6", color: "#9ca3af" }
  return CATEGORY_COLORS[category] || { bg: "#f3f4f6", color: "#374151" }
}
