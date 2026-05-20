import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"

// ─── Types ────────────────────────────────────────────────────────────────────

type PurchaseUnit = "kg" | "litre" | "box" | "pcs" | "dozen" | "carton" | "bag"
type UsageUnit = "g" | "ml" | "pcs" | "kg" | "litre" | "portion"

interface IngredientRow {
  id: string
  name: string
  unit: UsageUnit
  purchase_unit: PurchaseUnit
  purchase_qty: number       // stored in usage units
  purchase_cost: number
  processing_yield_pct: number
  cost_per_unit: number
  usable_qty: number
  wastage_qty: number
  units_per_purchase: number // how many usage-unit per 1 purchase-unit
  created_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcYield(totalUsageQty: number, purchaseCost: number, yieldPct: number) {
  const usable = totalUsageQty * (yieldPct / 100)
  const wastage = totalUsageQty - usable
  const costPerUnit = usable > 0 ? purchaseCost / usable : 0
  return { usable, wastage, costPerUnit }
}

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: decimals })
}

function fmtCurrency(n: number) {
  return "₹" + fmt(n, 2)
}

// Suggest a sensible default units_per_purchase when purchase+usage unit changes
function suggestConversion(pu: PurchaseUnit, uu: UsageUnit): number {
  if (pu === "kg"    && uu === "g")      return 1000
  if (pu === "litre" && uu === "ml")     return 1000
  if (pu === "dozen" && uu === "pcs")    return 12
  if (pu === "kg"    && uu === "kg")     return 1
  if (pu === "litre" && uu === "litre")  return 1
  return 0  // 0 = no suggestion, user must fill in
}

// ─── Empty Form State ─────────────────────────────────────────────────────────

