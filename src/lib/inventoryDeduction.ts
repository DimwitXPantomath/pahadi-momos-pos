import type { RecipeWithItems, SubRecipeWithItems } from '@/types/recipe'
import { supabase } from '@/lib/supabase'

// Expand a recipe into a flat list of { ingredient_id, quantity, unit },
// recursively expanding sub-recipes proportionally by quantity_used / yield_quantity.
// Duplicates are merged (quantities summed).
export function expandRecipeToIngredients(
  recipe: RecipeWithItems,
  subRecipes: Record<string, SubRecipeWithItems>
): Array<{ ingredient_id: string; quantity: number; unit: string }> {
  const totals = new Map<string, { quantity: number; unit: string }>()

  function add(ingredientId: string, qty: number, unit: string) {
    const existing = totals.get(ingredientId)
    if (existing) {
      existing.quantity += qty
    } else {
      totals.set(ingredientId, { quantity: qty, unit })
    }
  }

  for (const item of recipe.items) {
    if (item.item_type === 'ingredient' && item.ingredient_id) {
      add(item.ingredient_id, item.quantity_used, item.unit)
    } else if (item.item_type === 'sub_recipe' && item.sub_recipe_id) {
      const sr = subRecipes[item.sub_recipe_id]
      if (sr && sr.yield_quantity > 0) {
        const multiplier = item.quantity_used / sr.yield_quantity
        for (const srItem of sr.items) {
          if (srItem.ingredient_id) {
            add(srItem.ingredient_id, srItem.quantity_used * multiplier, srItem.unit)
          }
        }
      }
    }
  }

  return Array.from(totals.entries()).map(([ingredient_id, { quantity, unit }]) => ({
    ingredient_id,
    quantity,
    unit,
  }))
}

// Deduct quantities from ingredients.current_stock in Supabase.
// Returns per-ingredient results. Uses the passed-in Supabase client
// so it can be tested with a mock client if needed.
export async function deductIngredients(
  deductions: Array<{ ingredient_id: string; quantity: number }>,
  supabaseClient: typeof supabase = supabase
): Promise<Array<{ ingredient_id: string; deducted: number; success: boolean }>> {
  return Promise.all(
    deductions.map(async ({ ingredient_id, quantity }) => {
      const { data: row } = await supabaseClient
        .from('ingredients')
        .select('current_stock')
        .eq('id', ingredient_id)
        .single()

      if (!row) return { ingredient_id, deducted: quantity, success: false }

      const newStock = Math.max(0, (row.current_stock as number) - quantity)
      const { error } = await supabaseClient
        .from('ingredients')
        .update({ current_stock: newStock })
        .eq('id', ingredient_id)

      return { ingredient_id, deducted: quantity, success: !error }
    })
  )
}
