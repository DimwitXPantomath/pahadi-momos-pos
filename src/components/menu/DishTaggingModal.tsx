import { useState, useEffect } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { updateMenuItem } from "@/services/menuService"
import { computeMenuItemCalories } from "@/services/calorieService"
import type { MenuItem } from "@/types/pos"

// Taste Palette dish tagging — staff-facing. Per the spec: an untagged
// dish must never silently read as "safe" (dietary_type/allergens are
// Layer-1 safety filters), so every field here defaults to unset, not
// a "neutral" value, and the modal shows a completeness count rather
// than hiding what's missing.

const DIETARY_OPTIONS = [
  { value: "vegetarian", label: "Vegetarian" },
  { value: "non_vegetarian", label: "Non-veg" },
  { value: "eggetarian", label: "Eggetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "jain", label: "Jain" },
]

const ALLERGEN_OPTIONS = ["Peanuts", "Tree nuts", "Dairy", "Gluten", "Soy", "Shellfish", "Eggs", "Sesame", "Mustard"]

const COOKING_TYPE_OPTIONS = ["Grilled", "Fried", "Steamed", "Roasted", "Boiled", "Raw / Fresh"]

const CUISINE_OPTIONS = ["North Indian", "South Indian", "Chinese", "Continental", "Fast Food", "Street Food", "Bakery & Desserts"]

const MEAL_COURSE_OPTIONS = [
  { value: "starter", label: "Starter" },
  { value: "main", label: "Main" },
  { value: "dessert", label: "Dessert" },
  { value: "beverage", label: "Beverage" },
  { value: "snack", label: "Snack" },
]

const FLAVOR_OPTIONS = ["Sweet", "Savory", "Tangy", "Spicy & tangy", "Mild & comforting"]

// Required per the spec's B.1 table — used for the completeness count.
const REQUIRED_FIELDS = ["dietary_type", "allergens", "spice_level"] as const

function chipStyle(active: boolean) {
  return `px-3 py-1.5 rounded-full text-xs font-semibold border cursor-pointer transition-colors ${
    active ? "bg-primary text-primary-foreground border-primary" : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
  }`
}

type Props = {
  item: MenuItem
  onClose: () => void
  onSaved: (updated: MenuItem) => void
}

export default function DishTaggingModal({ item, onClose, onSaved }: Props) {
  const [dietaryType, setDietaryType] = useState(item.dietary_type ?? null)
  const [allergens, setAllergens] = useState<string[]>(item.allergens ?? [])
  const [allergensConfirmedNone, setAllergensConfirmedNone] = useState(item.allergens?.length === 0)
  const [spiceLevel, setSpiceLevel] = useState(item.spice_level ?? null)
  const [cookingType, setCookingType] = useState<string[]>(item.cooking_type ?? [])
  const [cuisineCategory, setCuisineCategory] = useState(item.cuisine_category ?? null)
  const [mealCourseType, setMealCourseType] = useState(item.meal_course_type ?? null)
  const [flavorProfile, setFlavorProfile] = useState<string[]>(item.flavor_profile ?? [])
  const [estimatedCalories, setEstimatedCalories] = useState(item.estimated_calories?.toString() ?? "")
  const [caloriesManual, setCaloriesManual] = useState(item.calories_manually_overridden ?? (item.estimated_calories != null))
  const [saving, setSaving] = useState(false)
  const [calcState, setCalcState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "no-recipe" }
    | { status: "no-ingredients" }
    | { status: "done"; caloriesPerServing: number; missingIngredients: string[] }
  >({ status: "idle" })

  const runAutoCalc = async () => {
    setCalcState({ status: "loading" })
    const result = await computeMenuItemCalories(item.id)
    if (!result.ok) {
      setCalcState({ status: result.reason })
      return
    }
    setCalcState({ status: "done", caloriesPerServing: result.caloriesPerServing, missingIngredients: result.missingIngredients })
    // Priority rule: an outlet-entered manual value always wins over the
    // calculator. If the field is already a manual entry, the calculated
    // number is shown as a suggestion only (via calcState below) — it
    // never silently overwrites what the outlet typed in. Auto-fills
    // only when nothing manual is on record yet, and only when every
    // ingredient had calorie data (never fill in a partial number).
    if (!caloriesManual && result.missingIngredients.length === 0) {
      setEstimatedCalories(String(result.caloriesPerServing))
      setCaloriesManual(false)
    }
  }

  const acceptCalculated = (value: number) => {
    setEstimatedCalories(String(value))
    setCaloriesManual(false)
  }

  const toggleMulti = (list: string[], setList: (v: string[]) => void, val: string) => {
    setList(list.includes(val) ? list.filter(v => v !== val) : [...list, val])
  }

  const completedCount = REQUIRED_FIELDS.filter(f => {
    if (f === "dietary_type") return !!dietaryType
    if (f === "allergens") return allergens.length > 0 || allergensConfirmedNone
    if (f === "spice_level") return spiceLevel !== null
    return false
  }).length

  const save = async () => {
    setSaving(true)
    const updated = await updateMenuItem(item.id, {
      dietary_type: dietaryType,
      allergens: allergensConfirmedNone && allergens.length === 0 ? [] : (allergens.length > 0 ? allergens : null),
      spice_level: spiceLevel,
      cooking_type: cookingType.length > 0 ? cookingType : null,
      cuisine_category: cuisineCategory,
      meal_course_type: mealCourseType,
      flavor_profile: flavorProfile.length > 0 ? flavorProfile : null,
      estimated_calories: estimatedCalories ? Number(estimatedCalories) : null,
      calories_manually_overridden: estimatedCalories !== "" ? caloriesManual : false,
    } as Partial<MenuItem>)
    setSaving(false)
    if (updated) onSaved(updated)
  }

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="w-[560px] max-h-[85vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-bold text-gray-900">Tag "{item.name}"</h2>
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${completedCount === REQUIRED_FIELDS.length ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
              {completedCount}/{REQUIRED_FIELDS.length} required tagged
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-5">Used by Taste Palette to match this dish to customer preferences. Dietary type and allergens are safety filters — leave unset rather than guessing.</p>

          <div className="mb-5">
            <label className="text-xs font-semibold text-gray-700 block mb-2">Dietary type *</label>
            <div className="flex flex-wrap gap-2">
              {DIETARY_OPTIONS.map(opt => (
                <button key={opt.value} type="button" className={chipStyle(dietaryType === opt.value)} onClick={() => setDietaryType(opt.value as any)}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-5">
            <label className="text-xs font-semibold text-gray-700 block mb-2">Allergens present *</label>
            <div className="flex flex-wrap gap-2">
              {ALLERGEN_OPTIONS.map(opt => (
                <button
                  key={opt}
                  type="button"
                  className={chipStyle(allergens.includes(opt))}
                  onClick={() => { setAllergensConfirmedNone(false); toggleMulti(allergens, setAllergens, opt) }}
                >
                  {opt}
                </button>
              ))}
              <button
                type="button"
                className={chipStyle(allergensConfirmedNone && allergens.length === 0)}
                onClick={() => { setAllergens([]); setAllergensConfirmedNone(true) }}
              >
                None (confirmed)
              </button>
            </div>
          </div>

          <div className="mb-5">
            <label className="text-xs font-semibold text-gray-700 block mb-2">Spice level *</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map(lvl => (
                <button key={lvl} type="button" className={chipStyle(spiceLevel === lvl)} onClick={() => setSpiceLevel(lvl)}>
                  {"🌶️".repeat(lvl)}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-5">
            <label className="text-xs font-semibold text-gray-700 block mb-2">Estimated calories</label>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="number"
                value={estimatedCalories}
                onChange={e => { setEstimatedCalories(e.target.value); setCaloriesManual(true) }}
                placeholder="e.g. 320"
                className="w-40 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-primary"
              />
              <span className="text-xs text-gray-400">kcal per serving</span>
              <button
                type="button"
                onClick={runAutoCalc}
                disabled={calcState.status === "loading"}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:border-primary disabled:opacity-50"
              >
                {calcState.status === "loading" ? "Calculating…" : "Auto-calculate from recipe"}
              </button>
            </div>

            {calcState.status === "no-recipe" && (
              <p className="text-xs text-amber-600 mt-2">No recipe is linked to this menu item yet — can't auto-calculate. Add one in Recipes, or enter calories manually.</p>
            )}
            {calcState.status === "no-ingredients" && (
              <p className="text-xs text-amber-600 mt-2">This recipe has no ingredients listed — can't auto-calculate.</p>
            )}
            {calcState.status === "done" && calcState.missingIngredients.length === 0 && !caloriesManual && (
              <p className="text-xs text-green-700 mt-2">Filled in {calcState.caloriesPerServing} kcal/serving from the recipe.</p>
            )}
            {calcState.status === "done" && calcState.missingIngredients.length === 0 && caloriesManual && (
              <p className="text-xs text-gray-600 mt-2">
                Calculated from the recipe: {calcState.caloriesPerServing} kcal/serving. Your manual entry above takes priority and won't be overwritten —{" "}
                <button type="button" className="underline font-semibold" onClick={() => acceptCalculated(calcState.caloriesPerServing)}>
                  use the calculated value instead
                </button>.
              </p>
            )}
            {calcState.status === "done" && calcState.missingIngredients.length > 0 && (
              <p className="text-xs text-amber-600 mt-2">
                Partial estimate only — {calcState.caloriesPerServing} kcal/serving counts just the ingredients we have calorie data for. Missing: {calcState.missingIngredients.slice(0, 6).join(", ")}{calcState.missingIngredients.length > 6 ? ", …" : ""}. Not auto-filled — add calorie data for these ingredients first, or enter a manual estimate.
              </p>
            )}

            <p className="text-xs text-gray-400 mt-1">
              Auto-calc uses a curated reference table of common ingredient calorie values (not the full government IFCT dataset) — treat results as a testable estimate, not a lab-verified number.
            </p>
          </div>

          <div className="mb-5">
            <label className="text-xs font-semibold text-gray-700 block mb-2">Cooking type</label>
            <div className="flex flex-wrap gap-2">
              {COOKING_TYPE_OPTIONS.map(opt => (
                <button key={opt} type="button" className={chipStyle(cookingType.includes(opt))} onClick={() => toggleMulti(cookingType, setCookingType, opt)}>
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-5">
            <label className="text-xs font-semibold text-gray-700 block mb-2">Cuisine category</label>
            <div className="flex flex-wrap gap-2">
              {CUISINE_OPTIONS.map(opt => (
                <button key={opt} type="button" className={chipStyle(cuisineCategory === opt)} onClick={() => setCuisineCategory(opt)}>
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-5">
            <label className="text-xs font-semibold text-gray-700 block mb-2">Meal / course type</label>
            <div className="flex flex-wrap gap-2">
              {MEAL_COURSE_OPTIONS.map(opt => (
                <button key={opt.value} type="button" className={chipStyle(mealCourseType === opt.value)} onClick={() => setMealCourseType(opt.value as any)}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <label className="text-xs font-semibold text-gray-700 block mb-2">Flavor profile</label>
            <div className="flex flex-wrap gap-2">
              {FLAVOR_OPTIONS.map(opt => (
                <button key={opt} type="button" className={chipStyle(flavorProfile.includes(opt))} onClick={() => toggleMulti(flavorProfile, setFlavorProfile, opt)}>
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700">Cancel</button>
            <button onClick={save} disabled={saving} className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
              {saving ? "Saving..." : "Save tags"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
