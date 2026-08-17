import { supabase } from "@/lib/supabase"

// Taste Palette calorie auto-calculation (task #70). Reuses the same
// recipe-explosion pattern as pnlService.ts's COGS calculation — walk
// recipe_items, expand any sub_recipe_id lines against sub_recipe_items,
// sum per-ingredient totals, look up calories_per_usage_unit (see
// migration 025_ingredient_calories.sql — curated standard reference
// values, NOT the full government IFCT dataset), divide by recipe.serves.
//
// Ingredients with no calorie data on file are never silently treated
// as 0 — they're reported back by name so the UI can tell staff exactly
// what's missing instead of showing a confidently wrong number.

export type CalorieCalcResult =
  | { ok: true; caloriesPerServing: number; missingIngredients: string[] }
  | { ok: false; reason: "no-recipe" | "no-ingredients" }

type RecipeItemRow = { recipe_id: string; ingredient_id: string | null; sub_recipe_id: string | null; quantity: number }
type SubRecipeItemRow = { sub_recipe_id: string; ingredient_id: string; quantity: number }

export async function computeMenuItemCalories(menuItemId: string): Promise<CalorieCalcResult> {
  const { data: recipeRow, error: recipeError } = await supabase
    .from("recipes")
    .select("id, serves")
    .eq("menu_item_id", menuItemId)
    .maybeSingle()

  if (recipeError) console.error("computeMenuItemCalories: recipe lookup error", recipeError)
  if (!recipeRow) return { ok: false, reason: "no-recipe" }

  const { data: recipeItemRows, error: itemsError } = await supabase
    .from("recipe_items")
    .select("recipe_id, ingredient_id, sub_recipe_id, quantity")
    .eq("recipe_id", recipeRow.id)

  if (itemsError) console.error("computeMenuItemCalories: recipe_items error", itemsError)
  const items = (recipeItemRows || []) as RecipeItemRow[]
  if (items.length === 0) return { ok: false, reason: "no-ingredients" }

  const subRecipeIds = Array.from(new Set(items.filter(i => i.sub_recipe_id).map(i => i.sub_recipe_id as string)))
  const [subRecipesRes, subRecipeItemsRes] = subRecipeIds.length > 0
    ? await Promise.all([
        supabase.from("sub_recipes").select("id, yield_qty").in("id", subRecipeIds),
        supabase.from("sub_recipe_items").select("sub_recipe_id, ingredient_id, quantity").in("sub_recipe_id", subRecipeIds),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }]

  const yieldBySubRecipe = new Map((subRecipesRes.data || []).map((s: any) => [s.id, s.yield_qty || 1]))
  const itemsBySubRecipe = new Map<string, SubRecipeItemRow[]>()
  ;(subRecipeItemsRes.data || []).forEach((si: any) => {
    const list = itemsBySubRecipe.get(si.sub_recipe_id) || []
    list.push(si)
    itemsBySubRecipe.set(si.sub_recipe_id, list)
  })

  // ingredient_id -> total qty needed for this recipe
  const totals = new Map<string, number>()
  for (const item of items) {
    if (item.ingredient_id) {
      totals.set(item.ingredient_id, (totals.get(item.ingredient_id) || 0) + item.quantity)
    } else if (item.sub_recipe_id) {
      const yieldQty = yieldBySubRecipe.get(item.sub_recipe_id) || 1
      const multiplier = item.quantity / yieldQty
      for (const si of itemsBySubRecipe.get(item.sub_recipe_id) || []) {
        totals.set(si.ingredient_id, (totals.get(si.ingredient_id) || 0) + si.quantity * multiplier)
      }
    }
  }

  const ingredientIds = Array.from(totals.keys())
  if (ingredientIds.length === 0) return { ok: false, reason: "no-ingredients" }

  const { data: ingredientRows, error: ingError } = await supabase
    .from("ingredients")
    .select("id, name, calories_per_usage_unit")
    .in("id", ingredientIds)

  if (ingError) console.error("computeMenuItemCalories: ingredients error", ingError)
  const calMap = new Map((ingredientRows || []).map((i: any) => [i.id, i.calories_per_usage_unit as number | null]))
  const nameMap = new Map((ingredientRows || []).map((i: any) => [i.id, i.name as string]))

  let totalCalories = 0
  const missingIngredients: string[] = []
  totals.forEach((qty, ingId) => {
    const perUnit = calMap.get(ingId)
    if (perUnit == null) {
      missingIngredients.push(nameMap.get(ingId) || ingId)
      return
    }
    totalCalories += perUnit * qty
  })

  const serves = recipeRow.serves || 1
  return {
    ok: true,
    caloriesPerServing: Math.round(totalCalories / serves),
    missingIngredients,
  }
}
