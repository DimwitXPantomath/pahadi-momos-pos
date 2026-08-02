import { supabase } from "@/lib/supabase"

// ── Ingredients ───────────────────────────────────────────────────

export const fetchIngredients = async () => {
  const { data, error } = await supabase
    .from("ingredients")
    .select("*")
    .order("name", { ascending: true })

  if (error) {
    console.error("Fetch ingredients error:", error)
    return []
  }

  return data ?? []
}

export const addIngredient = async (name: string, unit: string) => {
  const { data, error } = await supabase
    .from("ingredients")
    .insert({ name, unit })
    .select()
    .single()

  if (error) {
    console.error("Add ingredient error:", error)
    return null
  }

  return data
}

// FIXED: this used to write to ingredients.current_stock, a legacy column
// migration 007 stopped maintaining once inventory_stock became the real
// source of truth for on-hand quantity (it's what IngredientsView's bulk
// stock tab, ProcurementView's receive flow, and purchaseSheetService.ts
// all read). Writing to the old column meant this call was silently
// updating a number nothing else ever looked at again — order placement's
// "deduct stock" step has likely been a no-op against real inventory since
// migration 007. Now upserts the same table everything else uses.
export const updateStock = async (
  ingredient_id: string,
  qty: number
): Promise<void> => {
  const { data } = await supabase
    .from("inventory_stock")
    .select("current_quantity")
    .eq("ingredient_id", ingredient_id)
    .maybeSingle()

  await supabase
    .from("inventory_stock")
    .upsert({ ingredient_id, current_quantity: (data?.current_quantity ?? 0) - qty })
}

// FIXED: was reading ingredients.current_stock/min_stock — same stale
// columns as updateStock above. Now reads inventory_stock.current_quantity
// against ingredients.min_stock_level, matching purchaseSheetService.ts.
export const getLowStockIngredients = async () => {
  const [{ data: ingredients, error }, { data: stock }] = await Promise.all([
    supabase.from("ingredients").select("id, name, min_stock_level"),
    supabase.from("inventory_stock").select("ingredient_id, current_quantity"),
  ])

  if (error || !ingredients) return []

  const stockMap = new Map((stock || []).map(s => [s.ingredient_id, s.current_quantity || 0]))
  return ingredients
    .map(i => ({ ...i, current_stock: stockMap.get(i.id) || 0, min_stock: i.min_stock_level || 0 }))
    .filter(i => i.current_stock < i.min_stock)
}

// ── Sub recipes ───────────────────────────────────────────────────

export const fetchSubRecipes = async () => {
  const { data, error } = await supabase
    .from("sub_recipes")
    .select("*")
    .order("name", { ascending: true })

  if (error) {
    console.error("Fetch sub recipes error:", error)
    return []
  }

  return data ?? []
}

export const addSubRecipe = async (name: string) => {
  const { data, error } = await supabase
    .from("sub_recipes")
    .insert({ name })
    .select()
    .single()

  if (error) {
    console.error("Add sub recipe error:", error)
    return null
  }

  return data
}

export const addSubRecipeItem = async (item: {
  sub_recipe_id: string
  ingredient_id: string
  quantity: number
  yield_percent?: number
}) => {
  const { data, error } = await supabase
    .from("sub_recipe_items")
    .insert(item)
    .select()
    .single()

  if (error) {
    console.error("Add sub recipe item error:", error)
    return null
  }

  return data
}

// ── Recipes ───────────────────────────────────────────────────────

export const fetchRecipes = async () => {
  const { data, error } = await supabase
    .from("recipes")
    .select("*")

  if (error) {
    console.error("Fetch recipes error:", error)
    return []
  }

  return data ?? []
}

export const addRecipe = async (menuItemId: string, name: string) => {
  const { data, error } = await supabase
    .from("recipes")
    .insert({ menu_item_id: menuItemId, name })
    .select()
    .single()

  if (error) {
    console.error("Add recipe error:", error)
    return null
  }

  return data
}

export const addRecipeItem = async (item: {
  recipe_id: string
  ingredient_id?: string
  sub_recipe_id?: string
  quantity: number
  yield_percent?: number
}) => {
  const { data, error } = await supabase
    .from("recipe_items")
    .insert(item)
    .select()
    .single()

  if (error) {
    console.error("Add recipe item error:", error)
    return null
  }

  return data
}

