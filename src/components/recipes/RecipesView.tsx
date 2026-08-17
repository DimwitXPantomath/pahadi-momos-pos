import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { CUT_STYLES, HEAT_LEVELS, HEAT_LABELS, type HeatLevel } from "@/types/cuts"
import RecipeImportModal from "./RecipeImportModal"

// ─── Types ────────────────────────────────────────────────────────────────────
// Queried against the REAL schema (001_initial_schema.sql + 011_recipe_sop_fields.sql)
// — recipes.serves, recipe_items.quantity, ingredients.cost_per_usage_unit, etc.
// Not the fictional item_type/calculated_cost/base_unit shape the old
// RecipesPage.tsx stack assumed.

interface MenuItem {
  id: string
  name: string
  price: number
}

interface Ingredient {
  id: string
  name: string
  unit: string                  // usage_unit (grams/ml/pieces), legacy `unit` as fallback
  cost_per_usage_unit: number    // ₹ per usage unit — what "usage in recipe" is costed against
}

interface SubRecipe {
  id: string
  name: string
  yield_qty: number
  unit: string
}

interface Recipe {
  id: string
  menu_item_id: string | null
  menu_item_name: string
  menu_item_price: number
  serves: number
  dos: string | null
  donts: string | null
  remarks: string | null
  cooking_technique: string | null
}

