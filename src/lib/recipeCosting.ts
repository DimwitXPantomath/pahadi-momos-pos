import type { SubRecipeItemInput, RecipeItemInput, SubRecipeWithItems } from '@/types/recipe'

export function calcIngredientCost(purchaseCost: number, quantityPerUnit: number): number {
  if (quantityPerUnit <= 0) return 0
  return purchaseCost / quantityPerUnit
}

export function calcSubRecipeCost(
  items: SubRecipeItemInput[],
  yieldQty: number
): { total_cost: number; cost_per_unit: number } {
  const total_cost = items.reduce(
    (sum, item) => sum + item.cost_per_base_unit * item.quantity_used,
    0
  )
  const cost_per_unit = yieldQty > 0 ? total_cost / yieldQty : 0
  return { total_cost, cost_per_unit }
}

export function calcRecipeCost(items: RecipeItemInput[]): number {
  return items.reduce((sum, item) => {
    if (item.item_type === 'ingredient') {
      return sum + (item.cost_per_base_unit ?? 0) * item.quantity_used
    }
    return sum + (item.sub_recipe_cost_per_unit ?? 0) * item.quantity_used
  }, 0)
}

// Returns true if targetSubRecipeId transitively references itself (cycle detected).
// Pass the full sub_recipes map keyed by id for graph traversal.
export function hasCircularRef(
  targetSubRecipeId: string,
  subRecipes: Record<string, SubRecipeWithItems>
): boolean {
  function reachesTarget(id: string, visited: Set<string>): boolean {
    if (id === targetSubRecipeId) return true
    if (visited.has(id)) return false
    visited.add(id)

    const sr = subRecipes[id]
    if (!sr) return false

    for (const item of sr.items) {
      if (item.sub_recipe_id && reachesTarget(item.sub_recipe_id, visited)) {
        return true
      }
    }
    return false
  }

  const target = subRecipes[targetSubRecipeId]
  if (!target) return false

  for (const item of target.items) {
    if (item.sub_recipe_id && reachesTarget(item.sub_recipe_id, new Set())) {
      return true
    }
  }
  return false
}