// ── Recipe expansion (for stock deduction) ────────────────────────

export const expandSubRecipe = async (
  subRecipeId: string,
  multiplier: number
): Promise<{ ingredient_id: string; quantity: number }[]> => {
  const { data } = await supabase
    .from("sub_recipe_items")
    .select("*")
    .eq("sub_recipe_id", subRecipeId)

  if (!data) return []

  return data.map(item => ({
    ingredient_id: item.ingredient_id,
    quantity:
      item.quantity *
      (item.yield_percent ? item.yield_percent / 100 : 1) *
      multiplier,
  }))
}

export const expandRecipe = async (
  recipeId: string
): Promise<{ ingredient_id: string; quantity: number }[]> => {
  const { data } = await supabase
    .from("recipe_items")
    .select("*")
    .eq("recipe_id", recipeId)

  if (!data) return []

  let finalIngredients: { ingredient_id: string; quantity: number }[] = []

  for (const item of data) {
    if (item.ingredient_id) {
      finalIngredients.push({
        ingredient_id: item.ingredient_id,
        quantity: item.quantity * (item.yield_percent ? item.yield_percent / 100 : 1),
      })
    }

    if (item.sub_recipe_id) {
      const subItems = await expandSubRecipe(item.sub_recipe_id, item.quantity)
      finalIngredients.push(...subItems)
    }
  }

  return finalIngredients
}

// ── Cost calculation ──────────────────────────────────────────────

// FIXED: was querying `ingredient_prices`, a table that has never existed
// in this schema (confirmed via full-repo migration grep) — this silently
// returned 0 for every call, meaning calculateItemProfit() below (used by
// analyticsService.ts for the profit-per-item report) has been overstating
// profit by the full cost of ingredients, always. Ingredient cost already
// lives on the ingredients row itself (cost_per_usage_unit) — no separate
// price-history table needed for a current-cost estimate.
export const calculateCost = async (
  ingredientsList: { ingredient_id: string; quantity: number }[]
): Promise<number> => {
  if (ingredientsList.length === 0) return 0
  const ids = ingredientsList.map(i => i.ingredient_id)
  const { data } = await supabase.from("ingredients").select("id, cost_per_usage_unit").in("id", ids)
  const costMap = new Map((data || []).map(i => [i.id, i.cost_per_usage_unit || 0]))
  return ingredientsList.reduce((total, item) => total + (costMap.get(item.ingredient_id) || 0) * item.quantity, 0)
}

export const calculateItemProfit = async (
  menuItemId: string,
  sellingPrice: number
): Promise<number> => {
  const { data: recipe } = await supabase
    .from("recipes")
    .select("*")
    .eq("menu_item_id", menuItemId)
    .single()

  if (!recipe) return 0

  const ingredients = await expandRecipe(recipe.id)
  const batchCost = await calculateCost(ingredients)
  // FIXED: expandRecipe()/calculateCost() return the cost of the WHOLE
  // recipe batch (recipes.serves portions), not one sold unit — this was
  // being subtracted from a single item's selling price directly, wildly
  // understating cost (and overstating profit) for any recipe with
  // serves > 1. Divide down to a per-serving cost before comparing.
  const costPerServing = batchCost / (recipe.serves || 1)

  return sellingPrice - costPerServing
}

export const getTotalWastage = async (): Promise<number> => {
  const { data } = await supabase
    .from("sub_recipe_items")
    .select("wastage")

  return data?.reduce((sum, i) => sum + (i.wastage || 0), 0) ?? 0
}

// REMOVED: getBestVendorPrice, suggestPurchaseQty, and generatePurchaseOrder
// used to live here, querying `ingredient_prices` and `purchase_orders` /
// `purchase_order_items` — none of which exist anywhere in this schema
// (confirmed via full-repo migration grep). They were unreachable dead code
// (nothing outside this file imported them; Index.tsx has its own,
// differently-implemented `generatePurchaseOrder` local function, unrelated
// to this one). If a "reorder from best vendor" feature is wanted, build it
// against vendor_item_prices (the real pricing table — see ProcurementView.tsx
// and purchaseSheetService.ts for the live pattern) rather than restoring this.
