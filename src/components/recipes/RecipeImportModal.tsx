import { useState } from "react"
import { supabase } from "@/lib/supabase"
import { extractPdfText } from "@/lib/pdfExtract"
import { guessIngredientLines } from "@/lib/pdfHeuristicParse"
import { findBestMatch } from "@/lib/fuzzyMatch"

// Fully local/free — no AI API call, no Cowork/Claude session needed.
// PDF text extraction (@firecrawl/pdf-inspector-wasm) and the
// ingredient-line guessing (pdfHeuristicParse.ts) both run in the
// browser. This is deliberately less "smart" than an LLM would be —
// that tradeoff was chosen explicitly to avoid any per-use AI cost and
// so this works for any staff member on their own, not just when
// someone's in a chat with Claude. Every guess is reviewed and
// editable before anything saves — expect to correct some rows.

type MenuItem = { id: string; name: string; price: number }
type Ingredient = { id: string; name: string; unit: string }

type ReviewRow = {
  extractedName: string
  quantity: string
  unit: string
  ingredientId: string // "" = unmatched, will be skipped
}

type Props = {
  menuItems: MenuItem[]
  ingredients: Ingredient[]
  existingRecipeMenuItemIds: string[] // menu items that already have a recipe
  onClose: () => void
  onImported: () => void
}

type Step = "upload" | "extracting" | "review" | "saving"

