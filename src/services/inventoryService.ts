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

export const updateStock = async (
  ingredient_id: string,
  qty: number
): Promise<void> => {
  const { data } = await supabase
    .from("ingredients")
    .select("current_stock")
    .eq("id", ingredient_id)
    .single()

  if (!data) return

  await supabase
    .from("ingredients")
    .update({ current_stock: data.current_stock - qty })
    .eq("id", ingredient_id)
}

export const getLowStockIngredients = async () => {
  const { data, error } = await supabase
    .from("ingredients")
    .select("*")

  if (error || !data) return []

  return data.filter(i => i.current_stock < i.min_stock)
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

export const calculateCost = async (
  ingredientsList: { ingredient_id: string; quantity: number }[]
): Promise<number> => {
  let total = 0

  for (const item of ingredientsList) {
    const { data } = await supabase
      .from("ingredient_prices")
      .select("price_per_unit")
      .eq("ingredient_id", item.ingredient_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    if (data) total += data.price_per_unit * item.quantity
  }

  return total
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
  const cost = await calculateCost(ingredients)

  return sellingPrice - cost
}

export const getTotalWastage = async (): Promise<number> => {
  const { data } = await supabase
    .from("sub_recipe_items")
    .select("wastage")

  return data?.reduce((sum, i) => sum + (i.wastage || 0), 0) ?? 0
}

// ── Purchase orders ───────────────────────────────────────────────

export const getBestVendorPrice = async (ingredient_id: string) => {
  const { data } = await supabase
    .from("ingredient_prices")
    .select("*")
    .eq("ingredient_id", ingredient_id)
    .order("price_per_unit", { ascending: true })
    .limit(1)
    .single()

  return data
}

export const suggestPurchaseQty = (ingredient: {
  min_stock: number
  current_stock: number
}): number => {
  const deficit = ingredient.min_stock - ingredient.current_stock
  return deficit > 0 ? deficit * 2 : 0
}

export const generatePurchaseOrder = async (): Promise<void> => {
  const lowStockItems = await getLowStockIngredients()

  if (!lowStockItems.length) {
    alert("No items needed — all stock is sufficient")
    return
  }

  const poItems = []

  for (const ing of lowStockItems) {
    const qty = suggestPurchaseQty(ing)
    const vendor = await getBestVendorPrice(ing.id)
    if (!vendor) continue

    poItems.push({
      ingredient_id: ing.id,
      quantity: qty,
      price: vendor.price_per_unit,
      vendor_name: vendor.vendor_name,
    })
  }

  // Group by vendor
  const grouped: Record<string, typeof poItems> = {}
  poItems.forEach(item => {
    if (!grouped[item.vendor_name]) grouped[item.vendor_name] = []
    grouped[item.vendor_name].push(item)
  })

  // Create one PO per vendor
  for (const vendor in grouped) {
    const items = grouped[vendor]

    const { data: po } = await supabase
      .from("purchase_orders")
      .insert({ vendor_name: vendor, status: "PENDING" })
      .select()
      .single()

    if (!po) continue

    await supabase.from("purchase_order_items").insert(
      items.map(i => ({
        purchase_order_id: po.id,
        ingredient_id: i.ingredient_id,
        quantity: i.quantity,
        price: i.price,
      }))
    )
  }

  alert("Purchase Orders Generated Successfully")
}