interface RecipeLine {
  id: string
  recipe_id: string
  type: "ingredient" | "sub_recipe"
  ref_id: string
  ref_name: string
  ref_unit: string
  ref_cost_per_unit: number
  quantity: number
  line_cost: number
  cut_style: string | null
  heat_level: HeatLevel | null
  timing_note: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: d })
}
function fmtCurrency(n: number) {
  return "₹" + fmt(n, 2)
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RecipesView() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [subRecipes, setSubRecipes] = useState<SubRecipe[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [selected, setSelected] = useState<Recipe | null>(null)
  const [lines, setLines] = useState<RecipeLine[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  // ── Create recipe form
  const [createForm, setCreateForm] = useState({ menu_item_id: "", serves: "1" })

  // ── Add line item form
  const [lineType, setLineType] = useState<"ingredient" | "sub_recipe">("ingredient")
  const [lineForm, setLineForm] = useState({
    ref_id: "", quantity: "", cut_style: "", heat_level: "" as HeatLevel | "", timing_note: "",
  })

  // ── SOP notes (recipe-level) — edited inline, saved on demand
  const [sopForm, setSopForm] = useState({ dos: "", donts: "", remarks: "", cooking_technique: "" })
  const [sopSaving, setSopSaving] = useState(false)
  const [sopSaved, setSopSaved] = useState(false)

  // ── Fetchers ───────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true)

    const [miRes, ingRes, srRes, recRes] = await Promise.all([
      supabase.from("menu_items").select("id, name, price").order("name"),
      supabase.from("ingredients").select("id, name, usage_unit, unit, cost_per_usage_unit").order("name"),
      supabase.from("sub_recipes").select("id, name, yield_qty, unit").order("name"),
      supabase.from("recipes").select("*").order("created_at", { ascending: false }),
    ])

    setMenuItems(miRes.data || [])
    const mappedIngredients: Ingredient[] = (ingRes.data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      unit: row.usage_unit || row.unit || "g",
      cost_per_usage_unit: row.cost_per_usage_unit ?? 0,
    }))
    setIngredients(mappedIngredients)
    setSubRecipes(srRes.data || [])

    const mi = miRes.data || []
    const enriched: Recipe[] = (recRes.data || []).map((r: any) => {
      const item = mi.find((m: any) => m.id === r.menu_item_id)
      return {
        id: r.id,
        menu_item_id: r.menu_item_id,
        menu_item_name: item?.name ?? "Unknown",
        menu_item_price: item?.price ?? 0,
        serves: r.serves ?? 1,
        dos: r.dos ?? null,
        donts: r.donts ?? null,
        remarks: r.remarks ?? null,
        cooking_technique: r.cooking_technique ?? null,
      }
    })
    setRecipes(enriched)
    setLoading(false)
  }, [])

  const fetchLines = useCallback(async (recipeId: string) => {
    const { data } = await supabase
      .from("recipe_items")
      .select("id, recipe_id, ingredient_id, sub_recipe_id, quantity, cut_style, heat_level, timing_note")
      .eq("recipe_id", recipeId)

    if (!data) { setLines([]); return }

    const mapped: RecipeLine[] = await Promise.all(
      data.map(async (row: any) => {
        if (row.ingredient_id) {
          const ing = ingredients.find(i => i.id === row.ingredient_id)
          const costPerUsageUnit = ing?.cost_per_usage_unit ?? 0
          const lineCost = costPerUsageUnit * row.quantity
          return {
            id: row.id, recipe_id: row.recipe_id, type: "ingredient" as const,
            ref_id: row.ingredient_id,
            ref_name: ing?.name ?? "Unknown",
            ref_unit: ing?.unit ?? "",
            ref_cost_per_unit: costPerUsageUnit,
            quantity: row.quantity,
            line_cost: lineCost,
            cut_style: row.cut_style ?? null,
            heat_level: row.heat_level ?? null,
            timing_note: row.timing_note ?? null,
          }
        } else {
          const sr = subRecipes.find(s => s.id === row.sub_recipe_id)
          const { data: srItems } = await supabase
            .from("sub_recipe_items")
            .select("quantity, yield_percent, ingredients(cost_per_usage_unit)")
            .eq("sub_recipe_id", row.sub_recipe_id)

          let srTotalCost = 0
          ;(srItems || []).forEach((si: any) => {
            const cpu = si.ingredients?.cost_per_usage_unit ?? 0
            srTotalCost += cpu * si.quantity
          })
          const srCostPerUnit = sr && sr.yield_qty > 0 ? srTotalCost / sr.yield_qty : 0
          const lineCost = srCostPerUnit * row.quantity

          return {
            id: row.id, recipe_id: row.recipe_id, type: "sub_recipe" as const,
            ref_id: row.sub_recipe_id,
            ref_name: sr?.name ?? "Unknown",
            ref_unit: sr?.unit ?? "",
            ref_cost_per_unit: srCostPerUnit,
            quantity: row.quantity,
            line_cost: lineCost,
            cut_style: row.cut_style ?? null,
            heat_level: row.heat_level ?? null,
            timing_note: row.timing_note ?? null,
          }
        }
      })
    )
    setLines(mapped)
  }, [ingredients, subRecipes])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => { if (selected && ingredients.length > 0) fetchLines(selected.id) }, [selected, fetchLines, ingredients])
  useEffect(() => {
    if (selected) {
      setSopForm({
        dos: selected.dos ?? "",
        donts: selected.donts ?? "",
        remarks: selected.remarks ?? "",
        cooking_technique: selected.cooking_technique ?? "",
      })
    }
  }, [selected])

  // ── Computed ───────────────────────────────────────────────────────────────

  const totalCost = lines.reduce((sum, l) => sum + l.line_cost, 0)
  const costPerServing = selected && selected.serves > 0 ? totalCost / selected.serves : totalCost
  const menuPrice = selected?.menu_item_price ?? 0
  const grossMargin = menuPrice > 0 ? ((menuPrice - costPerServing) / menuPrice * 100) : 0
  const profit = menuPrice - costPerServing

  const menuItemsWithoutRecipe = menuItems.filter(m => !recipes.find(r => r.menu_item_id === m.id))
  const filteredRecipes = recipes.filter(r =>
    r.menu_item_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleCreateRecipe() {
    if (!createForm.menu_item_id) { setError("Select a menu item"); return }
    setSaving(true); setError("")

    const { data, error } = await supabase
      .from("recipes")
      .insert({
        menu_item_id: createForm.menu_item_id,
        name: menuItems.find(m => m.id === createForm.menu_item_id)?.name ?? "Recipe",
        serves: parseFloat(createForm.serves) || 1,
      })
      .select().single()

    if (error) { setError(error.message); setSaving(false); return }

    setSuccess("Recipe created!")
    setCreateForm({ menu_item_id: "", serves: "1" })
    setShowCreateForm(false)
    await fetchAll()
    const mi = menuItems.find(m => m.id === data.menu_item_id)
    setSelected({
      id: data.id, menu_item_id: data.menu_item_id,
      menu_item_name: mi?.name ?? "", menu_item_price: mi?.price ?? 0, serves: data.serves ?? 1,
      dos: null, donts: null, remarks: null, cooking_technique: null,
    })
    setTimeout(() => setSuccess(""), 2000)
    setSaving(false)
  }

  async function handleAddLine() {
    if (!selected) return
    if (!lineForm.ref_id) { setError(`Select a${lineType === "ingredient" ? "n ingredient" : " sub recipe"}`); return }
    const qty = parseFloat(lineForm.quantity)
    if (!qty || qty <= 0) { setError("Enter a valid quantity"); return }
    setSaving(true); setError("")

    const payload: any = {
      recipe_id: selected.id,
      quantity: qty,
      cut_style: lineForm.cut_style || null,
      heat_level: lineForm.heat_level || null,
      timing_note: lineForm.timing_note.trim() || null,
    }
    if (lineType === "ingredient") payload.ingredient_id = lineForm.ref_id
    else payload.sub_recipe_id = lineForm.ref_id

    const { error } = await supabase.from("recipe_items").insert(payload)
    if (error) { setError(error.message); setSaving(false); return }

    setSuccess("Added!")
    setLineForm({ ref_id: "", quantity: "", cut_style: "", heat_level: "", timing_note: "" })
    fetchLines(selected.id)
    setTimeout(() => setSuccess(""), 2000)
    setSaving(false)
  }

  async function handleDeleteLine(id: string) {
    await supabase.from("recipe_items").delete().eq("id", id)
    if (selected) fetchLines(selected.id)
  }

  async function handleDeleteRecipe(id: string) {
    if (!confirm("Delete this recipe?")) return
    await supabase.from("recipe_items").delete().eq("recipe_id", id)
    await supabase.from("recipes").delete().eq("id", id)
    setSelected(null); setLines([])
    fetchAll()
  }

  async function handleSaveSop() {
    if (!selected) return
    setSopSaving(true)
    const { error } = await supabase
      .from("recipes")
      .update({
        dos: sopForm.dos.trim() || null,
        donts: sopForm.donts.trim() || null,
        remarks: sopForm.remarks.trim() || null,
        cooking_technique: sopForm.cooking_technique.trim() || null,
      })
      .eq("id", selected.id)
    setSopSaving(false)
    if (error) { setError(error.message); return }
    setSopSaved(true)
    setTimeout(() => setSopSaved(false), 1500)
    fetchAll()
  }

  const previewRef = lineType === "ingredient"
    ? ingredients.find(i => i.id === lineForm.ref_id)
    : subRecipes.find(s => s.id === lineForm.ref_id)
  const previewQty = parseFloat(lineForm.quantity) || 0

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={s.page}>

      <div style={s.header}>
        <div>
          <h2 style={s.title}>📖 Recipes & SOPs</h2>
          <p style={s.subtitle}>
            Link menu items to ingredients & sub recipes · costing, cut style, heat, timing and technique in one place
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ ...s.primaryBtn, background: "white", color: "#111", border: "1.5px solid #e5e7eb" }} onClick={() => setShowImportModal(true)}>
            📄 Import from PDF
          </button>
          <button style={s.primaryBtn} onClick={() => { setShowCreateForm(v => !v); setError("") }}>
            {showCreateForm ? "✕ Cancel" : "➕ New Recipe"}
          </button>
        </div>
      </div>

      {error && <div style={s.errorBanner}>⚠️ {error}</div>}
      {success && <div style={s.successBanner}>✅ {success}</div>}

      {showImportModal && (
        <RecipeImportModal
          menuItems={menuItems}
          ingredients={ingredients}
          existingRecipeMenuItemIds={recipes.map(r => r.menu_item_id).filter((id): id is string => !!id)}
          onClose={() => setShowImportModal(false)}
          onImported={fetchAll}
        />
      )}

      {showCreateForm && (
        <div style={s.card}>
          <div style={s.cardTitle}>➕ Create Recipe for Menu Item</div>
          <div style={s.grid2}>
            <div style={s.field}>
              <label style={s.label}>Menu Item *</label>
              <select style={s.input} value={createForm.menu_item_id}
                onChange={e => setCreateForm(f => ({ ...f, menu_item_id: e.target.value }))}>
                <option value="">— Select menu item —</option>
                {menuItemsWithoutRecipe.length > 0 ? (
                  <>
                    <optgroup label="No recipe yet">
                      {menuItemsWithoutRecipe.map(m => (
                        <option key={m.id} value={m.id}>{m.name} · ₹{m.price}</option>
                      ))}
                    </optgroup>
                    {recipes.length > 0 && (
                      <optgroup label="Has recipe (will create duplicate)">
                        {menuItems.filter(m => recipes.find(r => r.menu_item_id === m.id)).map(m => (
                          <option key={m.id} value={m.id}>{m.name} · ₹{m.price}</option>
                        ))}
                      </optgroup>
                    )}
                  </>
                ) : (
                  menuItems.map(m => (
                    <option key={m.id} value={m.id}>{m.name} · ₹{m.price}</option>
                  ))
                )}
              </select>
            </div>
            <div style={s.field}>
              <label style={s.label}>Servings per batch</label>
              <input style={s.input} type="number" min="1" step="1"
                placeholder="How many portions this recipe makes"
                value={createForm.serves}
                onChange={e => setCreateForm(f => ({ ...f, serves: e.target.value }))} />
            </div>
          </div>
          <div style={s.btnRow}>
            <button style={{ ...s.primaryBtn, opacity: saving ? 0.7 : 1 }}
              onClick={handleCreateRecipe} disabled={saving}>
              {saving ? "Creating…" : "Create Recipe"}
            </button>
          </div>
        </div>
      )}

      <div style={s.split}>

        {/* LEFT: recipe list */}
        <div style={s.leftPanel}>
          <div style={s.panelHead}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Recipes</span>
            <span style={s.badge2}>{recipes.length}</span>
          </div>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
            <input style={{ ...s.input, margin: 0 }} placeholder="🔍 Search…"
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          {loading ? <div style={s.empty}>Loading…</div> :
           filteredRecipes.length === 0 ? (
            <div style={s.empty}>
              {searchQuery ? "No recipes match" : "No recipes yet."}
            </div>
          ) : (
            filteredRecipes.map(r => (
              <div key={r.id} onClick={() => setSelected(r)}
                style={{ ...s.listItem, background: selected?.id === r.id ? "hsl(var(--primary))" : "white", color: selected?.id === r.id ? "white" : "#111" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{r.menu_item_name}</div>
                  <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                    Menu price: ₹{r.menu_item_price} · {r.serves} serving{r.serves !== 1 ? "s" : ""}
                  </div>
                </div>
                <button onClick={e => { e.stopPropagation(); handleDeleteRecipe(r.id) }}
                  style={{ ...s.iconBtn, background: selected?.id === r.id ? "rgba(255,255,255,0.15)" : "#fee2e2" }}>
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
              <div style={{ fontSize: 48, marginBottom: 12 }}>📖</div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Select a recipe</div>
              <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 6 }}>or create a new one above</div>
            </div>
          ) : (
            <>
              <div style={s.builderHead}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800 }}>{selected.menu_item_name}</div>
                  <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
                    Menu price: ₹{selected.menu_item_price} · {selected.serves} serving{selected.serves !== 1 ? "s" : ""}
                  </div>
                </div>
                <div style={s.marginRow}>
                  <div style={s.marginCard}>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>Cost/serving</div>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>{fmtCurrency(costPerServing)}</div>
                  </div>
                  <div style={s.marginCard}>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>Profit/serving</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: profit >= 0 ? "#16a34a" : "#ef4444" }}>
                      {fmtCurrency(profit)}
                    </div>
                  </div>
                  <div style={{ ...s.marginCard, background: grossMargin >= 60 ? "#dcfce7" : grossMargin >= 40 ? "#fef9c3" : "#fee2e2" }}>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>Gross Margin</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: grossMargin >= 60 ? "#166534" : grossMargin >= 40 ? "#854d0e" : "#991b1b" }}>
                      {fmt(grossMargin, 1)}%
                    </div>
                  </div>
                </div>
              </div>

              {/* Add ingredient / sub recipe */}
              <div style={{ padding: "14px 18px", borderBottom: "1px solid #f3f4f6" }}>
                <div style={s.cardTitle}>➕ Add to Recipe</div>

                <div style={s.typeToggle}>
                  {(["ingredient", "sub_recipe"] as const).map(t => (
                    <button key={t} onClick={() => { setLineType(t); setLineForm({ ref_id: "", quantity: "", cut_style: "", heat_level: "", timing_note: "" }) }}
                      style={{ ...s.typeBtn, background: lineType === t ? "hsl(var(--primary))" : "#f3f4f6", color: lineType === t ? "white" : "#374151", fontWeight: lineType === t ? 700 : 400 }}>
                      {t === "ingredient" ? "🧂 Raw Ingredient" : "🥣 Sub Recipe"}
                    </button>
                  ))}
                </div>

                <div style={s.grid2}>
                  <div style={s.field}>
                    <label style={s.label}>
                      {lineType === "ingredient" ? "Ingredient (from master list)" : "Sub Recipe"} *
                    </label>
                    <select style={s.input} value={lineForm.ref_id}
                      onChange={e => setLineForm(f => ({ ...f, ref_id: e.target.value }))}>
                      <option value="">— Select —</option>
                      {lineType === "ingredient"
                        ? ingredients.map(i => (
                          <option key={i.id} value={i.id}>
                            {i.name} ({i.unit}) · {fmtCurrency(i.cost_per_usage_unit)}/{i.unit}
                          </option>
                        ))
                        : subRecipes.map(sr => (
                          <option key={sr.id} value={sr.id}>
                            {sr.name} (per {sr.unit})
                          </option>
                        ))
                      }
                    </select>
                  </div>
                  <div style={s.field}>
                    <label style={s.label}>
                      Usage in recipe {previewRef ? `(${(previewRef as any).unit})` : ""} *
                    </label>
                    <input style={s.input} type="number" min="0" step="0.01"
                      placeholder="e.g. 150" value={lineForm.quantity}
                      onChange={e => setLineForm(f => ({ ...f, quantity: e.target.value }))} />
                  </div>
                </div>

                {/* SOP fields per line */}
                <div style={s.grid3}>
                  <div style={s.field}>
                    <label style={s.label}>Cut style (optional)</label>
                    <select style={s.input} value={lineForm.cut_style}
                      onChange={e => setLineForm(f => ({ ...f, cut_style: e.target.value }))}>
                      <option value="">— Not applicable —</option>
                      {CUT_STYLES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div style={s.field}>
                    <label style={s.label}>Heat</label>
                    <select style={s.input} value={lineForm.heat_level}
                      onChange={e => setLineForm(f => ({ ...f, heat_level: e.target.value as HeatLevel | "" }))}>
                      <option value="">— None —</option>
                      {HEAT_LEVELS.map(h => <option key={h} value={h}>{HEAT_LABELS[h]}</option>)}
                    </select>
                  </div>
                  <div style={s.field}>
                    <label style={s.label}>When to add</label>
                    <input style={s.input} placeholder="e.g. Add at 2 min / after onions golden"
                      value={lineForm.timing_note}
                      onChange={e => setLineForm(f => ({ ...f, timing_note: e.target.value }))} />
                  </div>
                </div>

                {previewQty > 0 && lineForm.ref_id && (
                  <div style={s.previewStrip}>
                    {lineType === "ingredient" ? (
                      <>
                        <span style={{ color: "#6b7280" }}>Line cost: </span>
                        <strong style={{ color: "#16a34a" }}>
                          {fmtCurrency(((ingredients.find(i => i.id === lineForm.ref_id))?.cost_per_usage_unit ?? 0) * previewQty)}
                        </strong>
                      </>
                    ) : (
                      <span style={{ color: "#6b7280" }}>Sub recipe used as a single ingredient · line cost auto-calculated from its own ingredient costs</span>
                    )}
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                  <button style={{ ...s.primaryBtn, opacity: saving ? 0.7 : 1 }}
                    onClick={handleAddLine} disabled={saving}>
                    {saving ? "Adding…" : "Add to Recipe"}
                  </button>
                </div>
              </div>

              {/* Recipe lines table */}
              {lines.length === 0 ? (
                <div style={s.empty}>No ingredients yet. Add above.</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        {["Type", "Name", "Cut", "Heat", "When to add", "Usage", "₹/unit", "Line Cost", ""].map(h => (
                          <th key={h} style={s.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line, i) => (
                        <tr key={line.id} style={{ background: i % 2 === 0 ? "white" : "#f9fafb" }}>
                          <td style={s.td}>
                            <span style={{
                              ...s.typeBadge,
                              background: line.type === "ingredient" ? "#dbeafe" : "#ede9fe",
                              color: line.type === "ingredient" ? "#1e40af" : "#6d28d9",
                            }}>
                              {line.type === "ingredient" ? "🧂" : "🥣"}
                            </span>
                          </td>
                          <td style={{ ...s.td, fontWeight: 600 }}>{line.ref_name}</td>
                          <td style={{ ...s.td, fontSize: 12, color: "#6b7280" }}>{line.cut_style || "—"}</td>
                          <td style={{ ...s.td, fontSize: 12 }}>{line.heat_level ? HEAT_LABELS[line.heat_level] : "—"}</td>
                          <td style={{ ...s.td, fontSize: 12, color: "#6b7280" }}>{line.timing_note || "—"}</td>
                          <td style={{ ...s.td, textAlign: "right" }}>
                            {fmt(line.quantity)} {line.ref_unit}
                          </td>
                          <td style={{ ...s.td, textAlign: "right", color: "#6b7280" }}>
                            {fmtCurrency(line.ref_cost_per_unit)}
                          </td>
                          <td style={{ ...s.td, textAlign: "right", fontWeight: 700 }}>
                            {fmtCurrency(line.line_cost)}
                          </td>
                          <td style={s.td}>
                            <button style={s.delBtn} onClick={() => handleDeleteLine(line.id)}>🗑️</button>
                          </td>
                        </tr>
                      ))}

                      <tr style={{ background: "#f0fdf4", borderTop: "2px solid #bbf7d0" }}>
                        <td colSpan={7} style={{ ...s.td, fontWeight: 700 }}>
                          Total Cost · {lines.length} component{lines.length !== 1 ? "s" : ""}
                          {selected.serves > 1 ? ` · ${selected.serves} servings` : ""}
                        </td>
                        <td style={{ ...s.td, textAlign: "right", fontWeight: 800, fontSize: 16, color: "#16a34a" }}>
                          {fmtCurrency(totalCost)}
                        </td>
                        <td style={s.td} />
                      </tr>
                      {selected.serves > 1 && (
                        <tr style={{ background: "#f0fdf4" }}>
                          <td colSpan={7} style={{ ...s.td, color: "#6b7280", fontSize: 13 }}>
                            Cost per serving
                          </td>
                          <td style={{ ...s.td, textAlign: "right", fontWeight: 700, color: "#16a34a" }}>
                            {fmtCurrency(costPerServing)}
                          </td>
                          <td style={s.td} />
                        </tr>
                      )}
                      <tr style={{ background: menuPrice > 0 ? (grossMargin >= 50 ? "#f0fdf4" : "#fef9c3") : "#f9fafb" }}>
                        <td colSpan={7} style={{ ...s.td, color: "#6b7280", fontSize: 13 }}>
                          Menu price · Gross margin
                        </td>
                        <td style={{ ...s.td, textAlign: "right", fontWeight: 800, color: grossMargin >= 50 ? "#166534" : "#854d0e" }}>
                          ₹{menuPrice} · {fmt(grossMargin, 1)}%
                        </td>
                        <td style={s.td} />
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* SOP notes — recipe-level */}
              <div style={{ padding: "16px 18px" }}>
                <div style={s.cardTitle}>📋 Recipe SOP</div>
                <div style={s.grid2}>
                  <div style={s.field}>
                    <label style={s.label}>Do's</label>
                    <textarea style={s.textarea} rows={4} placeholder="e.g. Always sift the flour before mixing"
                      value={sopForm.dos} onChange={e => setSopForm(f => ({ ...f, dos: e.target.value }))} />
                  </div>
                  <div style={s.field}>
                    <label style={s.label}>Don'ts</label>
                    <textarea style={s.textarea} rows={4} placeholder="e.g. Don't overmix once the eggs are added"
                      value={sopForm.donts} onChange={e => setSopForm(f => ({ ...f, donts: e.target.value }))} />
                  </div>
                </div>
                <div style={s.grid2}>
                  <div style={s.field}>
                    <label style={s.label}>Remarks</label>
                    <textarea style={s.textarea} rows={3} placeholder="Any other notes for the kitchen"
                      value={sopForm.remarks} onChange={e => setSopForm(f => ({ ...f, remarks: e.target.value }))} />
                  </div>
                  <div style={s.field}>
                    <label style={s.label}>Cooking technique</label>
                    <textarea style={s.textarea} rows={3} placeholder="e.g. Bain-marie, sear then braise, sous vide..."
                      value={sopForm.cooking_technique} onChange={e => setSopForm(f => ({ ...f, cooking_technique: e.target.value }))} />
                  </div>
                </div>
                <div style={s.btnRow}>
                  <button style={{ ...s.primaryBtn, opacity: sopSaving ? 0.7 : 1, background: sopSaved ? "#16a34a" : "hsl(var(--primary))" }}
                    onClick={handleSaveSop} disabled={sopSaving}>
                    {sopSaving ? "Saving…" : sopSaved ? "✓ Saved!" : "Save SOP Notes"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { padding: "16px 16px 80px", maxWidth: 1300, margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  title: { fontSize: 22, fontWeight: 800, color: "#111", margin: 0 },
  subtitle: { fontSize: 13, color: "#6b7280", marginTop: 4, maxWidth: 560 },
  split: { display: "grid", gridTemplateColumns: "280px 1fr", gap: 16, alignItems: "start" },
  leftPanel: { background: "white", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" },
  panelHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", background: "#f9fafb", borderBottom: "1px solid #f3f4f6" },
  badge2: { background: "hsl(var(--primary))", color: "white", borderRadius: 20, padding: "2px 8px", fontSize: 12, fontWeight: 700 },
  listItem: { display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: "1px solid #f3f4f6", cursor: "pointer" },
  iconBtn: { width: 30, height: 30, border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, flexShrink: 0 },
  rightPanel: { background: "white", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" },
  builderHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "16px 18px", background: "#f9fafb", borderBottom: "1px solid #f3f4f6", gap: 16, flexWrap: "wrap" },
  marginRow: { display: "flex", gap: 10, flexShrink: 0 },
  marginCard: { background: "white", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 14px", textAlign: "center", minWidth: 90 },
  emptyBuilder: { display: "flex", flexDirection: "column", alignItems: "center", padding: "80px 20px", color: "#9ca3af" },
  card: { background: "white", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, marginBottom: 16 },
  cardTitle: { fontSize: 14, fontWeight: 700, color: "#111", marginBottom: 12 },
  typeToggle: { display: "flex", gap: 6, marginBottom: 12 },
  typeBtn: { height: 34, padding: "0 16px", border: "none", borderRadius: 20, fontSize: 13, cursor: "pointer" },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 10 },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.5px" },
  input: { height: 40, padding: "0 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, color: "#111", background: "#fafafa", outline: "none", width: "100%", boxSizing: "border-box" },
  textarea: { padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, color: "#111", background: "#fafafa", outline: "none", width: "100%", boxSizing: "border-box", fontFamily: "system-ui", resize: "vertical" as const },
  previewStrip: { background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "8px 14px", fontSize: 13, color: "#374151", marginTop: 4 },
  btnRow: { display: "flex", justifyContent: "flex-end", marginTop: 12 },
  primaryBtn: { height: 44, padding: "0 20px", background: "hsl(var(--primary))", color: "white", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { padding: "10px 12px", background: "#f3f4f6", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" },
  td: { padding: "10px 12px", borderBottom: "1px solid #f3f4f6", color: "#111", whiteSpace: "nowrap" },
  typeBadge: { display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700 },
  delBtn: { background: "#fee2e2", border: "none", borderRadius: 6, width: 30, height: 30, cursor: "pointer", fontSize: 13 },
  empty: { textAlign: "center", padding: "32px 20px", color: "#9ca3af", fontSize: 14 },
  errorBanner: { background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 12 },
  successBanner: { background: "#dcfce7", color: "#166534", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 12 },
}
