import { supabase } from "@/lib/supabase"

// Real P&L statement (Revenue − COGS − Expenses = Net Profit) plus a set of
// diagnostic checks that explain WHY the number might be wrong — this app
// had no single computed P&L before this; revenue (MISView), food cost
// (analyticsService/inventoryService), and expenses (ExpensesView) were
// three disconnected pieces. Also: while building this, found and fixed a
// real bug in inventoryService.calculateItemProfit — it wasn't dividing a
// recipe's total ingredient cost by recipes.serves, so any recipe yielding
// more than one portion had its cost wildly understated (see that file).

export type PnLIssue = {
  id: string
  severity: "high" | "medium" | "low"
  message: string
}

export type PnLResult = {
  revenue: number
  cogs: number
  cogsUnknownRevenue: number   // revenue from items with no recipe — excluded from COGS, not from revenue
  grossProfit: number
  expenses: number
  netProfit: number
  orderCount: number
  pendingRevenue: number       // online orders not yet marked paid — not counted in `revenue`
  issues: PnLIssue[]
}

type OrderRow = {
  id: string
  total: number
  subtotal: number
  gst: number
  items: { id: string; name: string; price: number; quantity: number }[]
  payment_status: string
  order_source: string
}

type RecipeRow = { id: string; menu_item_id: string; serves: number }
type RecipeItemRow = { recipe_id: string; ingredient_id: string | null; sub_recipe_id: string | null; quantity: number }
type SubRecipeItemRow = { sub_recipe_id: string; ingredient_id: string; quantity: number }

const CORE_RECURRING_CATEGORIES = ["Rent", "Salary", "Electricity"]

