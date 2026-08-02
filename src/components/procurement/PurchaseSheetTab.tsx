import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { buildPurchaseSheet, createDraftProcurementFromSheet, type IngredientNeed } from "@/services/purchaseSheetService"

type Recipe = { id: string; name: string; serves: number }

export default function PurchaseSheetTab({ outletId, onCreated }: { outletId: string; onCreated: () => void }) {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [planned, setPlanned] = useState<Record<string, string>>({})
  const [results, setResults] = useState<IngredientNeed[] | null>(null)
  const [calculating, setCalculating] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createdMsg, setCreatedMsg] = useState("")

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("recipes").select("id, name, serves").order("name")
      setRecipes(data || [])
    })()
  }, [])

  const calculate = async () => {
    const plannedRecipes = Object.entries(planned)
      .map(([recipeId, val]) => ({ recipeId, batches: parseFloat(val) || 0 }))
      .filter(p => p.batches > 0)

    if (plannedRecipes.length === 0) { alert("Enter a planned batch count for at least one recipe"); return }
    setCalculating(true)
    const needs = await buildPurchaseSheet(plannedRecipes)
    setResults(needs)
    setCalculating(false)
    setCreatedMsg("")
  }

  const createDraft = async () => {
    if (!results) return
    setCreating(true)
    const res = await createDraftProcurementFromSheet(outletId, results)
    setCreating(false)
    if (res) {
      setCreatedMsg(`✅ Draft procurement request created with ${results.filter(r => r.shortfall > 0).length} ingredient(s).`)
      setTimeout(onCreated, 1200)
    } else {
      setCreatedMsg("Nothing to buy — everything's already in stock, or something went wrong.")
    }
  }

  const totalCost = (results || []).reduce((sum, r) => sum + r.shortfall * r.cost_per_usage_unit, 0)
  const shortfallCount = (results || []).filter(r => r.shortfall > 0).length

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <h3 style={s.cardTitle}>1. What are you planning to make?</h3>
        <p style={s.hint}>
          Enter planned batch counts for the recipes you'll run. This explodes each recipe's ingredient list
          (including nested sub-recipes) and totals what you need across everything selected.
        </p>
        <div style={s.recipeGrid}>
          {recipes.map(r => (
            <div key={r.id} style={s.recipeRow}>
              <span style={{ fontSize: 13, flex: 1 }}>{r.name} <span style={{ color: "#9ca3af" }}>· serves {r.serves}</span></span>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={planned[r.id] || ""}
                onChange={e => setPlanned(prev => ({ ...prev, [r.id]: e.target.value }))}
                style={s.numInput}
              />
              <span style={{ fontSize: 11, color: "#9ca3af" }}>batches</span>
            </div>
          ))}
          {recipes.length === 0 && <p style={{ fontSize: 12, color: "#9ca3af" }}>No recipes yet — add some in the Recipes tab first.</p>}
        </div>
        <button onClick={calculate} disabled={calculating} style={s.btn}>
          {calculating ? "Calculating…" : "🧮 Calculate ingredient needs"}
        </button>
      </div>

      {results && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>2. Shopping list</h3>
          {results.length === 0 ? (
            <p style={{ fontSize: 13, color: "#9ca3af" }}>No ingredients found for the selected recipes.</p>
          ) : (
            <>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Ingredient</th>
                    <th style={s.th}>Needed</th>
                    <th style={s.th}>On hand</th>
                    <th style={s.th}>To buy</th>
                    <th style={s.th}>Est. cost</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map(r => (
                    <tr key={r.ingredient_id}>
                      <td style={s.td}>{r.name}</td>
                      <td style={s.td}>{r.needed} {r.usage_unit}</td>
                      <td style={s.td}>{r.onHand} {r.usage_unit}</td>
                      <td style={{ ...s.td, fontWeight: 700, color: r.shortfall > 0 ? "#dc2626" : "#16a34a" }}>
                        {r.shortfall > 0 ? `${r.shortfall} ${r.usage_unit}` : "✓ sufficient"}
                      </td>
                      <td style={s.td}>{r.shortfall > 0 ? `₹${(r.shortfall * r.cost_per_usage_unit).toFixed(2)}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, flexWrap: "wrap", gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>
                  {shortfallCount} to buy · est. ₹{totalCost.toFixed(2)}
                </span>
                <button onClick={createDraft} disabled={creating || shortfallCount === 0} style={{ ...s.btn, opacity: shortfallCount === 0 ? 0.5 : 1 }}>
                  {creating ? "Creating…" : "📤 Create draft Procurement request"}
                </button>
              </div>
              {createdMsg && <p style={{ fontSize: 12, marginTop: 10, color: createdMsg.startsWith("✅") ? "#16a34a" : "#dc2626" }}>{createdMsg}</p>}
            </>
          )}
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 16 },
  card: { background: "white", border: "1px solid #e5e7eb", borderRadius: 12, padding: "20px 24px" },
  cardTitle: { fontWeight: 700, fontSize: 15, margin: "0 0 6px" },
  hint: { fontSize: 12, color: "#6b7280", margin: "0 0 14px", maxWidth: 560 },
  recipeGrid: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 },
  recipeRow: { display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#fafafa", borderRadius: 8 },
  numInput: { width: 64, padding: "6px 8px", border: "1.5px solid #e5e7eb", borderRadius: 6, fontSize: 13, outline: "none", textAlign: "right" as const },
  btn: { padding: "8px 16px", background: "#111", color: "white", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  table: { width: "100%", borderCollapse: "collapse" as const },
  th: { textAlign: "left" as const, padding: "8px 12px", fontSize: 12, fontWeight: 600, color: "#6b7280", borderBottom: "1px solid #e5e7eb" },
  td: { padding: "8px 12px", fontSize: 13, borderBottom: "1px solid #f3f4f6", color: "#111" },
}
