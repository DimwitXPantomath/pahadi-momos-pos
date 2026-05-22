import React, { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts"

// ─── Types ────────────────────────────────────────────────────────────────────

type PurchaseUnit = "Kg" | "Litre" | "Bottle" | "Box" | "Pack" | "Packet" | "Tray" | "Can" | "Dozen" | "Piece"
type UsageUnit   = "grams" | "ml" | "pieces"

interface IngredientRow {
  id: string; name: string; unit: string; created_at: string
  // New columns (added by migration 005)
  purchase_unit: string | null; units_per_purchase: number | null
  yield_percentage: number | null; usage_unit: string | null
  min_stock_level: number | null; cost_per_usage_unit: number | null
  last_purchase_cost: number | null
  // Legacy columns (from original schema — kept for backward compat)
  processing_yield_pct: number | null
  purchase_qty: number | null; purchase_cost: number | null
  cost_per_unit: number | null
}

interface PriceHistoryRow {
  id: string; purchase_date: string
  quantity_received: number; total_cost: number
  cost_per_usage_unit: number
  vendor_id: string; vendor_name: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PURCHASE_UNITS: PurchaseUnit[] = [
  "Kg", "Litre", "Bottle", "Box", "Pack", "Packet", "Tray", "Can", "Dozen", "Piece",
]
const USAGE_UNITS: UsageUnit[] = ["grams", "ml", "pieces"]
const VENDOR_COLORS = ["#f97316", "#3b82f6", "#10b981", "#8b5cf6", "#ec4899"]

const emptyForm = {
  name:             "",
  purchaseUnit:     "Kg" as PurchaseUnit,
  unitsPerPurchase: "",
  usageUnit:        "grams" as UsageUnit,
  yieldPct:         "100",
  minStockLevel:    "",
}

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: d })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function IngredientsView() {
  const [form, setForm]           = useState(emptyForm)
  const [ingredients, setIngredients] = useState<IngredientRow[]>([])
  const [loading, setLoading]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState("")
  const [success, setSuccess]     = useState("")
  const [deleteId, setDeleteId]   = useState<string | null>(null)
  const [editRow, setEditRow]     = useState<IngredientRow | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  // Price history
  const [historyIng, setHistoryIng]         = useState<IngredientRow | null>(null)
  const [priceHistory, setPriceHistory]     = useState<PriceHistoryRow[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // ── Live calculation ───────────────────────────────────────────────────────
  const parsedUnits    = parseFloat(form.unitsPerPurchase) || 0
  const parsedYield    = parseFloat(form.yieldPct) || 0
  const parsedMinStock = parseFloat(form.minStockLevel) || 0
  const usable         = parsedUnits > 0 && parsedYield > 0 ? parsedUnits * (parsedYield / 100) : 0
  const wastage        = parsedUnits - usable
  const showPreview    = parsedUnits > 0

  // ── Fetch ingredients ──────────────────────────────────────────────────────
  async function fetchIngredients() {
    setLoading(true)
    const { data, error } = await supabase
      .from("ingredients")
      .select("*")
      .order("created_at", { ascending: false })
    if (error) setError(error.message)
    else setIngredients((data || []) as IngredientRow[])
    setLoading(false)
  }

  useEffect(() => { fetchIngredients() }, [])

  // ── Fetch price history ────────────────────────────────────────────────────
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

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.name.trim())              { setError("Ingredient name is required"); return }
    if (parsedUnits <= 0)               { setError("Enter how many units per purchase (e.g. 570)"); return }
    if (parsedYield <= 0 || parsedYield > 100) { setError("Yield must be 1–100%"); return }

    setSaving(true)
    setError("")

    const payload = {
      name:              form.name.trim(),
      purchase_unit:     form.purchaseUnit,
      units_per_purchase: parsedUnits,
      usage_unit:        form.usageUnit,
      unit:              form.usageUnit,        // keep legacy `unit` in sync
      yield_percentage:  parsedYield,
      min_stock_level:   parsedMinStock || 0,
      cost_per_usage_unit: editRow?.cost_per_usage_unit ?? 0,
      // Legacy columns — set safe defaults so NOT NULL constraints don't fire
      processing_yield_pct: parsedYield,
      purchase_qty:      parsedUnits,
      purchase_cost:     0,
      cost_per_unit:     0,
      usable_qty:        usable,
      wastage_qty:       wastage,
    }

    let err
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
      setTimeout(() => setSuccess(""), 2500)
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
      name:             row.name,
      purchaseUnit:     (row.purchase_unit as PurchaseUnit) || "Kg",
      unitsPerPurchase: String(row.units_per_purchase ?? row.purchase_qty ?? ""),
      usageUnit:        (row.usage_unit as UsageUnit) || "grams",
      yieldPct:         String(row.yield_percentage ?? row.processing_yield_pct ?? 100),
      minStockLevel:    String(row.min_stock_level ?? ""),
    })
    setEditRow(row)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const filtered = ingredients.filter(i =>
    i.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // ── Chart data ─────────────────────────────────────────────────────────────
  const uniqueVendors = [...new Set(priceHistory.map(h => h.vendor_name))]
  const chartData = priceHistory.reduce((acc: Record<string, string | number>[], point) => {
    const dateStr = new Date(point.purchase_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
    let existing = acc.find(d => d.date === dateStr)
    if (!existing) { existing = { date: dateStr }; acc.push(existing) }
    existing[point.vendor_name] = point.cost_per_usage_unit
    return acc
  }, [])
  const usageUnitLabel = historyIng?.usage_unit || historyIng?.unit || "unit"

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={p.page}>

      {/* Header */}
      <div style={p.header}>
        <div>
          <h2 style={p.title}>🥕 Ingredients</h2>
          <p style={p.subtitle}>Set up ingredients — costs are tracked at time of purchase</p>
        </div>
        <div style={p.statPill}>
          {ingredients.length} ingredient{ingredients.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* ── Form ── */}
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

        {/* Row 2: Each unit contains [qty] [usage unit] */}
        <div style={p.field}>
          <label style={p.label}>Each {form.purchaseUnit} contains *</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={{ ...p.input, flex: 2 }}
              type="number" min="0" step="0.1"
              placeholder="e.g. 570"
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
        </div>

        {/* Row 3: Yield + Min Stock */}
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
            <label style={p.label}>Low Stock Alert ({form.usageUnit})</label>
            <input
              style={p.input}
              type="number" min="0" step="1"
              placeholder="e.g. 500"
              value={form.minStockLevel}
              onChange={e => setForm(f => ({ ...f, minStockLevel: e.target.value }))}
            />
            <span style={p.helper}>Alert when stock falls below this amount</span>
          </div>
        </div>

        {/* Live preview */}
        {showPreview && (
          <div style={p.preview}>
            <div style={p.previewLine}>
              1 <b>{form.purchaseUnit}</b> of <b>{form.name || "ingredient"}</b> contains{" "}
              <b>{fmt(parsedUnits)} {form.usageUnit}</b>
            </div>
            {parsedYield > 0 && parsedYield < 100 && (
              <>
                <div style={p.previewLine}>
                  After <b>{parsedYield}%</b> yield →{" "}
                  <b style={{ color: "#16a34a" }}>{fmt(usable)} {form.usageUnit}</b> usable
                </div>
                <div style={p.previewLine}>
                  Wastage per purchase:{" "}
                  <b style={{ color: "#ef4444" }}>{fmt(wastage)} {form.usageUnit}</b>
                </div>
              </>
            )}
            <div style={{ ...p.previewLine, color: "#9ca3af", fontSize: 12 }}>
              Cost per {form.usageUnit}: <i>calculated at time of purchase</i>
            </div>
          </div>
        )}

        {error   && <div style={p.errorBanner}>⚠️ {error}</div>}
        {success && <div style={p.successBanner}>✅ {success}</div>}

        <div style={p.btnRow}>
          {editRow && (
            <button
              style={p.secondaryBtn}
              onClick={() => { setForm(emptyForm); setEditRow(null); setError("") }}
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

      {/* ── Table ── */}
      <div style={p.card}>
        <div style={p.tableHeader}>
          <h3 style={p.cardTitle}>📋 All Ingredients</h3>
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
              : "No ingredients yet. Add your first one above!"}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={p.table}>
              <thead>
                <tr>
                  {["Name", "Purchase Unit", "Per Unit", "Yield %", "Min Stock", "₹/unit", ""].map(h => (
                    <th key={h} style={p.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => {
                  const yieldVal      = row.yield_percentage ?? row.processing_yield_pct ?? 100
                  const cpu           = row.cost_per_usage_unit ?? row.cost_per_unit ?? 0
                  const unitsPerPurch = row.units_per_purchase ?? row.purchase_qty
                  const usageU        = row.usage_unit || row.unit
                  return (
                    <tr key={row.id} style={{ background: i % 2 === 0 ? "white" : "#f9fafb" }}>
                      <td style={{ ...p.td, fontWeight: 600 }}>{row.name}</td>
                      <td style={p.td}>{row.purchase_unit || "—"}</td>
                      <td style={p.td}>
                        {unitsPerPurch != null
                          ? `${fmt(unitsPerPurch)} ${usageU}`
                          : "—"}
                      </td>
                      <td style={p.td}>
                        <span style={{
                          ...p.badge,
                          background: yieldVal >= 90 ? "#dcfce7" : yieldVal >= 70 ? "#fef9c3" : "#fee2e2",
                          color:      yieldVal >= 90 ? "#166534" : yieldVal >= 70 ? "#854d0e" : "#991b1b",
                        }}>
                          {yieldVal}%
                        </span>
                      </td>
                      <td style={p.td}>
                        {row.min_stock_level
                          ? `${fmt(row.min_stock_level)} ${usageU}`
                          : "—"}
                      </td>
                      <td style={{ ...p.td, fontWeight: 700 }}>
                        {cpu > 0
                          ? `₹${fmt(cpu, 4)}`
                          : <span style={{ color: "#9ca3af", fontSize: 11, fontWeight: 400 }}>No purchase yet</span>}
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

      {/* ── Delete modal ── */}
      {deleteId && (
        <div style={p.overlay} onClick={() => setDeleteId(null)}>
          <div style={p.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🗑️</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Delete Ingredient?</h3>
            <p style={{ color: "#6b7280", marginBottom: 20, fontSize: 14 }}>
              This will permanently remove the ingredient and its cost data.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
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
            {/* Modal header */}
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
                <span style={{ fontSize: 13 }}>Prices are recorded when you receive stock in Procurement.</span>
              </div>
            ) : (
              <>
                {/* Line chart */}
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
                      <Tooltip
                        formatter={(v: number) => [`₹${v.toFixed(4)}/${usageUnitLabel}`, ""]}
                      />
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

                {/* History table */}
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
                      const prevCost  = arr[i + 1]?.cost_per_usage_unit
                      const pct       = prevCost
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
                          <td style={{ ...p.td, fontWeight: 700 }}>
                            ₹{fmt(h.cost_per_usage_unit, 4)}/{usageUnitLabel}
                          </td>
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
  page:        { padding: "16px 16px 80px", maxWidth: 1100, margin: "0 auto" },
  header:      { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  title:       { fontSize: 22, fontWeight: 800, color: "#111", margin: 0 },
  subtitle:    { fontSize: 13, color: "#6b7280", marginTop: 4 },
  statPill:    { background: "#111", color: "white", borderRadius: 20, padding: "6px 14px", fontSize: 13, fontWeight: 600 },
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
  preview:     { background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "12px 16px", marginBottom: 12 },
  previewLine: { fontSize: 13, color: "#374151", marginBottom: 4, lineHeight: 1.5 },
  errorBanner:   { background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 12 },
  successBanner: { background: "#dcfce7", color: "#166534", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 12 },
  btnRow:      { display: "flex", gap: 10, justifyContent: "flex-end" },
  primaryBtn:  { height: 44, padding: "0 20px", background: "#111", color: "white", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" },
  secondaryBtn:{ height: 44, padding: "0 20px", background: "white", color: "#374151", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  table:       { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    padding: "10px 12px", background: "#f3f4f6", textAlign: "left",
    fontSize: 11, fontWeight: 700, color: "#6b7280",
    textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap",
  },
  td:          { padding: "10px 12px", borderBottom: "1px solid #f3f4f6", color: "#111", whiteSpace: "nowrap" },
  badge:       { display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 12, fontWeight: 700 },
  iconBtn: {
    background: "#f3f4f6", border: "none", borderRadius: 6,
    width: 32, height: 32, cursor: "pointer", fontSize: 14,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
  },
  empty:       { textAlign: "center", padding: "40px 0", color: "#9ca3af", fontSize: 14 },
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
  },
  modal:       { background: "white", borderRadius: 14, padding: "28px 24px", maxWidth: 360, width: "90%", textAlign: "center" },
}
