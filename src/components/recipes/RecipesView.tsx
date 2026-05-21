import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"

// ─── Types ────────────────────────────────────────────────────────────────────

interface MenuItem { id: string; name: string; price: number }
interface InventoryItem { id: string; name: string; unit: string; cost_per_unit: number; category: string }
interface SubRecipe { id: string; name: string; yield_qty: number; unit: string; description: string; cost_per_unit?: number }
interface Recipe { id: string; menu_item_id: string; menu_item_name: string; menu_item_price: number; serves: number }
interface RecipeLine { id: string; recipe_id: string; type: "ingredient" | "sub_recipe"; ref_id: string; ref_name: string; ref_unit: string; ref_cost_per_unit: number; quantity: number; line_cost: number }
interface SubRecipeItem { id: string; sub_recipe_id: string; ingredient_id: string; ingredient_name: string; ingredient_unit: string; ingredient_cost_per_unit: number; quantity: number; line_cost: number }

function fmt(n: number, d = 2) { return n.toLocaleString("en-IN", { maximumFractionDigits: d }) }
function fmtCurrency(n: number) { return "₹" + fmt(n, 2) }

const s: Record<string, React.CSSProperties> = {
  page: { padding: "16px", maxWidth: 1100, margin: "0 auto" },
  card: { background: "white", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 800, color: "#111", margin: "0 0 4px" },
  label: { fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 },
  input: { width: "100%", padding: "8px 10px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" as const, background: "white", color: "#111" },
  btn: { padding: "8px 16px", background: "#111", color: "white", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  btnSm: { padding: "4px 10px", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" },
  table: { width: "100%", borderCollapse: "collapse" as const },
  th: { textAlign: "left" as const, padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "#6b7280", borderBottom: "1px solid #e5e7eb" },
  td: { padding: "8px 12px", fontSize: 13, borderBottom: "1px solid #f3f4f6", color: "#111" },
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RecipesView() {
  const [mainTab, setMainTab] = useState<"recipes" | "subrecipes">("recipes")

  return (
    <div style={s.page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={s.title}>📖 Manage Recipes</h2>
          <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>Build sub-recipes and full recipes from your inventory</p>
        </div>
      </div>

      {/* Main tab switcher */}
      <div style={{ display: "flex", gap: 0, background: "#f3f4f6", borderRadius: 10, padding: 4, marginBottom: 20, width: "fit-content" }}>
        {([["recipes", "📖 Recipes"], ["subrecipes", "🥣 Sub Recipes"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setMainTab(key)} style={{
            padding: "8px 24px", borderRadius: 8, border: "none", cursor: "pointer",
            fontWeight: 600, fontSize: 13,
            background: mainTab === key ? "white" : "transparent",
            color: mainTab === key ? "#111" : "#6b7280",
            boxShadow: mainTab === key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
          }}>{label}</button>
        ))}
      </div>

      {mainTab === "recipes" && <RecipesTab />}
      {mainTab === "subrecipes" && <SubRecipesTab />}
    </div>
  )
}

// ─── RECIPES TAB ─────────────────────────────────────────────────────────────

function RecipesTab() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [selected, setSelected] = useState<Recipe | null>(null)
  const [lines, setLines] = useState<RecipeLine[]>([])
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [subRecipes, setSubRecipes] = useState<SubRecipe[]>([])
  const [showNewRecipe, setShowNewRecipe] = useState(false)
  const [newMenuItemId, setNewMenuItemId] = useState("")
  const [newServes, setNewServes] = useState("1")
  const [saving, setSaving] = useState(false)

  // Add line form
  const [lineType, setLineType] = useState<"ingredient" | "sub_recipe">("ingredient")
  const [lineRefId, setLineRefId] = useState("")
  const [lineQty, setLineQty] = useState("")

  const fetchAll = useCallback(async () => {
    const [{ data: r }, { data: m }, { data: inv }, { data: sr }] = await Promise.all([
      supabase.from("recipes").select("id, menu_item_id, serves, menu_items(name, price)"),
      supabase.from("menu_items").select("id, name, price").order("name"),
      supabase.from("ingredients").select("id, name, unit, cost_per_unit").order("name"),
      supabase.from("sub_recipes").select("id, name, yield_qty, unit, cost_per_unit").order("name"),
    ])
    if (r) setRecipes(r.map((x: any) => ({ id: x.id, menu_item_id: x.menu_item_id, menu_item_name: x.menu_items?.name || "Unknown", menu_item_price: x.menu_items?.price || 0, serves: x.serves || 1 })))
    if (m) setMenuItems(m)
    if (inv) setInventoryItems(inv)
    if (sr) setSubRecipes(sr)
  }, [])

  const fetchLines = useCallback(async (recipeId: string) => {
    const { data } = await supabase.from("recipe_items").select(`
      id, recipe_id, quantity,
      ingredient_id, sub_recipe_id,
      ingredients(name, unit, cost_per_unit),
      sub_recipes(name, unit, cost_per_unit)
    `).eq("recipe_id", recipeId)

    const mapped: RecipeLine[] = (data || []).map((row: any) => {
      const isIng = !!row.ingredient_id
      const ref = isIng ? row.ingredients : row.sub_recipes
      const cost = ref?.cost_per_unit ?? 0
      return {
        id: row.id, recipe_id: row.recipe_id,
        type: isIng ? "ingredient" : "sub_recipe",
        ref_id: isIng ? row.ingredient_id : row.sub_recipe_id,
        ref_name: ref?.name ?? "Unknown",
        ref_unit: ref?.unit ?? "",
        ref_cost_per_unit: cost,
        quantity: row.quantity,
        line_cost: cost * row.quantity,
      }
    })
    setLines(mapped)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => { if (selected) fetchLines(selected.id); else setLines([]) }, [selected, fetchLines])

  const totalCost = lines.reduce((s, l) => s + l.line_cost, 0)
  const profit = selected ? selected.menu_item_price - totalCost : 0
  const margin = selected && selected.menu_item_price > 0 ? (profit / selected.menu_item_price) * 100 : 0

  const createRecipe = async () => {
    if (!newMenuItemId) return
    setSaving(true)
    const mi = menuItems.find(m => m.id === newMenuItemId)
    const { data } = await supabase.from("recipes").insert({ menu_item_id: newMenuItemId, serves: Number(newServes) || 1 }).select().single()
    if (data) {
      await fetchAll()
      setShowNewRecipe(false)
      setNewMenuItemId("")
    }
    setSaving(false)
  }

  const addLine = async () => {
    if (!selected || !lineRefId || !lineQty) return
    setSaving(true)
    const payload: any = { recipe_id: selected.id, quantity: Number(lineQty) }
    if (lineType === "ingredient") payload.ingredient_id = lineRefId
    else payload.sub_recipe_id = lineRefId
    await supabase.from("recipe_items").insert(payload)
    setLineRefId(""); setLineQty("")
    fetchLines(selected.id)
    setSaving(false)
  }

  const deleteLine = async (id: string) => {
    await supabase.from("recipe_items").delete().eq("id", id)
    if (selected) fetchLines(selected.id)
  }

  const refOptions = lineType === "ingredient" ? inventoryItems : subRecipes.map(sr => ({ id: sr.id, name: sr.name, unit: sr.unit, cost_per_unit: sr.cost_per_unit || 0 }))
  const selectedRef = refOptions.find(r => r.id === lineRefId)
  const previewCost = selectedRef ? (selectedRef.cost_per_unit || 0) * (Number(lineQty) || 0) : 0

  return (
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>
      {/* Left — recipe list */}
      <div>
        <div style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>Recipes ({recipes.length})</h3>
            <button onClick={() => setShowNewRecipe(!showNewRecipe)} style={{ ...s.btnSm, background: "#111", color: "white" }}>+ New</button>
          </div>

          {showNewRecipe && (
            <div style={{ background: "#f9f9f9", borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <label style={s.label}>Menu Item</label>
              <select value={newMenuItemId} onChange={e => setNewMenuItemId(e.target.value)} style={{ ...s.input, marginBottom: 8 }}>
                <option value="">Select menu item</option>
                {menuItems.filter(m => !recipes.some(r => r.menu_item_id === m.id)).map(m => <option key={m.id} value={m.id}>{m.name} (₹{m.price})</option>)}
              </select>
              <label style={s.label}>Serves (portions)</label>
              <input type="number" value={newServes} onChange={e => setNewServes(e.target.value)} style={{ ...s.input, marginBottom: 8 }} placeholder="1" />
              <button onClick={createRecipe} disabled={saving || !newMenuItemId} style={{ ...s.btn, width: "100%", opacity: saving ? 0.7 : 1 }}>Create Recipe</button>
            </div>
          )}

          {recipes.length === 0 ? (
            <p style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", padding: "16px 0" }}>No recipes yet</p>
          ) : recipes.map(r => (
            <div key={r.id} onClick={() => setSelected(r)}
              style={{ padding: "10px 12px", borderRadius: 8, marginBottom: 6, cursor: "pointer", border: "1px solid", borderColor: selected?.id === r.id ? "#111" : "#e5e7eb", background: selected?.id === r.id ? "#111" : "white" }}>
              <p style={{ fontWeight: 600, fontSize: 13, margin: 0, color: selected?.id === r.id ? "white" : "#111" }}>{r.menu_item_name}</p>
              <p style={{ fontSize: 11, color: selected?.id === r.id ? "rgba(255,255,255,0.6)" : "#9ca3af", margin: "2px 0 0" }}>₹{r.menu_item_price} · {r.serves} portion</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right — recipe detail */}
      <div>
        {!selected ? (
          <div style={{ ...s.card, textAlign: "center", padding: "48px 24px" }}>
            <p style={{ fontSize: 32, marginBottom: 8 }}>📖</p>
            <p style={{ color: "#9ca3af", fontSize: 14 }}>Select a recipe to view and edit ingredients</p>
          </div>
        ) : (
          <div style={s.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <h3 style={{ fontWeight: 800, fontSize: 16, margin: "0 0 4px" }}>{selected.menu_item_name}</h3>
                <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>Selling price: ₹{selected.menu_item_price} · {selected.serves} portion(s)</p>
              </div>
              {/* P&L summary */}
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>Cost</p>
                  <p style={{ fontSize: 16, fontWeight: 800, color: "#dc2626", margin: 0 }}>{fmtCurrency(totalCost)}</p>
                </div>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>Profit</p>
                  <p style={{ fontSize: 16, fontWeight: 800, color: profit >= 0 ? "#16a34a" : "#dc2626", margin: 0 }}>{fmtCurrency(profit)}</p>
                </div>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>Margin</p>
                  <p style={{ fontSize: 16, fontWeight: 800, color: margin >= 30 ? "#16a34a" : "#f97316", margin: 0 }}>{margin.toFixed(1)}%</p>
                </div>
              </div>
            </div>

            {/* Ingredients table */}
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Type</th>
                  <th style={s.th}>Ingredient / Sub-recipe</th>
                  <th style={s.th}>Qty</th>
                  <th style={s.th}>Unit</th>
                  <th style={s.th}>Cost/unit</th>
                  <th style={s.th}>Line cost</th>
                  <th style={s.th}></th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && <tr><td colSpan={7} style={{ ...s.td, color: "#9ca3af", textAlign: "center", padding: "20px" }}>No ingredients added yet</td></tr>}
                {lines.map(line => (
                  <tr key={line.id}>
                    <td style={s.td}>
                      <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: line.type === "ingredient" ? "#dbeafe" : "#fef9c3", color: line.type === "ingredient" ? "#1e40af" : "#854d0e" }}>
                        {line.type === "ingredient" ? "Ingredient" : "Sub-recipe"}
                      </span>
                    </td>
                    <td style={{ ...s.td, fontWeight: 600 }}>{line.ref_name}</td>
                    <td style={s.td}>{fmt(line.quantity, 3)}</td>
                    <td style={{ ...s.td, color: "#6b7280" }}>{line.ref_unit}</td>
                    <td style={{ ...s.td, color: "#6b7280" }}>{fmtCurrency(line.ref_cost_per_unit)}</td>
                    <td style={{ ...s.td, fontWeight: 700, color: "#f97316" }}>{fmtCurrency(line.line_cost)}</td>
                    <td style={s.td}>
                      <button onClick={() => deleteLine(line.id)} style={{ ...s.btnSm, background: "#fef2f2", color: "#dc2626" }}>✕</button>
                    </td>
                  </tr>
                ))}
                {lines.length > 0 && (
                  <tr style={{ background: "#f9fafb" }}>
                    <td colSpan={5} style={{ ...s.td, fontWeight: 700, textAlign: "right" }}>Total Cost</td>
                    <td style={{ ...s.td, fontWeight: 800, fontSize: 15, color: "#dc2626" }}>{fmtCurrency(totalCost)}</td>
                    <td style={s.td}></td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Add ingredient/sub-recipe */}
            <div style={{ background: "#f9f9f9", borderRadius: 8, padding: 14, marginTop: 16 }}>
              <p style={{ fontWeight: 700, fontSize: 13, margin: "0 0 10px" }}>+ Add Ingredient or Sub-recipe</p>
              <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 80px auto", gap: 8, alignItems: "end" }}>
                <div>
                  <label style={s.label}>Type</label>
                  <select value={lineType} onChange={e => { setLineType(e.target.value as any); setLineRefId("") }} style={s.input}>
                    <option value="ingredient">Ingredient</option>
                    <option value="sub_recipe">Sub-recipe</option>
                  </select>
                </div>
                <div>
                  <label style={s.label}>{lineType === "ingredient" ? "Ingredient" : "Sub-recipe"}</label>
                  <select value={lineRefId} onChange={e => setLineRefId(e.target.value)} style={s.input}>
                    <option value="">Select...</option>
                    {refOptions.map(r => <option key={r.id} value={r.id}>{r.name} ({r.unit}) — ₹{r.cost_per_unit?.toFixed(4) || "0"}/unit</option>)}
                  </select>
                </div>
                <div>
                  <label style={s.label}>Quantity</label>
                  <input type="number" step="0.001" placeholder="e.g. 30" value={lineQty} onChange={e => setLineQty(e.target.value)} style={s.input} />
                </div>
                <div>
                  <button onClick={addLine} disabled={saving || !lineRefId || !lineQty} style={{ ...s.btn, height: 40, opacity: saving || !lineRefId || !lineQty ? 0.5 : 1 }}>Add</button>
                </div>
              </div>
              {lineRefId && lineQty && (
                <p style={{ fontSize: 12, color: "#16a34a", margin: "6px 0 0" }}>
                  Preview: {lineQty} × {selectedRef?.unit} × ₹{selectedRef?.cost_per_unit?.toFixed(4)} = <strong>{fmtCurrency(previewCost)}</strong>
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── SUB RECIPES TAB ─────────────────────────────────────────────────────────

function SubRecipesTab() {
  const [subRecipes, setSubRecipes] = useState<SubRecipe[]>([])
  const [selected, setSelected] = useState<SubRecipe | null>(null)
  const [items, setItems] = useState<SubRecipeItem[]>([])
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState("")
  const [newYield, setNewYield] = useState("")
  const [newUnit, setNewUnit] = useState("grams")
  const [saving, setSaving] = useState(false)

  // Add item form
  const [addIngId, setAddIngId] = useState("")
  const [addQty, setAddQty] = useState("")

  const fetchAll = useCallback(async () => {
    const [{ data: sr }, { data: inv }] = await Promise.all([
      supabase.from("sub_recipes").select("*").order("name"),
      supabase.from("ingredients").select("id, name, unit, cost_per_unit").order("name"),
    ])
    if (sr) setSubRecipes(sr)
    if (inv) setInventoryItems(inv)
  }, [])

  const fetchItems = useCallback(async (id: string) => {
    const { data } = await supabase.from("sub_recipe_items")
      .select("id, sub_recipe_id, ingredient_id, quantity, ingredients(name, unit, cost_per_unit)")
      .eq("sub_recipe_id", id)

    const mapped: SubRecipeItem[] = (data || []).map((row: any) => {
      const cost = row.ingredients?.cost_per_unit ?? 0
      return {
        id: row.id, sub_recipe_id: row.sub_recipe_id, ingredient_id: row.ingredient_id,
        ingredient_name: row.ingredients?.name ?? "Unknown",
        ingredient_unit: row.ingredients?.unit ?? "",
        ingredient_cost_per_unit: cost,
        quantity: row.quantity,
        line_cost: cost * row.quantity,
      }
    })
    setItems(mapped)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => { if (selected) fetchItems(selected.id); else setItems([]) }, [selected, fetchItems])

  const totalCost = items.reduce((s, i) => s + i.line_cost, 0)
  const totalWeight = items.reduce((s, i) => s + i.quantity, 0)
  const outputWeight = selected?.yield_qty && selected.yield_qty > 0 ? selected.yield_qty : totalWeight
  const costPerUnit = outputWeight > 0 ? totalCost / outputWeight : 0

  const createSubRecipe = async () => {
    if (!newName.trim()) return
    setSaving(true)
    const { data } = await supabase.from("sub_recipes").insert({ name: newName.trim(), yield_qty: Number(newYield) || 0, unit: newUnit, description: "" }).select().single()
    if (data) { setSubRecipes(prev => [...prev, data]); setNewName(""); setNewYield(""); setShowNew(false) }
    setSaving(false)
  }

  const addItem = async () => {
    if (!selected || !addIngId || !addQty) return
    setSaving(true)
    await supabase.from("sub_recipe_items").insert({ sub_recipe_id: selected.id, ingredient_id: addIngId, quantity: Number(addQty) })

    // Update cost_per_unit on sub_recipe
    const ing = inventoryItems.find(i => i.id === addIngId)
    const newItems = [...items, { id: "", sub_recipe_id: selected.id, ingredient_id: addIngId, ingredient_name: ing?.name || "", ingredient_unit: ing?.unit || "", ingredient_cost_per_unit: ing?.cost_per_unit || 0, quantity: Number(addQty), line_cost: (ing?.cost_per_unit || 0) * Number(addQty) }]
    const newTotal = newItems.reduce((s, i) => s + i.line_cost, 0)
    const newWeight = selected.yield_qty > 0 ? selected.yield_qty : newItems.reduce((s, i) => s + i.quantity, 0)
    const newCostPerUnit = newWeight > 0 ? newTotal / newWeight : 0
    await supabase.from("sub_recipes").update({ cost_per_unit: newCostPerUnit }).eq("id", selected.id)

    setAddIngId(""); setAddQty("")
    fetchItems(selected.id)
    fetchAll()
    setSaving(false)
  }

  const deleteItem = async (id: string) => {
    await supabase.from("sub_recipe_items").delete().eq("id", id)
    if (selected) fetchItems(selected.id)
  }

  const previewIng = inventoryItems.find(i => i.id === addIngId)
  const previewCost = previewIng ? previewIng.cost_per_unit * (Number(addQty) || 0) : 0

  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16 }}>
      {/* Left — sub-recipe list */}
      <div>
        <div style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>Sub-recipes ({subRecipes.length})</h3>
            <button onClick={() => setShowNew(!showNew)} style={{ ...s.btnSm, background: "#111", color: "white" }}>+ New</button>
          </div>

          {showNew && (
            <div style={{ background: "#f9f9f9", borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <label style={s.label}>Name</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Momo Dough" style={{ ...s.input, marginBottom: 8 }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <div>
                  <label style={s.label}>Yield Qty</label>
                  <input type="number" value={newYield} onChange={e => setNewYield(e.target.value)} placeholder="e.g. 500" style={s.input} />
                </div>
                <div>
                  <label style={s.label}>Unit</label>
                  <select value={newUnit} onChange={e => setNewUnit(e.target.value)} style={s.input}>
                    <option value="grams">grams</option>
                    <option value="ml">ml</option>
                    <option value="pieces">pieces</option>
                    <option value="portions">portions</option>
                  </select>
                </div>
              </div>
              <button onClick={createSubRecipe} disabled={saving || !newName} style={{ ...s.btn, width: "100%", opacity: saving || !newName ? 0.7 : 1 }}>Create</button>
            </div>
          )}

          {subRecipes.map(sr => (
            <div key={sr.id} onClick={() => setSelected(sr)}
              style={{ padding: "10px 12px", borderRadius: 8, marginBottom: 6, cursor: "pointer", border: "1px solid", borderColor: selected?.id === sr.id ? "#111" : "#e5e7eb", background: selected?.id === sr.id ? "#111" : "white" }}>
              <p style={{ fontWeight: 600, fontSize: 13, margin: 0, color: selected?.id === sr.id ? "white" : "#111" }}>{sr.name}</p>
              <p style={{ fontSize: 11, color: selected?.id === sr.id ? "rgba(255,255,255,0.6)" : "#9ca3af", margin: "2px 0 0" }}>
                Yield: {sr.yield_qty} {sr.unit} {sr.cost_per_unit ? `· ₹${sr.cost_per_unit.toFixed(4)}/${sr.unit}` : ""}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Right — sub-recipe detail */}
      <div>
        {!selected ? (
          <div style={{ ...s.card, textAlign: "center", padding: "48px 24px" }}>
            <p style={{ fontSize: 32, marginBottom: 8 }}>🥣</p>
            <p style={{ color: "#9ca3af", fontSize: 14 }}>Select a sub-recipe to view and edit</p>
          </div>
        ) : (
          <div style={s.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <h3 style={{ fontWeight: 800, fontSize: 16, margin: "0 0 2px" }}>{selected.name}</h3>
                <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>Yield: {selected.yield_qty} {selected.unit}</p>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>Total Cost</p>
                  <p style={{ fontSize: 16, fontWeight: 800, color: "#dc2626", margin: 0 }}>{fmtCurrency(totalCost)}</p>
                </div>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>Cost/{selected.unit}</p>
                  <p style={{ fontSize: 16, fontWeight: 800, color: "#f97316", margin: 0 }}>₹{costPerUnit.toFixed(4)}</p>
                </div>
              </div>
            </div>

            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: "#374151" }}>
              📐 Cost/{selected.unit} = Total ingredient cost ÷ output weight = {fmtCurrency(totalCost)} ÷ {outputWeight} {selected.unit} = <strong>₹{costPerUnit.toFixed(4)}</strong>
            </div>

            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Ingredient</th>
                  <th style={s.th}>Qty</th>
                  <th style={s.th}>Unit</th>
                  <th style={s.th}>Cost/unit</th>
                  <th style={s.th}>Line cost</th>
                  <th style={s.th}></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && <tr><td colSpan={6} style={{ ...s.td, color: "#9ca3af", textAlign: "center", padding: "20px" }}>No ingredients yet</td></tr>}
                {items.map(item => (
                  <tr key={item.id}>
                    <td style={{ ...s.td, fontWeight: 600 }}>{item.ingredient_name}</td>
                    <td style={s.td}>{fmt(item.quantity, 3)}</td>
                    <td style={{ ...s.td, color: "#6b7280" }}>{item.ingredient_unit}</td>
                    <td style={{ ...s.td, color: "#6b7280" }}>{fmtCurrency(item.ingredient_cost_per_unit)}</td>
                    <td style={{ ...s.td, fontWeight: 700, color: "#f97316" }}>{fmtCurrency(item.line_cost)}</td>
                    <td style={s.td}><button onClick={() => deleteItem(item.id)} style={{ ...s.btnSm, background: "#fef2f2", color: "#dc2626" }}>✕</button></td>
                  </tr>
                ))}
                {items.length > 0 && (
                  <tr style={{ background: "#f9fafb" }}>
                    <td colSpan={4} style={{ ...s.td, fontWeight: 700, textAlign: "right" }}>Total</td>
                    <td style={{ ...s.td, fontWeight: 800, color: "#dc2626" }}>{fmtCurrency(totalCost)}</td>
                    <td></td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Add ingredient */}
            <div style={{ background: "#f9f9f9", borderRadius: 8, padding: 14, marginTop: 16 }}>
              <p style={{ fontWeight: 700, fontSize: 13, margin: "0 0 10px" }}>+ Add Ingredient from Inventory</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 100px auto", gap: 8, alignItems: "end" }}>
                <div>
                  <label style={s.label}>Ingredient</label>
                  <select value={addIngId} onChange={e => setAddIngId(e.target.value)} style={s.input}>
                    <option value="">Select from inventory...</option>
                    {inventoryItems.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit}) — ₹{i.cost_per_unit?.toFixed(4) || "0"}/unit</option>)}
                  </select>
                </div>
                <div>
                  <label style={s.label}>Quantity</label>
                  <input type="number" step="0.001" placeholder="e.g. 500" value={addQty} onChange={e => setAddQty(e.target.value)} style={s.input} />
                </div>
                <button onClick={addItem} disabled={saving || !addIngId || !addQty} style={{ ...s.btn, height: 40, opacity: saving || !addIngId || !addQty ? 0.5 : 1 }}>Add</button>
              </div>
              {addIngId && addQty && <p style={{ fontSize: 12, color: "#16a34a", margin: "6px 0 0" }}>Preview: {fmtCurrency(previewCost)}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