export async function computePnL(outletId: string, fromDate: string, toDate: string): Promise<PnLResult> {
  const issues: PnLIssue[] = []

  const [{ data: paidOrders }, { data: pendingOrders }, { data: expenseRows }] = await Promise.all([
    supabase.from("orders").select("id, total, subtotal, gst, items, payment_status, order_source")
      .eq("outlet_id", outletId).eq("payment_status", "paid")
      .gte("created_at", fromDate).lte("created_at", toDate),
    supabase.from("orders").select("id, total")
      .eq("outlet_id", outletId).eq("payment_status", "pending")
      .gte("created_at", fromDate).lte("created_at", toDate),
    supabase.from("expenses").select("category, amount")
      .eq("outlet_id", outletId).gte("expense_date", fromDate).lte("expense_date", toDate),
  ])

  const orders = (paidOrders || []) as OrderRow[]
  const revenue = orders.reduce((s, o) => s + (o.total || 0), 0)
  const pendingRevenue = (pendingOrders || []).reduce((s: number, o: any) => s + (o.total || 0), 0)
  const expenses = (expenseRows || []).reduce((s: number, e: any) => s + (e.amount || 0), 0)

  // ── Data integrity check: does each order's stored total match its own items? ──
  let mismatchCount = 0
  for (const o of orders) {
    const expectedSubtotal = (o.items || []).reduce((s, i) => s + i.price * i.quantity, 0)
    if (Math.abs(expectedSubtotal - (o.subtotal ?? 0)) > 1) mismatchCount++
  }
  if (mismatchCount > 0) {
    issues.push({
      id: "order-total-mismatch",
      severity: "high",
      message: `${mismatchCount} order${mismatchCount > 1 ? "s" : ""} in this period have a stored subtotal that doesn't match the sum of their own line items — worth a manual look, this shouldn't happen under normal use.`,
    })
  }

  // ── Tally quantity sold per menu item across the period ──────────────────
  const qtyByItem = new Map<string, { name: string; qty: number; revenue: number }>()
  orders.forEach(o => {
    ;(o.items || []).forEach(i => {
      const existing = qtyByItem.get(i.id) || { name: i.name, qty: 0, revenue: 0 }
      existing.qty += i.quantity
      existing.revenue += i.price * i.quantity
      qtyByItem.set(i.id, existing)
    })
  })

  const soldItemIds = Array.from(qtyByItem.keys())
  let cogs = 0
  let cogsUnknownRevenue = 0

  if (soldItemIds.length > 0) {
    const { data: recipeRows } = await supabase
      .from("recipes").select("id, menu_item_id, serves").in("menu_item_id", soldItemIds)
    const recipes = (recipeRows || []) as RecipeRow[]
    const recipeByMenuItem = new Map(recipes.map(r => [r.menu_item_id, r]))
    const recipeIds = recipes.map(r => r.id)

    // Explode every relevant recipe's ingredient list once (batched), same
    // approach as purchaseSheetService.ts — reused here rather than
    // duplicated logic with different bugs.
    const costPerServing = new Map<string, number>() // recipe.id -> cost per one serving

    if (recipeIds.length > 0) {
      const { data: recipeItemRows } = await supabase
        .from("recipe_items").select("recipe_id, ingredient_id, sub_recipe_id, quantity").in("recipe_id", recipeIds)
      const items = (recipeItemRows || []) as RecipeItemRow[]

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

      // ingredient_id -> total qty needed, per recipe
      const totalsByRecipe = new Map<string, Map<string, number>>()
      for (const item of items) {
        const totals = totalsByRecipe.get(item.recipe_id) || new Map<string, number>()
        if (item.ingredient_id) {
          totals.set(item.ingredient_id, (totals.get(item.ingredient_id) || 0) + item.quantity)
        } else if (item.sub_recipe_id) {
          const yieldQty = yieldBySubRecipe.get(item.sub_recipe_id) || 1
          const multiplier = item.quantity / yieldQty
          for (const si of itemsBySubRecipe.get(item.sub_recipe_id) || []) {
            totals.set(si.ingredient_id, (totals.get(si.ingredient_id) || 0) + si.quantity * multiplier)
          }
        }
        totalsByRecipe.set(item.recipe_id, totals)
      }

      const allIngredientIds = Array.from(new Set(items.flatMap(i =>
        i.ingredient_id ? [i.ingredient_id] : (itemsBySubRecipe.get(i.sub_recipe_id || "") || []).map(si => si.ingredient_id)
      )))
      const { data: ingredientRows } = allIngredientIds.length > 0
        ? await supabase.from("ingredients").select("id, name, cost_per_usage_unit").in("id", allIngredientIds)
        : { data: [] as any[] }
      const costMap = new Map((ingredientRows || []).map((i: any) => [i.id, i.cost_per_usage_unit || 0]))

      const zeroCostIngredientNames = new Set<string>()
      for (const recipe of recipes) {
        const totals = totalsByRecipe.get(recipe.id) || new Map()
        let batchCost = 0
        totals.forEach((qty, ingId) => {
          const cost = costMap.get(ingId) || 0
          if (cost === 0) {
            const name = (ingredientRows || []).find((i: any) => i.id === ingId)?.name
            if (name) zeroCostIngredientNames.add(name)
          }
          batchCost += cost * qty
        })
        costPerServing.set(recipe.id, batchCost / (recipe.serves || 1))
      }

      if (zeroCostIngredientNames.size > 0) {
        issues.push({
          id: "zero-cost-ingredients",
          severity: "medium",
          message: `${zeroCostIngredientNames.size} ingredient${zeroCostIngredientNames.size > 1 ? "s" : ""} used in items sold this period have ₹0 cost per unit set (${Array.from(zeroCostIngredientNames).slice(0, 5).join(", ")}${zeroCostIngredientNames.size > 5 ? ", …" : ""}) — COGS is understated for every recipe using them. Set a real cost in Ingredients.`,
        })
      }
    }

    // ── Negative-margin check + COGS total ──────────────────────────────
    const negativeMarginItems: string[] = []
    qtyByItem.forEach((sold, menuItemId) => {
      const recipe = recipeByMenuItem.get(menuItemId)
      if (!recipe) {
        cogsUnknownRevenue += sold.revenue
        return
      }
      const perServing = costPerServing.get(recipe.id) || 0
      cogs += perServing * sold.qty
      const avgSellingPrice = sold.qty > 0 ? sold.revenue / sold.qty : 0
      if (avgSellingPrice > 0 && perServing > avgSellingPrice) negativeMarginItems.push(sold.name)
    })

    if (negativeMarginItems.length > 0) {
      issues.push({
        id: "negative-margin-items",
        severity: "high",
        message: `${negativeMarginItems.length} item${negativeMarginItems.length > 1 ? "s" : ""} sold for less than their own ingredient cost this period: ${negativeMarginItems.slice(0, 5).join(", ")}${negativeMarginItems.length > 5 ? ", …" : ""}. Every sale of these loses money before any overhead.`,
      })
    }

    const itemsWithNoRecipe = Array.from(qtyByItem.entries()).filter(([id]) => !recipeByMenuItem.has(id))
    if (itemsWithNoRecipe.length > 0) {
      const revenueAffected = itemsWithNoRecipe.reduce((s, [, v]) => s + v.revenue, 0)
      issues.push({
        id: "items-no-recipe",
        severity: "high",
        message: `${itemsWithNoRecipe.length} menu item${itemsWithNoRecipe.length > 1 ? "s" : ""} sold this period (₹${revenueAffected.toFixed(0)} of revenue) have no recipe linked, so their food cost is entirely excluded from COGS below — not counted as zero, genuinely unknown. Gross profit is overstated by at least their real ingredient cost: ${itemsWithNoRecipe.slice(0, 5).map(([, v]) => v.name).join(", ")}${itemsWithNoRecipe.length > 5 ? ", …" : ""}.`,
      })
    }
  }

  // ── Expense sanity: core recurring categories with nothing logged ────────
  const loggedCategories = new Set((expenseRows || []).map((e: any) => e.category))
  const missingCore = CORE_RECURRING_CATEGORIES.filter(c => !loggedCategories.has(c))
  if (missingCore.length > 0 && orders.length > 0) {
    issues.push({
      id: "missing-core-expenses",
      severity: "low",
      message: `No ${missingCore.join(" / ")} expense logged this period. If that's real (e.g. rent paid outside this window), ignore — otherwise net profit below is overstated because a real cost isn't being counted.`,
    })
  }

  if (pendingRevenue > 0) {
    issues.push({
      id: "pending-revenue-excluded",
      severity: "low",
      message: `₹${pendingRevenue.toFixed(0)} in online orders this period are still payment_status='pending' (customer hasn't paid at the counter yet) — correctly excluded from revenue below. If that number seems too high, check for stale online orders staff forgot to mark paid.`,
    })
  }

  const grossProfit = revenue - cogs
  const netProfit = grossProfit - expenses

  return {
    revenue, cogs, cogsUnknownRevenue, grossProfit, expenses, netProfit,
    orderCount: orders.length, pendingRevenue, issues,
  }
}
