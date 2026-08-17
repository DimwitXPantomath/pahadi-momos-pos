import React, { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { parseDbTimestamp } from "@/lib/utils"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts"
import { useAuth } from "@/contexts/AuthContext"
import { PROCUREMENT_CATEGORIES, categoryColor } from "@/lib/procurementCategories"

// ─── Types ────────────────────────────────────────────────────────────────────

type PurchaseUnit = "Kg" | "Litre" | "Bottle" | "Box" | "Pack" | "Packet" | "Tray" | "Can"
type UsageUnit   = "grams" | "ml" | "pieces"
type AdjType     = "add" | "remove" | "set"

interface IngredientRow {
  id: string
  name: string
  unit: string
  purchase_unit: string
  cost_per_unit: number
  last_purchase_cost: number
  yield_percentage: number
  usage_unit: string
  units_per_purchase: number
  cost_per_usage_unit: number
  min_stock_level: number
  preferred_vendor_id: string | null
  current_stock: number
  created_at: string
  category: string | null
}

interface Vendor {
  id: string
  name: string
}

interface PriceHistoryRow {
  id: string
  purchase_date: string
  quantity_received: number
  total_cost: number
  cost_per_usage_unit: number
  vendor_id: string
  vendor_name: string
}

interface StockRow {
  ingredientId: string
  qty: string
  type: AdjType
  note: string
}

interface ReconciliationRow {
  id: string
  ingredient_id: string
  ingredient_name: string
  usage_unit: string | null
  expected_quantity: number
  actual_quantity: number
  difference: number
  adjusted_by_name: string | null
  adjusted_by_role: string | null
  note: string | null
  created_at: string
}

interface PendingProcurementItem {
  ingredient_id: string
  qty: number
}

const PENDING_PROCUREMENT_KEY = "praang_pending_procurement_items"

// ─── Constants ────────────────────────────────────────────────────────────────

const PURCHASE_UNITS: PurchaseUnit[] = [
  "Kg", "Litre", "Bottle", "Box", "Pack", "Packet", "Tray", "Can",
]
const USAGE_UNITS: UsageUnit[] = ["grams", "ml", "pieces"]
const VENDOR_COLORS = ["#f97316", "#3b82f6", "#10b981", "#8b5cf6", "#ec4899"]

const emptyForm = {
  name:               "",
  purchaseUnit:       "Kg" as PurchaseUnit,
  costPerUnit:        "",
  lastPurchaseCost:   "",
  yieldPct:           "100",
  usageUnit:          "grams" as UsageUnit,
  unitsPerPurchase:   "",
  minStockLevel:      "",
  preferredVendorId:  "",
  category:           "" as string,
}

const emptyStockRow = (): StockRow => ({
  ingredientId: "", qty: "", type: "add", note: "",
})

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: d })
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  // Threaded down from Index.tsx via InventoryView.tsx so "Create
  // Procurement Order" from the Reorder Alerts tab can actually switch
  // the main view — Index.tsx owns `view` state, IngredientsPage has
  // no router of its own to navigate with.
  onGoToProcurement?: () => void
}

