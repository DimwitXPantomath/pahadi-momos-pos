import { supabase } from "@/lib/supabase"

// Deliberately NOT reusing expandRecipe() from inventoryService.ts — that
// helper does per-item recursive round-trips and (more importantly) some of
// its sibling functions in the same file reference tables that don't exist
// in this schema (ingredient_prices, purchase_orders/purchase_order_items)
// and ingredients.current_stock, a legacy column IngredientsView stopped
// writing to after migration 007 introduced inventory_stock as the real
// source of truth. Rebuilt here against the live schema, batched.

export type IngredientNeed = {
  ingredient_id: string
  name: string
  usage_unit: string
  needed: number
  onHand: number
  shortfall: number
  cost_per_usage_unit: number
}

type RecipeItemRow = { recipe_id: string; ingredient_id: string | null; sub_recipe_id: string | null; quantity: number }
type SubRecipeItemRow = { sub_recipe_id: string; ingredient_id: string; quantity: number }

export async function buildPurchaseSheet(
  plannedRecipes: { recipeId: string; batches: number }[]
): Promise<IngredientNeed[]> {
  const active = plannedRecipes.filter(p => p.batches > 0)
  if (active.length === 0) return []

  const recipeIds = active.map(p => p.recipeId)
  const batchByRecipe = new Map(active.map(p => [p.recipeId, p.batches]))

  const { data: recipeItemRows } = await supabase
    .from("recipe_items")
    .select("recipe_id, ingredient_id, sub_recipe_id, quantity")
    .in("recipe_id", recipeIds)

  const items = (recipeItemRows || []) as RecipeItemRow[]

  // recipe_items can point at a raw ingredient OR a sub_recipe (never both —
  // enforced by recipe_items_exactly_one). Sub-recipe lines need one more
  // hop: scale the sub-recipe's own ingredient list by (qty used / sub-recipe yield).
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

  const totals = new Map<string, number>()

  for (const item of items) {
    const batches = batchByRecipe.get(item.recipe_id) || 0
    if (batches <= 0) continue

    if (item.ingredient_id) {
      const qty = item.quantity * batches
      totals.set(item.ingredient_id, (totals.get(item.ingredient_id) || 0) + qty)
    } else if (item.sub_recipe_id) {
      const yieldQty = yieldBySubRecipe.get(item.sub_recipe_id) || 1
      const multiplier = (item.quantity * batches) / yieldQty
      const subItems = itemsBySubRecipe.get(item.sub_recipe_id) || []
      for (const si of subItems) {
        const qty = si.quantity * multiplier
        totals.set(si.ingredient_id, (totals.get(si.ingredient_id) || 0) + qty)
      }
    }
  }

  const ingredientIds = Array.from(totals.keys())
  if (ingredientIds.length === 0) return []

  const [ingredientsRes, stockRes] = await Promise.all([
    supabase.from("ingredients").select("id, name, usage_unit, cost_per_usage_unit").in("id", ingredientIds),
    supabase.from("inventory_stock").select("ingredient_id, current_quantity").in("ingredient_id", ingredientIds),
  ])

  const stockMap = new Map((stockRes.data || []).map((s: any) => [s.ingredient_id, s.current_quantity || 0]))

  return (ingredientsRes.data || [])
    .map((ing: any) => {
      const needed = totals.get(ing.id) || 0
      const onHand = stockMap.get(ing.id) || 0
      return {
        ingredient_id: ing.id,
        name: ing.name,
        usage_unit: ing.usage_unit || "",
        needed: Math.round(needed * 100) / 100,
        onHand: Math.round(onHand * 100) / 100,
        shortfall: Math.max(0, Math.round((needed - onHand) * 100) / 100),
        cost_per_usage_unit: ing.cost_per_usage_unit || 0,
      } as IngredientNeed
    })
    .sort((a, b) => b.shortfall - a.shortfall)
}

// Pushes the shortfall list into the existing Procurement workflow as a
// draft request — same tables/columns ProcurementView already reads
// (procurement_requests, procurement_items with ingredient_id/requested_qty).
export async function createDraftProcurementFromSheet(
  outletId: string,
  needs: IngredientNeed[]
): Promise<{ requestId: string } | null> {
  const toBuy = needs.filter(n => n.shortfall > 0)
  if (toBuy.length === 0) return null

  const { data: request, error: reqErr } = await supabase
    .from("procurement_requests")
    .insert({ outlet_id: outletId, status: "draft", note: `Auto-generated from purchase sheet — ${new Date().toLocaleDateString("en-IN")}` })
    .select()
    .single()

  if (reqErr || !request) {
    console.error("Create procurement request error:", reqErr)
    return null
  }

  const { error: itemsErr } = await supabase.from("procurement_items").insert(
    toBuy.map(n => ({
      request_id: request.id,
      ingredient_id: n.ingredient_id,
      requested_qty: n.shortfall,
      status: "pending",
    }))
  )

  if (itemsErr) {
    console.error("Create procurement items error:", itemsErr)
    return null
  }

  return { requestId: request.id }
}