const emptyForm = {
  name: "",
  purchaseUnit: "kg" as PurchaseUnit,
  usageUnit: "g" as UsageUnit,
  unitsPerPurchase: "1000",
  purchaseQty: "",
  purchaseCost: "",
  yieldPct: "100",
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function IngredientsView() {
  const [form, setForm] = useState(emptyForm)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [ingredients, setIngredients] = useState<IngredientRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [editRow, setEditRow] = useState<IngredientRow | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  // ── Live calculation ───────────────────────────────────────────────────────
  const parsedQty      = parseFloat(form.purchaseQty) || 0
  const parsedCost     = parseFloat(form.purchaseCost) || 0
  const parsedYield    = parseFloat(form.yieldPct) || 100
  const parsedUpp      = parseFloat(form.unitsPerPurchase) || 1
  const totalUsageQty  = parsedQty * parsedUpp          // e.g. 1 box × 3000g = 3000g
  const { usable, wastage, costPerUnit } = calcYield(totalUsageQty, parsedCost, parsedYield)

  // When purchase or usage unit changes, auto-suggest the conversion factor
  function handlePurchaseUnitChange(pu: PurchaseUnit) {
    const suggested = suggestConversion(pu, form.usageUnit)
    setForm(f => ({
      ...f,
      purchaseUnit: pu,
      unitsPerPurchase: suggested > 0 ? String(suggested) : f.unitsPerPurchase,
    }))
  }

  function handleUsageUnitChange(uu: UsageUnit) {
    const suggested = suggestConversion(form.purchaseUnit, uu)
    setForm(f => ({
      ...f,
      usageUnit: uu,
      unitsPerPurchase: suggested > 0 ? String(suggested) : f.unitsPerPurchase,
    }))
  }

  // ── Fetch ──────────────────────────────────────────────────────────────────
  async function fetchIngredients() {
    setLoading(true)
    const { data, error } = await supabase
      .from("ingredients")
      .select("*")
      .order("created_at", { ascending: false })
    if (error) setError(error.message)
    else setIngredients(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchIngredients() }, [])

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.name.trim())        { setError("Ingredient name is required"); return }
    if (parsedQty <= 0)           { setError("Enter a valid quantity bought"); return }
    if (parsedCost <= 0)          { setError("Enter a valid cost"); return }
    if (parsedUpp <= 0)           { setError("Conversion (units per purchase) must be > 0"); return }
    if (parsedYield <= 0 || parsedYield > 100) { setError("Yield must be 1–100%"); return }

    setSaving(true)
    setError("")

    const payload = {
      name:                  form.name.trim(),
      unit:                  form.usageUnit,
      purchase_unit:         form.purchaseUnit,
      units_per_purchase:    parsedUpp,
      purchase_qty:          totalUsageQty,       // stored in usage units
      purchase_cost:         parsedCost,
      processing_yield_pct:  parsedYield,
      cost_per_unit:         costPerUnit,
      usable_qty:            usable,
      wastage_qty:           wastage,
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
      setShowAdvanced(false)
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
    const upp = row.units_per_purchase || 1
    const displayQty = row.purchase_qty / upp   // reverse: usage_qty ÷ units_per_purchase
    setForm({
      name:             row.name,
      purchaseUnit:     row.purchase_unit,
      usageUnit:        row.unit,
      unitsPerPurchase: String(upp),
      purchaseQty:      String(displayQty),
      purchaseCost:     String(row.purchase_cost),
      yieldPct:         String(row.processing_yield_pct),
    })
    setShowAdvanced(row.processing_yield_pct !== 100)
    setEditRow(row)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  function cancelEdit() {
    setForm(emptyForm)
    setShowAdvanced(false)
    setEditRow(null)
    setError("")
  }

  const filtered = ingredients.filter(i =>
    i.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div style={s.page}>

      {/* ── Header ── */}
      <div style={s.header}>
        <div>
          <h2 style={s.title}>🥕 Ingredients</h2>
          <p style={s.subtitle}>Track raw material costs with purchase-to-usage conversion</p>
        </div>
        <div style={s.statPill}>
          {ingredients.length} ingredient{ingredients.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* ── Form Card ── */}
      <div style={s.card}>
        <h3 style={s.cardTitle}>
          {editRow ? `✏️ Editing: ${editRow.name}` : "➕ Add Ingredient"}
        </h3>

        {/* Row 1: Name + Purchase unit */}
        <div style={s.grid2}>
          <div style={s.field}>
            <label style={s.label}>Ingredient Name *</label>
            <input
              style={s.input}
              placeholder="e.g. Milk, Mascarpone"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div style={s.field}>
            <label style={s.label}>Purchase Unit *</label>
            <select
              style={s.input}
              value={form.purchaseUnit}
              onChange={e => handlePurchaseUnitChange(e.target.value as PurchaseUnit)}
            >
              <option value="kg">kg</option>
              <option value="litre">Litre</option>
              <option value="box">Box</option>
              <option value="dozen">Dozen</option>
              <option value="carton">Carton</option>
              <option value="bag">Bag</option>
              <option value="pcs">Pcs</option>
            </select>
          </div>
        </div>

        {/* Row 2: Usage unit + Conversion */}
        <div style={s.grid2}>
          <div style={s.field}>
            <label style={s.label}>Usage Unit (in recipes) *</label>
            <select
              style={s.input}
              value={form.usageUnit}
              onChange={e => handleUsageUnitChange(e.target.value as UsageUnit)}
            >
              <option value="g">Grams (g)</option>
              <option value="ml">Millilitres (ml)</option>
              <option value="pcs">Pieces (pcs)</option>
              <option value="kg">Kilograms (kg)</option>
              <option value="litre">Litres</option>
              <option value="portion">Portion</option>
            </select>
          </div>
          <div style={s.field}>
            <label style={s.label}>
              {form.usageUnit} per {form.purchaseUnit} *{" "}
              <span style={{ fontWeight: 400, color: "#9ca3af", textTransform: "none", letterSpacing: 0 }}>
                (conversion)
              </span>
            </label>
            <input
              style={s.input}
              type="number"
              min="0.001"
              step="any"
              placeholder={`How many ${form.usageUnit} in 1 ${form.purchaseUnit}?`}
              value={form.unitsPerPurchase}
              onChange={e => setForm(f => ({ ...f, unitsPerPurchase: e.target.value }))}
            />
          </div>
        </div>

        {/* Conversion hint */}
        {parsedUpp > 0 && (
          <div style={s.hintStrip}>
            💡 1 {form.purchaseUnit} = {fmt(parsedUpp, 3)} {form.usageUnit}
            {parsedQty > 0 && (
              <> · {fmt(parsedQty, 3)} {form.purchaseUnit} = <strong>{fmt(totalUsageQty, 1)} {form.usageUnit}</strong></>
            )}
          </div>
        )}

        {/* Row 3: Qty + Cost */}
        <div style={s.grid2}>
          <div style={s.field}>
            <label style={s.label}>Qty Bought ({form.purchaseUnit}) *</label>
            <input
              style={s.input}
              type="number"
              min="0"
              step="any"
              placeholder={`e.g. 2 ${form.purchaseUnit}`}
              value={form.purchaseQty}
              onChange={e => setForm(f => ({ ...f, purchaseQty: e.target.value }))}
            />
          </div>
          <div style={s.field}>
            <label style={s.label}>Total Cost (₹) *</label>
            <input
              style={s.input}
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 450"
              value={form.purchaseCost}
              onChange={e => setForm(f => ({ ...f, purchaseCost: e.target.value }))}
            />
          </div>
        </div>

        {/* Advanced: Processing Yield */}
        <div style={{ marginBottom: 12 }}>
          <button
            type="button"
            style={s.advancedToggle}
            onClick={() => setShowAdvanced(v => !v)}
          >
            {showAdvanced ? "▾" : "▸"} Advanced — Processing Yield
            <span style={{ marginLeft: 8, fontWeight: 400, color: "#9ca3af", fontSize: 12 }}>
              {showAdvanced ? "" : `(currently ${form.yieldPct}% — skip if no waste)`}
            </span>
          </button>
          {showAdvanced && (
            <div style={{ marginTop: 8, maxWidth: 320 }}>
              <div style={s.field}>
                <label style={s.label}>Processing Yield %</label>
                <input
                  style={s.input}
                  type="number"
                  min="1"
                  max="100"
                  step="0.1"
                  placeholder="e.g. 85 (leave 100 if no wastage)"
                  value={form.yieldPct}
                  onChange={e => setForm(f => ({ ...f, yieldPct: e.target.value }))}
                />
                <span style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                  e.g. 85% means 15% lost in peeling/trimming. Leave at 100 if you use the full quantity.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Live calculation strip */}
        {parsedQty > 0 && parsedCost > 0 && parsedUpp > 0 && (
          <div style={s.calcStrip}>
            <div style={s.calcItem}>
              <span style={s.calcLabel}>Total ({form.usageUnit})</span>
              <span style={s.calcValue}>{fmt(totalUsageQty, 1)} {form.usageUnit}</span>
            </div>
            <div style={s.calcDivider} />
            <div style={s.calcItem}>
              <span style={s.calcLabel}>Usable</span>
              <span style={{ ...s.calcValue, color: "#16a34a" }}>{fmt(usable, 1)} {form.usageUnit}</span>
            </div>
            {parsedYield < 100 && (
              <>
                <div style={s.calcDivider} />
                <div style={s.calcItem}>
                  <span style={s.calcLabel}>Wastage</span>
                  <span style={{ ...s.calcValue, color: "#ef4444" }}>{fmt(wastage, 1)} {form.usageUnit}</span>
                </div>
              </>
            )}
            <div style={s.calcDivider} />
            <div style={s.calcItem}>
              <span style={s.calcLabel}>Cost / {form.usageUnit}</span>
              <span style={{ ...s.calcValue, color: "#16a34a" }}>{fmtCurrency(costPerUnit)}</span>
            </div>
          </div>
        )}

        {error && <div style={s.errorBanner}>⚠️ {error}</div>}
        {success && <div style={s.successBanner}>✅ {success}</div>}

        <div style={s.btnRow}>
          {editRow && (
            <button style={s.secondaryBtn} onClick={cancelEdit}>Cancel</button>
          )}
          <button
            style={{ ...s.primaryBtn, opacity: saving ? 0.7 : 1 }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : editRow ? "Update Ingredient" : "Add Ingredient"}
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      <div style={s.card}>
        <div style={s.tableHeader}>
          <h3 style={s.cardTitle}>📋 All Ingredients</h3>
          <input
            style={{ ...s.input, width: 200, margin: 0 }}
            placeholder="🔍 Search…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        {loading ? (
          <div style={s.emptyState}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={s.emptyState}>
            {searchQuery ? "No ingredients match your search" : "No ingredients yet. Add your first one above!"}
          </div>
        ) : (
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  {["Name", "Buy Unit", "Qty Bought", "Usage Unit", "Total", "Cost (₹)", "Yield", "Usable", "₹/unit", ""].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => {
                  const upp = row.units_per_purchase || 1
                  const displayQty = row.purchase_qty / upp
                  return (
                    <tr key={row.id} style={{ background: i % 2 === 0 ? "white" : "#f9fafb" }}>
                      <td style={{ ...s.td, fontWeight: 600 }}>{row.name}</td>
                      <td style={s.td}>{row.purchase_unit}</td>
                      <td style={{ ...s.td, textAlign: "right" }}>
                        {fmt(displayQty, 2)} {row.purchase_unit}
                      </td>
                      <td style={s.td}>
                        <span style={s.unitPill}>{row.unit}</span>
                      </td>
                      <td style={{ ...s.td, textAlign: "right" }}>
                        {fmt(row.purchase_qty, 1)} {row.unit}
                      </td>
                      <td style={{ ...s.td, textAlign: "right" }}>{fmtCurrency(row.purchase_cost)}</td>
                      <td style={{ ...s.td, textAlign: "right" }}>
                        <span style={{
                          ...s.badge,
                          background: row.processing_yield_pct >= 90 ? "#dcfce7" : row.processing_yield_pct >= 70 ? "#fef9c3" : "#fee2e2",
                          color: row.processing_yield_pct >= 90 ? "#166534" : row.processing_yield_pct >= 70 ? "#854d0e" : "#991b1b",
                        }}>
                          {row.processing_yield_pct}%
                        </span>
                      </td>
                      <td style={{ ...s.td, textAlign: "right", color: "#16a34a", fontWeight: 600 }}>
                        {fmt(row.usable_qty, 1)} {row.unit}
                      </td>
                      <td style={{ ...s.td, textAlign: "right", fontWeight: 700 }}>
                        {fmtCurrency(row.cost_per_unit)}
                      </td>
                      <td style={s.td}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button style={s.editBtn} onClick={() => startEdit(row)}>✏️</button>
                          <button style={s.deleteBtn} onClick={() => setDeleteId(row.id)}>🗑️</button>
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

      {/* ── Delete confirm modal ── */}
      {deleteId && (
        <div style={s.overlay} onClick={() => setDeleteId(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🗑️</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Delete Ingredient?</h3>
            <p style={{ color: "#6b7280", marginBottom: 20, fontSize: 14 }}>
              This will permanently remove the ingredient and its cost data.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button style={s.secondaryBtn} onClick={() => setDeleteId(null)}>Cancel</button>
              <button
                style={{ ...s.primaryBtn, background: "#ef4444" }}
                onClick={() => handleDelete(deleteId)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: {
    padding: "16px 16px 80px",
    maxWidth: 1100,
    margin: "0 auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 800,
    color: "#111",
    margin: 0,
  },
  subtitle: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 4,
  },
  statPill: {
    background: "#111",
    color: "white",
    borderRadius: 20,
    padding: "6px 14px",
    fontSize: 13,
    fontWeight: 600,
  },
  card: {
    background: "white",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: "#111",
    margin: "0 0 16px",
  },
  tableHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    marginBottom: 12,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: "#374151",
    textTransform: "uppercase",
    letterSpacing: "0.4px",
  },
  input: {
    height: 40,
    padding: "0 12px",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    fontSize: 14,
    color: "#111",
    background: "#fafafa",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  },
  hintStrip: {
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    borderRadius: 8,
    padding: "8px 14px",
    fontSize: 13,
    color: "#1e40af",
    marginBottom: 12,
  },
  advancedToggle: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    color: "#6b7280",
    padding: 0,
    display: "flex",
    alignItems: "center",
  },
  calcStrip: {
    display: "flex",
    alignItems: "center",
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: 10,
    padding: "12px 16px",
    marginTop: 4,
    marginBottom: 12,
    gap: 0,
    flexWrap: "wrap",
  },
  calcItem: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minWidth: 80,
    padding: "0 12px",
    alignItems: "center",
  },
  calcLabel: {
    fontSize: 11,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    marginBottom: 4,
  },
  calcValue: {
    fontSize: 16,
    fontWeight: 800,
    color: "#111",
  },
  calcDivider: {
    width: 1,
    height: 32,
    background: "#bbf7d0",
  },
  errorBanner: {
    background: "#fee2e2",
    color: "#991b1b",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 13,
    marginBottom: 12,
  },
  successBanner: {
    background: "#dcfce7",
    color: "#166534",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 13,
    marginBottom: 12,
  },
  btnRow: {
    display: "flex",
    gap: 10,
    justifyContent: "flex-end",
  },
  primaryBtn: {
    height: 44,
    padding: "0 20px",
    background: "#111",
    color: "white",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryBtn: {
    height: 44,
    padding: "0 20px",
    background: "white",
    color: "#374151",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  tableWrap: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
  },
  th: {
    padding: "10px 12px",
    background: "#f3f4f6",
    textAlign: "left",
    fontSize: 11,
    fontWeight: 700,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "10px 12px",
    borderBottom: "1px solid #f3f4f6",
    color: "#111",
    whiteSpace: "nowrap",
  },
  badge: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 700,
  },
  unitPill: {
    display: "inline-block",
    background: "#ede9fe",
    color: "#6d28d9",
    padding: "2px 8px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 700,
  },
  editBtn: {
    background: "#f3f4f6",
    border: "none",
    borderRadius: 6,
    width: 32,
    height: 32,
    cursor: "pointer",
    fontSize: 14,
  },
  deleteBtn: {
    background: "#fee2e2",
    border: "none",
    borderRadius: 6,
    width: 32,
    height: 32,
    cursor: "pointer",
    fontSize: 14,
  },
  emptyState: {
    textAlign: "center",
    padding: "40px 0",
    color: "#9ca3af",
    fontSize: 14,
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 200,
  },
  modal: {
    background: "white",
    borderRadius: 14,
    padding: "28px 24px",
    maxWidth: 360,
    width: "90%",
    textAlign: "center",
  },
}