export default function IngredientsPage({ onGoToProcurement }: Props) {
  const { user, profile } = useAuth()
  const [tab, setTab] = useState<"list" | "add" | "stock" | "reorder" | "reconciliation">("list")
  const [form, setForm]                   = useState(emptyForm)
  const [editRow, setEditRow]             = useState<IngredientRow | null>(null)
  const [ingredients, setIngredients]     = useState<IngredientRow[]>([])
  const [vendors, setVendors]             = useState<Vendor[]>([])
  const [loading, setLoading]             = useState(false)
  const [saving, setSaving]               = useState(false)
  const [error, setError]                 = useState("")
  const [success, setSuccess]             = useState("")
  const [deleteId, setDeleteId]           = useState<string | null>(null)
  const [searchQuery, setSearchQuery]     = useState("")

  // Stock update tab
  const [stockRows, setStockRows]         = useState<StockRow[]>([emptyStockRow()])
  const [stockSaving, setStockSaving]     = useState(false)

  // Price history modal
  const [historyIng, setHistoryIng]       = useState<IngredientRow | null>(null)
  const [priceHistory, setPriceHistory]   = useState<PriceHistoryRow[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Reconciliation log
  const [reconLog, setReconLog]           = useState<ReconciliationRow[]>([])
  const [reconLoading, setReconLoading]   = useState(false)

  // Reorder alerts (ingredients below min_stock_level)
  const [reorderQty, setReorderQty]       = useState<Record<string, string>>({})
  const [reorderSelected, setReorderSelected] = useState<Record<string, boolean>>({})

  // ── Live calculation (Tab 2 preview) ──────────────────────────────────────
  const parsedCPU  = parseFloat(form.costPerUnit)        || 0
  const parsedUPP  = parseFloat(form.unitsPerPurchase)   || 0
  const parsedYld  = parseFloat(form.yieldPct)           || 0
  const usable     = parsedUPP > 0 && parsedYld > 0 ? parsedUPP * (parsedYld / 100) : 0
  const calcCostPerUsageUnit = parsedCPU > 0 && usable > 0 ? parsedCPU / usable : 0
  const showPreview = parsedUPP > 0 && parsedCPU > 0

  // ── Fetch ──────────────────────────────────────────────────────────────────
  // NOTE: current_stock is sourced from inventory_stock.current_quantity,
  // not the ingredients.current_stock column (legacy — see migration
  // 027_stock_reconciliation.sql). ingredients.current_stock is no
  // longer written by this page.
  async function fetchIngredients() {
    setLoading(true)
    const [{ data, error }, { data: stockRows }] = await Promise.all([
      supabase.from("ingredients").select("*").order("created_at", { ascending: false }),
      supabase.from("inventory_stock").select("ingredient_id, current_quantity"),
    ])
    if (error) { setError(error.message); setLoading(false); return }
    const stockMap = new Map((stockRows || []).map(s => [s.ingredient_id, s.current_quantity || 0]))
    setIngredients(
      ((data || []) as IngredientRow[]).map(i => ({ ...i, current_stock: stockMap.get(i.id) ?? 0 }))
    )
    setLoading(false)
  }

  async function fetchReconciliationLog() {
    setReconLoading(true)
    const { data, error } = await supabase
      .from("stock_reconciliation_log")
      .select("*, ingredients(name, usage_unit)")
      .order("created_at", { ascending: false })
      .limit(100)
    if (error) { setError(error.message); setReconLoading(false); return }
    setReconLog((data || []).map((r: any) => ({
      id: r.id,
      ingredient_id: r.ingredient_id,
      ingredient_name: r.ingredients?.name ?? "—",
      usage_unit: r.usage_unit ?? r.ingredients?.usage_unit ?? null,
      expected_quantity: r.expected_quantity,
      actual_quantity: r.actual_quantity,
      difference: r.difference,
      adjusted_by_name: r.adjusted_by_name,
      adjusted_by_role: r.adjusted_by_role,
      note: r.note,
      created_at: r.created_at,
    })))
    setReconLoading(false)
  }

  async function fetchVendors() {
    const { data } = await supabase.from("vendors").select("id, name").order("name")
    setVendors(data || [])
  }

  async function fetchHistory(ing: IngredientRow) {
    setHistoryIng(ing)
    setPriceHistory([])
    setHistoryLoading(true)
    const { data } = await supabase
      .from("ingredient_price_history")
      .select("*, vendors(name)")
      .eq("ingredient_id", ing.id)
      .order("purchase_date", { ascending: true })
      .limit(10)
    if (data) {
      setPriceHistory(
        (data as any[]).map(h => ({ ...h, vendor_name: h.vendors?.name || "Unknown" }))
      )
    }
    setHistoryLoading(false)
  }

  useEffect(() => { fetchIngredients(); fetchVendors() }, [])
  useEffect(() => { if (tab === "reconciliation") fetchReconciliationLog() }, [tab])

  // ── Save (Add / Edit) ──────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.name.trim())                   { setError("Ingredient name is required"); return }
    if (parsedUPP <= 0)                      { setError("Enter units per purchase (e.g. 500 for 500 grams per Kg)"); return }
    if (parsedYld <= 0 || parsedYld > 100)   { setError("Yield must be 1–100%"); return }

    setSaving(true); setError("")

    const payload = {
      name:               form.name.trim(),
      purchase_unit:      form.purchaseUnit,
      cost_per_unit:      parsedCPU,
      last_purchase_cost: parseFloat(form.lastPurchaseCost) || 0,
      yield_percentage:   parsedYld,
      usage_unit:         form.usageUnit,
      unit:               form.usageUnit,
      units_per_purchase: parsedUPP,
      cost_per_usage_unit: calcCostPerUsageUnit,
      min_stock_level:    parseFloat(form.minStockLevel) || 0,
      preferred_vendor_id: form.preferredVendorId || null,
      category:           form.category || null,
    }

    let err: any
    if (editRow) {
      ;({ error: err } = await supabase.from("ingredients").update(payload).eq("id", editRow.id))
    } else {
      ;({ error: err } = await supabase.from("ingredients").insert(payload))
    }

    if (err) {
      setError(err.message)
    } else {
      setSuccess(editRow ? "Updated!" : "Ingredient added!")
      setForm(emptyForm)
      setEditRow(null)
      fetchIngredients()
      setTimeout(() => { setSuccess(""); setTab("list") }, 1200)
    }
    setSaving(false)
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    const { error } = await supabase.from("ingredients").delete().eq("id", id)
    if (error) setError(error.message)
    else { fetchIngredients(); setDeleteId(null) }
  }

  // ── Edit ───────────────────────────────────────────────────────────────────
  function startEdit(row: IngredientRow) {
    setForm({
      name:               row.name,
      purchaseUnit:       (row.purchase_unit as PurchaseUnit) || "Kg",
      costPerUnit:        row.cost_per_unit > 0 ? String(row.cost_per_unit) : "",
      lastPurchaseCost:   row.last_purchase_cost > 0 ? String(row.last_purchase_cost) : "",
      yieldPct:           String(row.yield_percentage ?? 100),
      usageUnit:          (row.usage_unit as UsageUnit) || "grams",
      unitsPerPurchase:   String(row.units_per_purchase ?? ""),
      minStockLevel:      row.min_stock_level > 0 ? String(row.min_stock_level) : "",
      preferredVendorId:  row.preferred_vendor_id || "",
      category:           row.category || "",
    })
    setEditRow(row)
    setTab("add")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  // ── Bulk stock update ──────────────────────────────────────────────────────
  function updateStockRow(idx: number, key: keyof StockRow, val: string) {
    setStockRows(rows => rows.map((r, i) => i === idx ? { ...r, [key]: val } : r))
  }

  async function handleBulkStock() {
    const validRows = stockRows.filter(r => r.ingredientId && r.qty && parseFloat(r.qty) >= 0)
    if (validRows.length === 0) { setError("Add at least one valid row"); return }

    setStockSaving(true); setError("")

    for (const row of validRows) {
      const qty = parseFloat(row.qty)
      const ing = ingredients.find(i => i.id === row.ingredientId)
      if (!ing) continue

      const expected = ing.current_stock ?? 0
      let newQty = expected
      if (row.type === "add")    newQty = expected + qty
      if (row.type === "remove") newQty = Math.max(0, expected - qty)
      if (row.type === "set")    newQty = qty

      await supabase
        .from("inventory_stock")
        .upsert(
          { ingredient_id: row.ingredientId, current_quantity: newQty, updated_at: new Date().toISOString() },
          { onConflict: "ingredient_id" }
        )

      // "Set exact amount" = a physical count overriding the system's
      // running total — log the variance for the audit sheet. "add"/
      // "remove" are intentional deltas (e.g. logging a delivery), not
      // a discrepancy discovery, so they're not logged here.
      if (row.type === "set") {
        await supabase.from("stock_reconciliation_log").insert({
          ingredient_id: row.ingredientId,
          expected_quantity: expected,
          actual_quantity: newQty,
          usage_unit: ing.usage_unit || ing.unit || null,
          adjusted_by: user?.id ?? null,
          adjusted_by_role: profile?.role ?? null,
          adjusted_by_name: profile?.full_name ?? null,
          note: row.note || null,
        })
      }
    }

    setSuccess(`Updated stock for ${validRows.length} ingredient${validRows.length !== 1 ? "s" : ""}!`)
    setStockRows([emptyStockRow()])
    fetchIngredients()
    setTimeout(() => setSuccess(""), 2500)
    setStockSaving(false)
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const filtered = ingredients.filter(i =>
    i.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const uniqueVendors = [...new Set(priceHistory.map(h => h.vendor_name))]
  const chartData = priceHistory.reduce((acc: Record<string, string | number>[], point) => {
    const dateStr = new Date(point.purchase_date).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short",
    })
    let existing = acc.find(d => d.date === dateStr)
    if (!existing) { existing = { date: dateStr }; acc.push(existing) }
    existing[point.vendor_name] = point.cost_per_usage_unit
    return acc
  }, [])
  const usageUnitLabel = historyIng?.usage_unit || historyIng?.unit || "unit"

  const lowStockCount  = ingredients.filter(i => i.min_stock_level > 0 && (i.current_stock ?? 0) < i.min_stock_level && (i.current_stock ?? 0) > 0).length
  const outOfStockCount = ingredients.filter(i => (i.current_stock ?? 0) === 0).length

  // Reorder alerts — anything under its min stock level, system-detected
  // (deducted by sales/production). This is a live check, not a stored
  // "alert" record: opening the tab always shows what's short right now.
  // Suggested qty tops the ingredient up to exactly min_stock_level,
  // rounded up to a whole purchase unit — staff can raise it before
  // sending to Procurement, per "suggest user to add more if required".
  const reorderList = ingredients.filter(i => i.min_stock_level > 0 && (i.current_stock ?? 0) < i.min_stock_level)

  function suggestedPurchaseQty(ing: IngredientRow): number {
    const shortfall = Math.max(0, ing.min_stock_level - (ing.current_stock ?? 0))
    const upp = ing.units_per_purchase > 0 ? ing.units_per_purchase : 1
    return Math.max(1, Math.ceil(shortfall / upp))
  }

  function toggleReorderSelected(id: string, ing: IngredientRow) {
    setReorderSelected(prev => ({ ...prev, [id]: !prev[id] }))
    setReorderQty(prev => prev[id] ? prev : { ...prev, [id]: String(suggestedPurchaseQty(ing)) })
  }

  const sendToProcurement = () => {
    const items: PendingProcurementItem[] = reorderList
      .filter(i => reorderSelected[i.id])
      .map(i => ({ ingredient_id: i.id, qty: parseFloat(reorderQty[i.id] ?? "0") || suggestedPurchaseQty(i) }))
    if (items.length === 0) { setError("Check at least one ingredient to reorder"); return }
    localStorage.setItem(PENDING_PROCUREMENT_KEY, JSON.stringify(items))
    setReorderSelected({}); setReorderQty({})
    if (onGoToProcurement) onGoToProcurement()
    else setSuccess(`Queued ${items.length} item${items.length !== 1 ? "s" : ""} — open Procurement → New Request to finish.`)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={p.page}>

      {/* ── Header ── */}
      <div style={p.header}>
        <div>
          <h2 style={p.title}>🥕 Ingredients</h2>
          <p style={p.subtitle}>Manage raw materials — costing, yield, and stock tracking</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={p.statPill}>{ingredients.length} total</div>
          {lowStockCount > 0  && <div style={{ ...p.statPill, background: "#d97706" }}>{lowStockCount} low</div>}
          {outOfStockCount > 0 && <div style={{ ...p.statPill, background: "#dc2626" }}>{outOfStockCount} out</div>}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={p.tabRow}>
        {([
          { key: "list",  label: "📋 Ingredients" },
          { key: "add",   label: editRow ? `✏️ Editing: ${editRow.name}` : "➕ Add" },
          { key: "stock", label: "📦 Stock Update" },
          { key: "reorder", label: reorderList.length > 0 ? `⚠️ Reorder Alerts (${reorderList.length})` : "⚠️ Reorder Alerts" },
          { key: "reconciliation", label: "🧾 Reconciliation Log" },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => {
              if (t.key !== "add") { setEditRow(null); setForm(emptyForm) }
              setError(""); setTab(t.key)
            }}
            style={{
              ...p.tabBtn,
              background: tab === t.key ? "hsl(var(--primary))" : "white",
              color:      tab === t.key ? "white" : "#374151",
              fontWeight: tab === t.key ? 700 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error   && <div style={p.errorBanner}>⚠️ {error}</div>}
      {success && <div style={p.successBanner}>✅ {success}</div>}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TAB 1 — LIST                                                       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {tab === "list" && (
        <div style={p.card}>
          <div style={p.tableHeader}>
            <h3 style={p.cardTitle}>All Ingredients</h3>
            <input
              style={{ ...p.input, width: 200, margin: 0 }}
              placeholder="🔍 Search…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {loading ? (
            <div style={p.empty}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={p.empty}>
              {searchQuery
                ? "No ingredients match your search"
                : <span>No ingredients yet. <button style={p.linkBtn} onClick={() => setTab("add")}>Add your first →</button></span>
              }
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={p.table}>
                <thead>
                  <tr>
                    {["Name", "Category", "Stock", "Cost/Unit", "Yield%", "Usage Unit", "Units/Purchase", "Cost/Usage Unit", "Min Stock", ""].map(h => (
                      <th key={h} style={p.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, i) => {
                    const isLowStock = row.min_stock_level > 0 && (row.current_stock ?? 0) < row.min_stock_level
                    return (
                      <tr key={row.id} style={{ background: i % 2 === 0 ? "white" : "#f9fafb" }}>
                        <td style={{ ...p.td, fontWeight: 600 }}>
                          {row.name}
                          {isLowStock && (
                            <span style={{ ...p.badge, background: "#fee2e2", color: "#991b1b", marginLeft: 6 }}>
                              Low Stock
                            </span>
                          )}
                        </td>
                        <td style={p.td}>
                          {row.category ? (
                            <span style={{ ...p.badge, background: categoryColor(row.category).bg, color: categoryColor(row.category).color }}>
                              {row.category}
                            </span>
                          ) : <span style={{ color: "#9ca3af", fontSize: 11 }}>Unset</span>}
                        </td>
                        <td style={{ ...p.td, fontFamily: "monospace" }}>
                          {(() => {
                            const stock    = row.current_stock ?? 0
                            const upp      = row.units_per_purchase > 0 ? row.units_per_purchase : 1
                            const inPurch  = stock / upp
                            const dispUnit = row.purchase_unit || row.usage_unit || row.unit
                            const usageUnit = row.usage_unit || row.unit
                            const color = stock === 0 ? "#ef4444" : isLowStock ? "#d97706" : "#16a34a"
                            return (
                              <div>
                                <span style={{ color, fontWeight: 700 }}>
                                  {fmt(inPurch, 2)} {dispUnit}
                                </span>
                                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>
                                  {fmt(stock, 0)} {usageUnit}
                                </div>
                              </div>
                            )
                          })()}
                        </td>
                        <td style={{ ...p.td, fontFamily: "monospace" }}>
                          {row.cost_per_unit > 0 ? `₹${fmt(row.cost_per_unit, 2)}` : <span style={{ color: "#9ca3af" }}>—</span>}
                        </td>
                        <td style={p.td}>
                          <span style={{
                            ...p.badge,
                            background: (row.yield_percentage ?? 100) >= 90 ? "#dcfce7" : (row.yield_percentage ?? 100) >= 70 ? "#fef9c3" : "#fee2e2",
                            color:      (row.yield_percentage ?? 100) >= 90 ? "#166534" : (row.yield_percentage ?? 100) >= 70 ? "#854d0e" : "#991b1b",
                          }}>
                            {row.yield_percentage ?? 100}%
                          </span>
                        </td>
                        <td style={p.td}>
                          <span style={{ ...p.badge, background: "#ede9fe", color: "#6d28d9" }}>
                            {row.usage_unit || row.unit}
                          </span>
                        </td>
                        <td style={{ ...p.td, fontFamily: "monospace" }}>
                          {row.units_per_purchase != null
                            ? `${fmt(row.units_per_purchase, 0)} ${row.usage_unit || row.unit}`
                            : "—"}
                        </td>
                        <td style={{ ...p.td, fontWeight: 700, fontFamily: "monospace" }}>
                          {row.cost_per_usage_unit > 0
                            ? `₹${fmt(row.cost_per_usage_unit, 4)}`
                            : <span style={{ color: "#9ca3af", fontWeight: 400, fontSize: 11 }}>Not set</span>}
                        </td>
                        <td style={{ ...p.td, fontFamily: "monospace" }}>
                          {row.min_stock_level > 0
                            ? `${fmt(row.min_stock_level, 0)} ${row.usage_unit || row.unit}`
                            : "—"}
                        </td>
                        <td style={p.td}>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button
                              style={p.iconBtn}
                              onClick={() => fetchHistory(row)}
                              title="Price history"
                            >📈</button>
                            <button style={p.iconBtn} onClick={() => startEdit(row)}>✏️</button>
                            <button
                              style={{ ...p.iconBtn, background: "#fee2e2" }}
                              onClick={() => setDeleteId(row.id)}
                            >🗑️</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TAB 2 — ADD / EDIT                                                 */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {tab === "add" && (
        <div style={p.card}>
          <h3 style={p.cardTitle}>
            {editRow ? `✏️ Editing: ${editRow.name}` : "➕ Add Ingredient"}
          </h3>

          {/* Row 1: Name + Purchase Unit */}
          <div style={p.grid2}>
            <div style={p.field}>
              <label style={p.label}>Ingredient Name *</label>
              <input
                style={p.input}
                placeholder="e.g. Jalapeños"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div style={p.field}>
              <label style={p.label}>Purchase Unit *</label>
              <select
                style={p.input}
                value={form.purchaseUnit}
                onChange={e => setForm(f => ({ ...f, purchaseUnit: e.target.value as PurchaseUnit }))}
              >
                {PURCHASE_UNITS.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {/* Row 2: Cost Per Unit + Last Purchase Cost */}
          <div style={p.grid2}>
            <div style={p.field}>
              <label style={p.label}>Cost Per Unit ₹ *</label>
              <input
                style={p.input}
                type="number" min="0" step="0.01"
                placeholder="e.g. 200"
                value={form.costPerUnit}
                onChange={e => setForm(f => ({ ...f, costPerUnit: e.target.value }))}
              />
              <span style={p.helper}>Standard budget price for 1 {form.purchaseUnit}</span>
            </div>
            <div style={p.field}>
              <label style={p.label}>Last Purchase Cost ₹</label>
              <input
                style={p.input}
                type="number" min="0" step="0.01"
                placeholder="e.g. 195"
                value={form.lastPurchaseCost}
                onChange={e => setForm(f => ({ ...f, lastPurchaseCost: e.target.value }))}
              />
              <span style={p.helper}>Actual price paid last time (for tracking)</span>
            </div>
          </div>

          {/* Row 3: Each [unit] contains [qty] [usage unit] */}
          <div style={p.field}>
            <label style={p.label}>Each {form.purchaseUnit} contains *</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                style={{ ...p.input, flex: 2 }}
                type="number" min="0" step="0.1"
                placeholder="e.g. 1000"
                value={form.unitsPerPurchase}
                onChange={e => setForm(f => ({ ...f, unitsPerPurchase: e.target.value }))}
              />
              <select
                style={{ ...p.input, flex: 1 }}
                value={form.usageUnit}
                onChange={e => setForm(f => ({ ...f, usageUnit: e.target.value as UsageUnit }))}
              >
                {USAGE_UNITS.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
            <span style={p.helper}>e.g. 1 Kg = 1000 grams, 1 Litre = 1000 ml</span>
          </div>

          {/* Row 4: Yield + Min Stock */}
          <div style={p.grid2}>
            <div style={p.field}>
              <label style={p.label}>Processing Yield %</label>
              <input
                style={p.input}
                type="number" min="1" max="100" step="0.1"
                placeholder="e.g. 95"
                value={form.yieldPct}
                onChange={e => setForm(f => ({ ...f, yieldPct: e.target.value }))}
              />
              <span style={p.helper}>How much is usable after cleaning/trimming/draining</span>
            </div>
            <div style={p.field}>
              <label style={p.label}>Min Stock Alert ({form.usageUnit})</label>
              <input
                style={p.input}
                type="number" min="0" step="1"
                placeholder="e.g. 500"
                value={form.minStockLevel}
                onChange={e => setForm(f => ({ ...f, minStockLevel: e.target.value }))}
              />
              <span style={p.helper}>Flag as Low Stock when quantity falls below this</span>
            </div>
          </div>

          {/* Row 5: Preferred Vendor + Category */}
          <div style={p.grid2}>
            <div style={p.field}>
              <label style={p.label}>Preferred Vendor</label>
              <select
                style={p.input}
                value={form.preferredVendorId}
                onChange={e => setForm(f => ({ ...f, preferredVendorId: e.target.value }))}
              >
                <option value="">— None —</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
            <div style={p.field}>
              <label style={p.label}>Procurement Category</label>
              <select
                style={p.input}
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              >
                <option value="">— Unset —</option>
                {PROCUREMENT_CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <span style={p.helper}>Filters the ingredient list when a vendor with a matching category is picked in Procurement</span>
            </div>
          </div>

          {/* Live costing preview */}
          {showPreview && (
            <div style={p.preview}>
              <div style={p.previewLine}>
                1 <b>{form.purchaseUnit}</b> of <b>{form.name || "ingredient"}</b> costs{" "}
                <b>₹{fmt(parsedCPU, 2)}</b>
              </div>
              <div style={p.previewLine}>
                Contains <b>{fmt(parsedUPP)} {form.usageUnit}</b> with{" "}
                <b>{parsedYld}%</b> yield
              </div>
              <div style={p.previewLine}>
                → Usable:{" "}
                <b style={{ color: "#16a34a" }}>{fmt(usable)} {form.usageUnit}</b>
              </div>
              <div style={{ ...p.previewLine, fontWeight: 700, color: "#111", marginTop: 4, fontSize: 15 }}>
                → Cost per {form.usageUnit === "grams" ? "gram" : form.usageUnit === "ml" ? "ml" : "piece"}:{" "}
                <span style={{ color: "#1B6E5C", fontSize: 18 }}>
                  ₹{fmt(calcCostPerUsageUnit, 4)}
                </span>
              </div>
            </div>
          )}

          <div style={p.btnRow}>
            {editRow && (
              <button
                style={p.secondaryBtn}
                onClick={() => { setForm(emptyForm); setEditRow(null); setError(""); setTab("list") }}
              >
                Cancel
              </button>
            )}
            <button
              style={{ ...p.primaryBtn, opacity: saving ? 0.7 : 1 }}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving…" : editRow ? "Update Ingredient" : "Add Ingredient"}
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TAB 3 — BULK STOCK UPDATE                                          */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {tab === "stock" && (
        <div style={p.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <h3 style={{ ...p.cardTitle, margin: 0 }}>📦 Bulk Stock Update</h3>
              <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>Add, remove, or set exact quantities for multiple ingredients at once</p>
            </div>
            <button
              style={{ ...p.secondaryBtn, height: 36, fontSize: 13 }}
              onClick={() => setStockRows(r => [...r, emptyStockRow()])}
            >
              + Add Row
            </button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={p.table}>
              <thead>
                <tr>
                  {["Ingredient", "Quantity", "Adjustment Type", "Note", ""].map(h => (
                    <th key={h} style={p.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stockRows.map((row, idx) => {
                  const ing = ingredients.find(i => i.id === row.ingredientId)
                  return (
                    <tr key={idx}>
                      <td style={{ ...p.td, minWidth: 220 }}>
                        <select
                          style={{ ...p.input, height: 36 }}
                          value={row.ingredientId}
                          onChange={e => updateStockRow(idx, "ingredientId", e.target.value)}
                        >
                          <option value="">— Select ingredient —</option>
                          {ingredients.map(i => (
                            <option key={i.id} value={i.id}>
                              {i.name} ({i.usage_unit || i.unit}) · {fmt(i.current_stock ?? 0, 1)} in stock
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ ...p.td, minWidth: 130 }}>
                        <input
                          style={{ ...p.input, height: 36 }}
                          type="number" min="0" step="0.01"
                          placeholder="qty"
                          value={row.qty}
                          onChange={e => updateStockRow(idx, "qty", e.target.value)}
                        />
                        {ing && (
                          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                            {ing.usage_unit || ing.unit}
                          </div>
                        )}
                      </td>
                      <td style={{ ...p.td, minWidth: 160 }}>
                        <select
                          style={{ ...p.input, height: 36 }}
                          value={row.type}
                          onChange={e => updateStockRow(idx, "type", e.target.value as AdjType)}
                        >
                          <option value="add">➕ Add to stock</option>
                          <option value="remove">➖ Remove from stock</option>
                          <option value="set">🔁 Set exact amount</option>
                        </select>
                      </td>
                      <td style={{ ...p.td, minWidth: 160 }}>
                        <input
                          style={{ ...p.input, height: 36 }}
                          placeholder="Optional note"
                          value={row.note}
                          onChange={e => updateStockRow(idx, "note", e.target.value)}
                        />
                      </td>
                      <td style={p.td}>
                        {stockRows.length > 1 && (
                          <button
                            style={{ ...p.iconBtn, background: "#fee2e2" }}
                            onClick={() => setStockRows(r => r.filter((_, i) => i !== idx))}
                          >✕</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Preview what will change */}
          {stockRows.some(r => r.ingredientId && r.qty) && (
            <div style={{ ...p.preview, marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#166534", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Preview Changes
              </div>
              {stockRows.filter(r => r.ingredientId && r.qty).map((row, idx) => {
                const ing = ingredients.find(i => i.id === row.ingredientId)
                if (!ing) return null
                const qty = parseFloat(row.qty) || 0
                let newQty = ing.current_stock ?? 0
                if (row.type === "add")    newQty = newQty + qty
                if (row.type === "remove") newQty = Math.max(0, newQty - qty)
                if (row.type === "set")    newQty = qty
                const isOk = ing.min_stock_level <= 0 || newQty >= ing.min_stock_level
                const upp = ing.units_per_purchase > 0 ? ing.units_per_purchase : 1
                const oldPurch = (ing.current_stock ?? 0) / upp
                const newPurch = newQty / upp
                const dispUnit = ing.purchase_unit || ing.usage_unit || ing.unit
                return (
                  <div key={idx} style={p.previewLine}>
                    <b>{ing.name}</b>:{" "}
                    {fmt(oldPurch, 2)} {dispUnit} → {" "}
                    <b style={{ color: isOk ? "#16a34a" : "#ef4444" }}>
                      {fmt(newPurch, 2)} {dispUnit}
                    </b>
                    <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 4 }}>
                      ({fmt(newQty, 0)} {ing.usage_unit || ing.unit})
                    </span>
                    {!isOk && <span style={{ fontSize: 11, color: "#ef4444", marginLeft: 4 }}>(below min stock)</span>}
                  </div>
                )
              })}
            </div>
          )}

          <div style={p.btnRow}>
            <button
              style={{ ...p.primaryBtn, opacity: stockSaving ? 0.7 : 1 }}
              onClick={handleBulkStock}
              disabled={stockSaving}
            >
              {stockSaving ? "Updating…" : "Update Stock"}
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TAB 4 — REORDER ALERTS                                             */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {tab === "reorder" && (
        <div style={p.card}>
          <h3 style={{ ...p.cardTitle, margin: "0 0 4px" }}>⚠️ Reorder Alerts</h3>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
            These ingredients have fallen below their min stock level based on system-tracked sales and production.
            Check the physical shelf before approving — this reflects what the system expects, not a confirmed count.
            Approved items get queued into a new Procurement request with a suggested quantity you can adjust.
          </p>

          {reorderList.length === 0 ? (
            <div style={p.empty}>✅ Nothing below its min stock level right now.</div>
          ) : (
            <>
              <div style={{ overflowX: "auto", marginBottom: 16 }}>
                <table style={p.table}>
                  <thead>
                    <tr>
                      {["", "Ingredient", "Current", "Min Stock", "Suggested Reorder Qty", ""].map(h => (
                        <th key={h} style={p.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reorderList.map(ing => {
                      const checked = !!reorderSelected[ing.id]
                      const upp = ing.units_per_purchase > 0 ? ing.units_per_purchase : 1
                      return (
                        <tr key={ing.id}>
                          <td style={p.td}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleReorderSelected(ing.id, ing)}
                            />
                          </td>
                          <td style={{ ...p.td, fontWeight: 600 }}>{ing.name}</td>
                          <td style={{ ...p.td, color: "#dc2626", fontFamily: "monospace" }}>
                            {fmt((ing.current_stock ?? 0) / upp, 2)} {ing.purchase_unit}
                          </td>
                          <td style={{ ...p.td, fontFamily: "monospace" }}>
                            {fmt(ing.min_stock_level / upp, 2)} {ing.purchase_unit}
                          </td>
                          <td style={p.td}>
                            <input
                              type="number" min="1" step="1"
                              style={{ ...p.input, height: 34, width: 90 }}
                              value={reorderQty[ing.id] ?? String(suggestedPurchaseQty(ing))}
                              onChange={e => setReorderQty(prev => ({ ...prev, [ing.id]: e.target.value }))}
                              disabled={!checked}
                            />
                            <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 4 }}>{ing.purchase_unit}</span>
                          </td>
                          <td style={p.td}>
                            {ing.category && (
                              <span style={{ ...p.badge, background: "#f3f4f6", color: "#374151" }}>{ing.category}</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div style={p.btnRow}>
                <button style={p.primaryBtn} onClick={sendToProcurement}>
                  ✓ Approve Selected → Create Procurement Order
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TAB 5 — RECONCILIATION LOG                                         */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {tab === "reconciliation" && (
        <div style={p.card}>
          <h3 style={{ ...p.cardTitle, margin: "0 0 4px" }}>🧾 Stock Reconciliation Log</h3>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
            Every time someone enters a physical count via "Set exact amount" in Stock Update, it's logged here —
            expected (system-tracked) vs actual (what was physically found), so shrinkage or counting errors are visible, not silently overwritten.
          </p>

          {reconLoading ? (
            <div style={p.empty}>Loading…</div>
          ) : reconLog.length === 0 ? (
            <div style={p.empty}>No physical counts logged yet.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={p.table}>
                <thead>
                  <tr>
                    {["Date", "Ingredient", "Expected", "Actual", "Difference", "By", "Note"].map(h => (
                      <th key={h} style={p.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reconLog.map((r, i) => {
                    const isShort = r.difference < 0
                    const isOver  = r.difference > 0
                    return (
                      <tr key={r.id} style={{ background: i % 2 === 0 ? "white" : "#f9fafb" }}>
                        <td style={p.td}>
                          {parseDbTimestamp(r.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td style={{ ...p.td, fontWeight: 600 }}>{r.ingredient_name}</td>
                        <td style={{ ...p.td, fontFamily: "monospace" }}>{fmt(r.expected_quantity, 1)} {r.usage_unit}</td>
                        <td style={{ ...p.td, fontFamily: "monospace" }}>{fmt(r.actual_quantity, 1)} {r.usage_unit}</td>
                        <td style={p.td}>
                          <span style={{
                            ...p.badge,
                            background: isShort ? "#fee2e2" : isOver ? "#dcfce7" : "#f3f4f6",
                            color:      isShort ? "#991b1b" : isOver ? "#166534" : "#6b7280",
                          }}>
                            {isShort ? "" : "+"}{fmt(r.difference, 1)} {r.usage_unit}
                          </span>
                        </td>
                        <td style={p.td}>
                          {r.adjusted_by_name || "—"}
                          {r.adjusted_by_role && <span style={{ color: "#9ca3af", fontSize: 11 }}> ({r.adjusted_by_role})</span>}
                        </td>
                        <td style={{ ...p.td, color: "#6b7280" }}>{r.note || "—"}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Delete modal ── */}
      {deleteId && (
        <div style={p.overlay} onClick={() => setDeleteId(null)}>
          <div style={p.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🗑️</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Delete Ingredient?</h3>
            <p style={{ color: "#6b7280", marginBottom: 20, fontSize: 14 }}>
              This will permanently remove the ingredient and all cost data.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button style={p.secondaryBtn} onClick={() => setDeleteId(null)}>Cancel</button>
              <button
                style={{ ...p.primaryBtn, background: "#ef4444" }}
                onClick={() => handleDelete(deleteId)}
              >Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Price history modal ── */}
      {historyIng && (
        <div style={p.overlay} onClick={() => setHistoryIng(null)}>
          <div
            style={{
              ...p.modal,
              maxWidth: 740, width: "95%", textAlign: "left",
              maxHeight: "90vh", overflowY: "auto", padding: "24px",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
                📈 {historyIng.name} — Price History
              </h3>
              <button
                onClick={() => setHistoryIng(null)}
                style={{ background: "#f3f4f6", border: "none", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 14 }}
              >✕</button>
            </div>

            {historyLoading ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#9ca3af" }}>Loading…</div>
            ) : priceHistory.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#9ca3af" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
                No purchase history yet.<br />
                <span style={{ fontSize: 13 }}>Prices are recorded when you receive stock via Procurement.</span>
              </div>
            ) : (
              <>
                <div style={{ height: 210, marginBottom: 20 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickFormatter={v => `₹${Number(v).toFixed(3)}`}
                        width={72}
                      />
                      <Tooltip formatter={(v: number) => [`₹${v.toFixed(4)}/${usageUnitLabel}`, ""]} />
                      {uniqueVendors.length > 1 && <Legend />}
                      {uniqueVendors.map((vendor, idx) => (
                        <Line
                          key={vendor}
                          type="monotone"
                          dataKey={vendor}
                          stroke={VENDOR_COLORS[idx % VENDOR_COLORS.length]}
                          strokeWidth={2}
                          dot={{ r: 5 }}
                          activeDot={{ r: 7 }}
                          connectNulls={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <table style={{ ...p.table, fontSize: 13 }}>
                  <thead>
                    <tr>
                      {["Date", "Vendor", "Qty", "Total", `Per ${usageUnitLabel}`, "vs Last"].map(h => (
                        <th key={h} style={{ ...p.th, background: "#f9fafb", padding: "8px 10px" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...priceHistory].reverse().map((h, i, arr) => {
                      const prevCost = arr[i + 1]?.cost_per_usage_unit
                      const pct = prevCost
                        ? ((h.cost_per_usage_unit - prevCost) / prevCost) * 100
                        : null
                      return (
                        <tr key={h.id} style={{ background: i % 2 === 0 ? "white" : "#f9fafb" }}>
                          <td style={p.td}>
                            {new Date(h.purchase_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                          </td>
                          <td style={p.td}>{h.vendor_name}</td>
                          <td style={p.td}>{h.quantity_received} {historyIng.purchase_unit}</td>
                          <td style={p.td}>₹{fmt(h.total_cost, 0)}</td>
                          <td style={{ ...p.td, fontWeight: 700 }}>₹{fmt(h.cost_per_usage_unit, 4)}/{usageUnitLabel}</td>
                          <td style={p.td}>
                            {pct === null
                              ? <span style={{ color: "#9ca3af" }}>—</span>
                              : pct > 0
                                ? <span style={{ color: "#dc2626", fontWeight: 700 }}>+{pct.toFixed(1)}% ↑</span>
                                : <span style={{ color: "#16a34a", fontWeight: 700 }}>{pct.toFixed(1)}% ↓</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const p: Record<string, React.CSSProperties> = {
  page:        { padding: "16px 16px 80px", maxWidth: 1200, margin: "0 auto" },
  header:      { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  title:       { fontSize: 22, fontWeight: 800, color: "#111", margin: 0 },
  subtitle:    { fontSize: 13, color: "#6b7280", marginTop: 4 },
  statPill:    { background: "hsl(var(--primary))", color: "white", borderRadius: 20, padding: "6px 14px", fontSize: 13, fontWeight: 600 },
  tabRow:      { display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" },
  tabBtn:      { height: 36, padding: "0 16px", border: "1px solid #e5e7eb", borderRadius: 20, fontSize: 13, cursor: "pointer" },
  card:        { background: "white", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, marginBottom: 16 },
  cardTitle:   { fontSize: 15, fontWeight: 700, color: "#111", margin: "0 0 16px" },
  tableHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  grid2:       { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 },
  field:       { display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 },
  label:       { fontSize: 12, fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: "0.4px" },
  helper:      { fontSize: 11, color: "#9ca3af", marginTop: 2 },
  input: {
    height: 40, padding: "0 12px", border: "1px solid #d1d5db", borderRadius: 8,
    fontSize: 14, color: "#111", background: "#fafafa", outline: "none",
    width: "100%", boxSizing: "border-box",
  },
  preview:       { background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "12px 16px", marginBottom: 12 },
  previewLine:   { fontSize: 13, color: "#374151", marginBottom: 4, lineHeight: 1.5 },
  errorBanner:   { background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 12 },
  successBanner: { background: "#dcfce7", color: "#166534", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 12 },
  btnRow:        { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 },
  primaryBtn:    { height: 44, padding: "0 20px", background: "hsl(var(--primary))", color: "white", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" },
  secondaryBtn:  { height: 44, padding: "0 20px", background: "white", color: "#374151", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  linkBtn:       { background: "none", border: "none", color: "#111", fontWeight: 700, cursor: "pointer", textDecoration: "underline", fontSize: 14 },
  table:         { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    padding: "10px 12px", background: "#f3f4f6", textAlign: "left",
    fontSize: 11, fontWeight: 700, color: "#6b7280",
    textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap",
  },
  td:            { padding: "10px 12px", borderBottom: "1px solid #f3f4f6", color: "#111", whiteSpace: "nowrap" },
  badge:         { display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700 },
  iconBtn: {
    background: "#f3f4f6", border: "none", borderRadius: 6,
    width: 32, height: 32, cursor: "pointer", fontSize: 14,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
  },
  empty:         { textAlign: "center", padding: "40px 0", color: "#9ca3af", fontSize: 14 },
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
  },
  modal:         { background: "white", borderRadius: 14, padding: "28px 24px", maxWidth: 400, width: "90%", textAlign: "center" },
}
