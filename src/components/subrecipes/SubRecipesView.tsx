import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Ingredient {
  id: string
  name: string
  unit: string
  cost_per_unit: number
}

interface SubRecipe {
  id: string
  name: string
  yield_qty: number
  unit: string
  description: string
}

interface SubRecipeItem {
  id: string
  sub_recipe_id: string
  ingredient_id: string
  ingredient_name: string
  ingredient_unit: string
  ingredient_cost_per_unit: number
  quantity: number
  yield_percent: number
  usable_qty: number
  wastage: number
  line_cost: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: d })
}
function fmtCurrency(n: number) {
  return "₹" + fmt(n, 2)
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SubRecipesView() {
  const [subRecipes, setSubRecipes] = useState<SubRecipe[]>([])
  const [selected, setSelected] = useState<SubRecipe | null>(null)
  const [items, setItems] = useState<SubRecipeItem[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [showForm, setShowForm] = useState(false)

  const [srForm, setSrForm] = useState({ name: "", yield_qty: "1", unit: "g", description: "" })
  const [addForm, setAddForm] = useState({ ingredient_id: "", quantity: "", yield_percent: "100" })

  // ── Fetchers ───────────────────────────────────────────────────────────────

  const fetchSubRecipes = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from("sub_recipes").select("*").order("name")
    if (error) setError(error.message)
    else setSubRecipes(data || [])
    setLoading(false)
  }, [])

  const fetchIngredients = useCallback(async () => {
    const { data } = await supabase
      .from("ingredients")
      .select("id, name, unit, cost_per_unit")
      .order("name")
    setIngredients(data || [])
  }, [])

  const fetchItems = useCallback(async (id: string) => {
    const { data } = await supabase
      .from("sub_recipe_items")
      .select(`id, sub_recipe_id, ingredient_id, quantity, yield_percent, wastage, ingredients(name, unit, cost_per_unit)`)
      .eq("sub_recipe_id", id)

    const mapped: SubRecipeItem[] = (data || []).map((row: any) => {
      const costPer = row.ingredients?.cost_per_unit ?? 0
      const usable = row.quantity * (row.yield_percent / 100)
      return {
        id: row.id,
        sub_recipe_id: row.sub_recipe_id,
        ingredient_id: row.ingredient_id,
        ingredient_name: row.ingredients?.name ?? "Unknown",
        ingredient_unit: row.ingredients?.unit ?? "",
        ingredient_cost_per_unit: costPer,
        quantity: row.quantity,
        yield_percent: row.yield_percent,
        usable_qty: usable,
        wastage: row.quantity - usable,
        line_cost: costPer * row.quantity,
      }
    })
    setItems(mapped)
  }, [])

  useEffect(() => { fetchSubRecipes(); fetchIngredients() }, [fetchSubRecipes, fetchIngredients])
  useEffect(() => { if (selected) fetchItems(selected.id); else setItems([]) }, [selected, fetchItems])

  // ── Computed ───────────────────────────────────────────────────────────────

  const totalCost = items.reduce((sum, i) => sum + i.line_cost, 0)
  // Total weight = sum of all input quantities (what actually goes into the sub-recipe)
  const totalInputWeight = items.reduce((sum, i) => sum + i.quantity, 0)
  // Cost per gram/unit = total cost of ingredients used ÷ total weight of sub-recipe created
  const costPerYieldUnit = totalInputWeight > 0 ? totalCost / totalInputWeight : 0

  const previewQty = parseFloat(addForm.quantity) || 0
  const previewYield = parseFloat(addForm.yield_percent) || 100
  const previewIng = ingredients.find(i => i.id === addForm.ingredient_id)
  const previewUsable = previewQty * (previewYield / 100)
  const previewWastage = previewQty - previewUsable
  const previewCost = (previewIng?.cost_per_unit ?? 0) * previewQty

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleCreate() {
    if (!srForm.name.trim()) { setError("Name is required"); return }
    setSaving(true); setError("")
    const { data, error } = await supabase
      .from("sub_recipes")
      .insert({ name: srForm.name.trim(), yield_qty: parseFloat(srForm.yield_qty), unit: srForm.unit, description: srForm.description })
      .select().single()
    if (error) { setError(error.message); setSaving(false); return }
    setSuccess("Sub recipe created!")
    setSrForm({ name: "", yield_qty: "1", unit: "g", description: "" })
    setShowForm(false)
    await fetchSubRecipes()
    setSelected(data)
    setTimeout(() => setSuccess(""), 2000)
    setSaving(false)
  }

  async function handleAddIngredient() {
    if (!selected) return
    if (!addForm.ingredient_id) { setError("Select an ingredient"); return }
    const qty = parseFloat(addForm.quantity)
    const yp = parseFloat(addForm.yield_percent)
    if (!qty || qty <= 0) { setError("Enter a valid quantity"); return }
    setSaving(true); setError("")
    const usable = qty * (yp / 100)
    const { error } = await supabase.from("sub_recipe_items").insert({
      sub_recipe_id: selected.id,
      ingredient_id: addForm.ingredient_id,
      quantity: qty,
      yield_percent: yp,
      wastage: qty - usable,
    })
    if (error) { setError(error.message); setSaving(false); return }
    setSuccess("Ingredient added!")
    setAddForm({ ingredient_id: "", quantity: "", yield_percent: "100" })
    fetchItems(selected.id)
    setTimeout(() => setSuccess(""), 2000)
    setSaving(false)
  }

  async function handleDeleteItem(id: string) {
    await supabase.from("sub_recipe_items").delete().eq("id", id)
    if (selected) fetchItems(selected.id)
  }

  async function handleDeleteSR(id: string) {
    if (!confirm("Delete this sub recipe and all its ingredients?")) return
    await supabase.from("sub_recipe_items").delete().eq("sub_recipe_id", id)
    await supabase.from("sub_recipes").delete().eq("id", id)
    setSelected(null); setItems([])
    fetchSubRecipes()
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={s.page}>

      <div style={s.header}>
        <div>
          <h2 style={s.title}>🥣 Sub Recipes</h2>
          <p style={s.subtitle}>
            Build reusable prep components · add them to any main recipe without re-entering ingredients
          </p>
        </div>
        <button style={s.primaryBtn} onClick={() => { setShowForm(v => !v); setError("") }}>
          {showForm ? "✕ Cancel" : "➕ New Sub Recipe"}
        </button>
      </div>

      {error && <div style={s.errorBanner}>⚠️ {error}</div>}
      {success && <div style={s.successBanner}>✅ {success}</div>}

      {/* Create form */}
      {showForm && (
        <div style={s.card}>
          <div style={s.cardTitle}>➕ New Sub Recipe</div>
          <div style={s.grid2}>
            <div style={s.field}>
              <label style={s.label}>Name *</label>
              <input style={s.input} placeholder="e.g. Béchamel Sauce" value={srForm.name}
                onChange={e => setSrForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div style={s.field}>
              <label style={s.label}>Description</label>
              <input style={s.input} placeholder="Optional notes" value={srForm.description}
                onChange={e => setSrForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <div style={s.grid2}>
            <div style={s.field}>
              <label style={s.label}>Batch Yield Quantity *</label>
              <input style={s.input} type="number" min="0.01" step="0.01"
                placeholder="How much this batch produces" value={srForm.yield_qty}
                onChange={e => setSrForm(f => ({ ...f, yield_qty: e.target.value }))} />
            </div>
            <div style={s.field}>
              <label style={s.label}>Yield Unit</label>
              <select style={s.input} value={srForm.unit}
                onChange={e => setSrForm(f => ({ ...f, unit: e.target.value }))}>
                <option value="g">Grams (g)</option>
                <option value="ml">Millilitres (ml)</option>
                <option value="pcs">Pieces (pcs)</option>
                <option value="portion">Portions</option>
                <option value="litre">Litres</option>
                <option value="kg">Kilograms (kg)</option>
              </select>
            </div>
          </div>
          <div style={s.btnRow}>
            <button style={{ ...s.primaryBtn, opacity: saving ? 0.7 : 1 }}
              onClick={handleCreate} disabled={saving}>
              {saving ? "Creating…" : "Create Sub Recipe"}
            </button>
          </div>
        </div>
      )}

      {/* Split layout */}
      <div style={s.split}>

        {/* LEFT: list */}
        <div style={s.leftPanel}>
          <div style={s.panelHead}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Sub Recipes</span>
            <span style={s.badge2}>{subRecipes.length}</span>
          </div>
          {loading ? <div style={s.empty}>Loading…</div> :
           subRecipes.length === 0 ? (
            <div style={s.empty}>No sub recipes yet.</div>
          ) : (
            subRecipes.map(sr => (
              <div key={sr.id} onClick={() => setSelected(sr)}
                style={{ ...s.listItem, background: selected?.id === sr.id ? "#111" : "white", color: selected?.id === sr.id ? "white" : "#111" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{sr.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                    Yields {fmt(sr.yield_qty, 1)} {sr.unit}
                    {sr.description ? ` · ${sr.description}` : ""}
                  </div>
                </div>
                <button onClick={e => { e.stopPropagation(); handleDeleteSR(sr.id) }}
                  style={{ ...s.iconBtn, background: selected?.id === sr.id ? "rgba(255,255,255,0.15)" : "#fee2e2" }}>
                  🗑️
                </button>
              </div>
            ))
          )}
        </div>

        {/* RIGHT: builder */}
        <div style={s.rightPanel}>
          {!selected ? (
            <div style={s.emptyBuilder}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🥣</div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Select a sub recipe</div>
              <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 6 }}>
                or create a new one above
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div style={s.builderHead}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800 }}>{selected.name}</div>
                  <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
                    Batch yields {fmt(selected.yield_qty, 1)} {selected.unit}
                    {selected.description ? ` · ${selected.description}` : ""}
                  </div>
                </div>
                <div style={s.costBox}>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>Total ingredient cost</div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{fmtCurrency(totalCost)}</div>
                  <div style={{ fontSize: 12, color: "#16a34a", fontWeight: 700 }}>
                    {fmtCurrency(costPerYieldUnit)} / {selected.unit}
                  </div>
                  {totalInputWeight > 0 && (
                    <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>
                      ÷ {fmt(totalInputWeight, 1)} {selected.unit} input
                    </div>
                  )}
                </div>
              </div>

              {/* Add ingredient */}
              <div style={{ padding: "14px 18px", borderBottom: "1px solid #f3f4f6" }}>
                <div style={s.cardTitle}>➕ Add Ingredient</div>
                <div style={s.grid3}>
                  <div style={s.field}>
                    <label style={s.label}>Ingredient *</label>
                    <select style={s.input} value={addForm.ingredient_id}
                      onChange={e => setAddForm(f => ({ ...f, ingredient_id: e.target.value }))}>
                      <option value="">— Select —</option>
                      {ingredients.map(i => (
                        <option key={i.id} value={i.id}>
                          {i.name} ({i.unit}) · {fmtCurrency(i.cost_per_unit)}/{i.unit}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={s.field}>
                    <label style={s.label}>Qty ({previewIng?.unit || "unit"}) *</label>
                    <input style={s.input} type="number" min="0" step="0.01"
                      placeholder="e.g. 200" value={addForm.quantity}
                      onChange={e => setAddForm(f => ({ ...f, quantity: e.target.value }))} />
                  </div>
                  <div style={s.field}>
                    <label style={s.label}>Yield %</label>
                    <input style={s.input} type="number" min="1" max="100" step="0.1"
                      value={addForm.yield_percent}
                      onChange={e => setAddForm(f => ({ ...f, yield_percent: e.target.value }))} />
                  </div>
                </div>

                {previewQty > 0 && addForm.ingredient_id && (
                  <div style={s.previewStrip}>
                    <span>Usable: <strong>{fmt(previewUsable)} {previewIng?.unit}</strong></span>
                    <span style={{ margin: "0 10px", color: "#d1d5db" }}>|</span>
                    <span style={{ color: "#ef4444" }}>Wastage: <strong>{fmt(previewWastage)} {previewIng?.unit}</strong></span>
                    <span style={{ margin: "0 10px", color: "#d1d5db" }}>|</span>
                    <span style={{ color: "#16a34a" }}>Cost: <strong>{fmtCurrency(previewCost)}</strong></span>
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                  <button style={{ ...s.primaryBtn, opacity: saving ? 0.7 : 1 }}
                    onClick={handleAddIngredient} disabled={saving}>
                    {saving ? "Adding…" : "Add Ingredient"}
                  </button>
                </div>
              </div>

              {/* Ingredients table */}
              {items.length === 0 ? (
                <div style={s.empty}>No ingredients yet. Add above.</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        {["Ingredient", "Input Qty", "Yield %", "Usable", "Wastage", "₹/unit", "Line Cost", ""].map(h => (
                          <th key={h} style={s.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, i) => (
                        <tr key={item.id} style={{ background: i % 2 === 0 ? "white" : "#f9fafb" }}>
                          <td style={{ ...s.td, fontWeight: 600 }}>{item.ingredient_name}</td>
                          <td style={{ ...s.td, textAlign: "right" }}>{fmt(item.quantity)} {item.ingredient_unit}</td>
                          <td style={{ ...s.td, textAlign: "right" }}>
                            <span style={{ ...s.yieldBadge, background: item.yield_percent >= 90 ? "#dcfce7" : item.yield_percent >= 70 ? "#fef9c3" : "#fee2e2", color: item.yield_percent >= 90 ? "#166534" : item.yield_percent >= 70 ? "#854d0e" : "#991b1b" }}>
                              {item.yield_percent}%
                            </span>
                          </td>
                          <td style={{ ...s.td, textAlign: "right", color: "#16a34a", fontWeight: 600 }}>
                            {fmt(item.usable_qty)} {item.ingredient_unit}
                          </td>
                          <td style={{ ...s.td, textAlign: "right", color: "#ef4444" }}>
                            {fmt(item.wastage)} {item.ingredient_unit}
                          </td>
                          <td style={{ ...s.td, textAlign: "right", color: "#6b7280" }}>
                            {fmtCurrency(item.ingredient_cost_per_unit)}
                          </td>
                          <td style={{ ...s.td, textAlign: "right", fontWeight: 700 }}>
                            {fmtCurrency(item.line_cost)}
                          </td>
                          <td style={s.td}>
                            <button style={s.delBtn} onClick={() => handleDeleteItem(item.id)}>🗑️</button>
                          </td>
                        </tr>
                      ))}
                      <tr style={{ background: "#f0fdf4", borderTop: "2px solid #bbf7d0" }}>
                        <td colSpan={6} style={{ ...s.td, fontWeight: 700 }}>Total · {items.length} ingredient{items.length !== 1 ? "s" : ""}</td>
                        <td style={{ ...s.td, textAlign: "right", fontWeight: 800, fontSize: 16, color: "#16a34a" }}>{fmtCurrency(totalCost)}</td>
                        <td style={s.td} />
                      </tr>
                      <tr style={{ background: "#f0fdf4" }}>
                        <td colSpan={6} style={{ ...s.td, color: "#6b7280", fontSize: 13 }}>Cost per {selected.unit} of {selected.name}</td>
                        <td style={{ ...s.td, textAlign: "right", fontWeight: 800, color: "#16a34a" }}>{fmtCurrency(costPerYieldUnit)}/{selected.unit}</td>
                        <td style={s.td} />
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { padding: "16px 16px 80px", maxWidth: 1200, margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  title: { fontSize: 22, fontWeight: 800, color: "#111", margin: 0 },
  subtitle: { fontSize: 13, color: "#6b7280", marginTop: 4, maxWidth: 500 },
  split: { display: "grid", gridTemplateColumns: "260px 1fr", gap: 16, alignItems: "start" },
  leftPanel: { background: "white", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" },
  panelHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", background: "#f9fafb", borderBottom: "1px solid #f3f4f6" },
  badge2: { background: "#111", color: "white", borderRadius: 20, padding: "2px 8px", fontSize: 12, fontWeight: 700 },
  listItem: { display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: "1px solid #f3f4f6", cursor: "pointer" },
  iconBtn: { width: 30, height: 30, border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, flexShrink: 0 },
  rightPanel: { background: "white", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" },
  builderHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "16px 18px", background: "#f9fafb", borderBottom: "1px solid #f3f4f6", gap: 16 },
  costBox: { textAlign: "right", flexShrink: 0 },
  emptyBuilder: { display: "flex", flexDirection: "column", alignItems: "center", padding: "80px 20px", color: "#9ca3af" },
  card: { background: "white", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, marginBottom: 16 },
  cardTitle: { fontSize: 14, fontWeight: 700, color: "#111", marginBottom: 12 },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 10 },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.5px" },
  input: { height: 40, padding: "0 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, color: "#111", background: "#fafafa", outline: "none", width: "100%", boxSizing: "border-box" },
  previewStrip: { background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "8px 14px", fontSize: 13, color: "#374151", marginTop: 6 },
  btnRow: { display: "flex", justifyContent: "flex-end", marginTop: 12 },
  primaryBtn: { height: 44, padding: "0 20px", background: "#111", color: "white", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { padding: "10px 12px", background: "#f3f4f6", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" },
  td: { padding: "10px 12px", borderBottom: "1px solid #f3f4f6", color: "#111", whiteSpace: "nowrap" },
  yieldBadge: { display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 12, fontWeight: 700 },
  delBtn: { background: "#fee2e2", border: "none", borderRadius: 6, width: 30, height: 30, cursor: "pointer", fontSize: 13 },
  empty: { textAlign: "center", padding: "32px 20px", color: "#9ca3af", fontSize: 14 },
  errorBanner: { background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 12 },
  successBanner: { background: "#dcfce7", color: "#166534", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 12 },
}
