import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Ingredient {
  id: string
  name: string
  unit: string
  cost_per_base_unit: number
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

  // ── Create form — yield qty/unit moved to bottom, optional ────────────────
  const [srForm, setSrForm] = useState({
    name: "",
    description: "",
    unit: "g",
    yield_qty: "",         // optional — will auto-calculate from ingredients if blank
  })
  const [addForm, setAddForm] = useState({ ingredient_id: "", quantity: "", yield_percent: "100" })

  // ── Yield override in builder (per-session, not persisted unless "Save" is clicked) ─
  const [yieldOverride, setYieldOverride] = useState<string>("")
  const [savingYield, setSavingYield] = useState(false)

  // ── Fetchers ───────────────────────────────────────────────────────────────

  const fetchSubRecipes = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("sub_recipes")
      .select("*")
      .order("name")
    if (error) setError(error.message)
    else setSubRecipes(data || [])
    setLoading(false)
  }, [])

  const fetchIngredients = useCallback(async () => {
    const { data } = await supabase
      .from("ingredients")
      .select("id, name, unit, cost_per_base_unit")
      .order("name")
    setIngredients(data || [])
  }, [])

  const fetchItems = useCallback(async (id: string) => {
    const { data } = await supabase
      .from("sub_recipe_items")
      .select(`id, sub_recipe_id, ingredient_id, quantity, yield_percent, wastage, ingredients(name, unit, cost_per_base_unit)`)
      .eq("sub_recipe_id", id)

    const mapped: SubRecipeItem[] = (data || []).map((row: any) => {
      const costPer = row.ingredients?.cost_per_base_unit ?? 0
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
  useEffect(() => {
    if (selected) {
      fetchItems(selected.id)
      setYieldOverride("")  // reset override when switching sub-recipe
    } else {
      setItems([])
    }
  }, [selected, fetchItems])

  // ── Computed ───────────────────────────────────────────────────────────────

  const totalCost = items.reduce((sum, i) => sum + i.line_cost, 0)
  // Auto-calculated yield = sum of all INPUT quantities
  const autoYield = items.reduce((sum, i) => sum + i.quantity, 0)
  // If user has typed an override, use that; otherwise use auto
  const effectiveYield = parseFloat(yieldOverride) > 0
    ? parseFloat(yieldOverride)
    : autoYield
  // Cost per yield unit
  const costPerYieldUnit = effectiveYield > 0 ? totalCost / effectiveYield : 0

  const previewQty = parseFloat(addForm.quantity) || 0
  const previewYield = parseFloat(addForm.yield_percent) || 100
  const previewIng = ingredients.find(i => i.id === addForm.ingredient_id)
  const previewUsable = previewQty * (previewYield / 100)
  const previewWastage = previewQty - previewUsable
  const previewCost = (previewIng?.cost_per_base_unit ?? 0) * previewQty

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleCreate() {
    if (!srForm.name.trim()) { setError("Name is required"); return }
    setSaving(true); setError("")
    // yield_qty must be > 0 (DB constraint). Use entered value or default 1.
    const yieldQty = parseFloat(srForm.yield_qty) > 0 ? parseFloat(srForm.yield_qty) : 1
    const { data, error } = await supabase
      .from("sub_recipes")
      .insert({
        name: srForm.name.trim(),
        yield_qty: yieldQty,
        unit: srForm.unit,
        description: srForm.description,
        outlet_id: "demo-outlet",
      })
      .select().single()
    if (error) { setError(error.message); setSaving(false); return }
    setSuccess("Sub recipe created!")
    setSrForm({ name: "", description: "", unit: "g", yield_qty: "" })
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

  async function handleSaveYield() {
    if (!selected) return
    const yq = parseFloat(yieldOverride)
    if (!yq || yq <= 0) { setError("Enter a valid yield quantity > 0"); return }
    setSavingYield(true)
    const { error } = await supabase
      .from("sub_recipes")
      .update({ yield_qty: yq })
      .eq("id", selected.id)
    if (error) { setError(error.message) }
    else {
      setSelected(prev => prev ? { ...prev, yield_qty: yq } : prev)
      setSubRecipes(prev => prev.map(sr => sr.id === selected.id ? { ...sr, yield_qty: yq } : sr))
      setSuccess("Yield saved!")
      setTimeout(() => setSuccess(""), 2000)
    }
    setSavingYield(false)
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

      {/* Create form — Name & Description first, yield qty/unit at bottom */}
      {showForm && (
        <div style={s.card}>
          <div style={s.cardTitle}>➕ New Sub Recipe</div>

          {/* Row 1: Name + Description */}
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

          {/* Row 2 (bottom): Yield unit + Yield qty — optional */}
          <div style={{ ...s.grid2, marginTop: 4 }}>
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
            <div style={s.field}>
              <label style={s.label}>Batch Yield Qty <span style={{ fontWeight: 400, color: "#9ca3af" }}>(optional — auto from ingredients)</span></label>
              <input style={s.input} type="number" min="0.01" step="0.01"
                placeholder="Leave blank to auto-calculate"
                value={srForm.yield_qty}
                onChange={e => setSrForm(f => ({ ...f, yield_qty: e.target.value }))} />
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
                    {sr.yield_qty > 1 ? `Yields ${fmt(sr.yield_qty, 1)} ${sr.unit}` : `Unit: ${sr.unit}`}
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
                    {selected.description || "No description"}
                  </div>
                </div>
                <div style={s.costBox}>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>Total ingredient cost</div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{fmtCurrency(totalCost)}</div>
                  <div style={{ fontSize: 12, color: "#16a34a", fontWeight: 700 }}>
                    {fmtCurrency(costPerYieldUnit)} / {selected.unit}
                  </div>
                </div>
              </div>

              {/* Yield calculator strip — always visible when ingredients exist */}
              {items.length > 0 && (
                <div style={s.yieldStrip}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 700, textTransform: "uppercase" }}>
                        Auto-calculated yield
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "#2563eb" }}>
                        {fmt(autoYield, 1)} {selected.unit}
                      </div>
                      <div style={{ fontSize: 10, color: "#9ca3af" }}>sum of all input quantities</div>
                    </div>
                    <div style={{ fontSize: 20, color: "#d1d5db" }}>→</div>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 700, textTransform: "uppercase" }}>
                        Override actual yield <span style={{ fontWeight: 400 }}>(if batch reduces)</span>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
                        <input
                          type="number" min="0.01" step="0.01"
                          placeholder={`e.g. ${fmt(autoYield * 0.85, 0)}`}
                          value={yieldOverride}
                          onChange={e => setYieldOverride(e.target.value)}
                          style={{ ...s.input, height: 34, fontSize: 13, flex: 1 }}
                        />
                        <span style={{ fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>{selected.unit}</span>
                        {yieldOverride && parseFloat(yieldOverride) > 0 && (
                          <button
                            onClick={handleSaveYield}
                            disabled={savingYield}
                            style={{ ...s.primaryBtn, height: 34, padding: "0 12px", fontSize: 12, opacity: savingYield ? 0.7 : 1 }}>
                            {savingYield ? "…" : "Save"}
                          </button>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 700, textTransform: "uppercase" }}>
                        Using {parseFloat(yieldOverride) > 0 ? "override" : "auto"}
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "#16a34a" }}>
                        {fmt(effectiveYield, 1)} {selected.unit}
                      </div>
                      <div style={{ fontSize: 11, color: "#16a34a" }}>
                        {fmtCurrency(costPerYieldUnit)} / {selected.unit}
                      </div>
                    </div>
                  </div>
                </div>
              )}

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
                          {i.name} ({i.unit}) · {fmtCurrency(i.cost_per_base_unit)}/{i.unit}
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
                        <td colSpan={6} style={{ ...s.td, fontWeight: 700 }}>
                          Total · {items.length} ingredient{items.length !== 1 ? "s" : ""}
                        </td>
                        <td style={{ ...s.td, textAlign: "right", fontWeight: 800, fontSize: 16, color: "#16a34a" }}>
                          {fmtCurrency(totalCost)}
                        </td>
                        <td style={s.td} />
                      </tr>
                      <tr style={{ background: "#f0fdf4" }}>
                        <td colSpan={6} style={{ ...s.td, color: "#6b7280", fontSize: 13 }}>
                          Cost per {selected.unit} · using {parseFloat(yieldOverride) > 0 ? `override ${fmt(parseFloat(yieldOverride), 1)}` : `auto ${fmt(autoYield, 1)}`} {selected.unit}
                        </td>
                        <td style={{ ...s.td, textAlign: "right", fontWeight: 800, color: "#16a34a" }}>
                          {fmtCurrency(costPerYieldUnit)}/{selected.unit}
                        </td>
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
  yieldStrip: { background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 0, borderLeft: "none", borderRight: "none", padding: "12px 18px", fontSize: 13 },
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