export default function RecipeImportModal({ menuItems, ingredients, existingRecipeMenuItemIds, onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>("upload")
  const [error, setError] = useState("")

  const [menuItemId, setMenuItemId] = useState("")
  const [servings, setServings] = useState("1")
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [rawText, setRawText] = useState("")
  const [showRawText, setShowRawText] = useState(false)

  const handleFile = async (file: File) => {
    setError("")
    setStep("extracting")

    const pdfResult = await extractPdfText(file)
    if (!pdfResult.ok) {
      setError(pdfResult.error)
      setStep("upload")
      return
    }

    setRawText(pdfResult.markdown)

    if (pdfResult.title) {
      const guess = findBestMatch(pdfResult.title, menuItems)
      if (guess) setMenuItemId(guess.match.id)
    }

    const guessed = guessIngredientLines(pdfResult.markdown)
    setRows(
      guessed.map(g => {
        const match = findBestMatch(g.name, ingredients)
        return {
          extractedName: g.name,
          quantity: String(g.quantity),
          unit: g.unit,
          ingredientId: match ? match.match.id : "",
        }
      })
    )

    if (guessed.length === 0) {
      setError("Couldn't automatically find any ingredient lines in this PDF — you can still add rows manually below, or check the extracted text to see what came through.")
    }

    setStep("review")
  }

  const updateRow = (i: number, patch: Partial<ReviewRow>) => {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }

  const addBlankRow = () => {
    setRows(prev => [...prev, { extractedName: "(manual)", quantity: "", unit: "", ingredientId: "" }])
  }

  const removeRow = (i: number) => {
    setRows(prev => prev.filter((_, idx) => idx !== i))
  }

  const matchedCount = rows.filter(r => r.ingredientId && parseFloat(r.quantity) > 0).length
  const skippedCount = rows.length - matchedCount

  const handleSave = async () => {
    if (!menuItemId) { setError("Select which menu item this recipe is for."); return }
    if (matchedCount === 0) { setError("No ingredient rows are matched to your ingredients list — nothing to save."); return }

    setError("")
    setStep("saving")

    const mi = menuItems.find(m => m.id === menuItemId)
    const { data: recipe, error: recipeErr } = await supabase
      .from("recipes")
      .insert({ menu_item_id: menuItemId, name: mi?.name ?? "Recipe", serves: parseFloat(servings) || 1 })
      .select().single()

    if (recipeErr) { setError(recipeErr.message); setStep("review"); return }

    const payload = rows
      .filter(r => r.ingredientId && parseFloat(r.quantity) > 0)
      .map(r => ({
        recipe_id: recipe.id,
        ingredient_id: r.ingredientId,
        quantity: parseFloat(r.quantity),
      }))

    const { error: itemsErr } = await supabase.from("recipe_items").insert(payload)
    if (itemsErr) { setError(itemsErr.message); setStep("review"); return }

    onImported()
    onClose()
  }

  const alreadyHasRecipe = menuItemId && existingRecipeMenuItemIds.includes(menuItemId)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col pos-shadow-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="font-bold text-lg text-foreground m-0">Import recipe from PDF</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer text-xl leading-none">✕</button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {step === "upload" && (
            <div className="flex flex-col items-center justify-center gap-3 py-10">
              <p className="text-sm text-gray-500 text-center max-w-sm">
                Upload a text-based PDF (not a scanned photo) with a recipe. This reads it right on your device —
                no internet round-trip, nothing sent anywhere. It'll guess at ingredients and quantities; you
                review and fix anything before it's saved.
              </p>
              <label className="bg-primary text-primary-foreground rounded-lg px-5 py-2.5 text-sm font-bold cursor-pointer">
                Choose PDF
                <input
                  type="file" accept="application/pdf" className="hidden"
                  onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
              </label>
              {error && <p className="text-destructive text-sm text-center max-w-sm">{error}</p>}
            </div>
          )}

          {step === "extracting" && (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <p className="text-sm text-gray-500">Reading the PDF…</p>
            </div>
          )}

          {(step === "review" || step === "saving") && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-semibold text-gray-700">Menu item this recipe is for</label>
                  <select
                    value={menuItemId} onChange={e => setMenuItemId(e.target.value)}
                    className="px-3 py-2 border-[1.5px] border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-ring focus:border-primary"
                  >
                    <option value="">Select a menu item…</option>
                    {menuItems.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  {alreadyHasRecipe && (
                    <p className="text-xs text-amber-600 m-0">This menu item already has a recipe — saving will add a second one.</p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-semibold text-gray-700">Serves</label>
                  <input
                    type="number" value={servings} onChange={e => setServings(e.target.value)}
                    className="px-3 py-2 border-[1.5px] border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-ring focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[13px] font-semibold text-gray-700 m-0">
                    Ingredients ({matchedCount} matched{skippedCount > 0 ? `, ${skippedCount} unmatched — won't be saved` : ""})
                  </p>
                  <button onClick={addBlankRow} className="text-xs font-semibold text-primary bg-transparent border-none cursor-pointer">+ Add row</button>
                </div>
                <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                  {rows.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">No rows yet — add one manually, or check the extracted text below.</p>
                  )}
                  {rows.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="w-28 truncate text-gray-500 shrink-0" title={r.extractedName}>{r.extractedName}</span>
                      <input
                        type="number" value={r.quantity} onChange={e => updateRow(i, { quantity: e.target.value })}
                        placeholder="qty"
                        className="w-16 px-2 py-1.5 border border-border rounded text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                      <input
                        type="text" value={r.unit} onChange={e => updateRow(i, { unit: e.target.value })}
                        placeholder="unit"
                        className="w-14 px-2 py-1.5 border border-border rounded text-xs outline-none focus:ring-2 focus:ring-ring"
                      />
                      <select
                        value={r.ingredientId} onChange={e => updateRow(i, { ingredientId: e.target.value })}
                        className="flex-1 px-2 py-1.5 border border-border rounded text-sm outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="">— not matched, will skip —</option>
                        {ingredients.map(ing => <option key={ing.id} value={ing.id}>{ing.name}</option>)}
                      </select>
                      <button onClick={() => removeRow(i)} className="text-gray-300 hover:text-destructive bg-transparent border-none cursor-pointer text-sm shrink-0">✕</button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <button
                  onClick={() => setShowRawText(v => !v)}
                  className="text-xs font-semibold text-gray-500 bg-transparent border-none cursor-pointer p-0"
                >
                  {showRawText ? "▾" : "▸"} View extracted text (to check what the guesser missed)
                </button>
                {showRawText && (
                  <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap bg-gray-50 border border-border rounded-lg p-3 text-xs text-gray-600">{rawText}</pre>
                )}
              </div>

              {error && <p className="text-destructive text-sm">{error}</p>}
            </div>
          )}
        </div>

        {(step === "review" || step === "saving") && (
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm font-semibold bg-white">Cancel</button>
            <button
              onClick={handleSave} disabled={step === "saving"}
              className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold disabled:opacity-60"
            >
              {step === "saving" ? "Saving…" : `Save recipe (${matchedCount} ingredients)`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
