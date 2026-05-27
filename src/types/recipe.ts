// ─── Units ────────────────────────────────────────────────────────────────────

export const BASE_UNITS = ['g', 'ml', 'pcs'] as const
export type BaseUnit = typeof BASE_UNITS[number]

export const PURCHASE_UNITS = [
  'kg', 'litre', 'box', 'pcs', 'tray', 'bottle', 'pack', 'bag', 'crate', 'dozen',
] as const
export type PurchaseUnit = typeof PURCHASE_UNITS[number]

// ─── Ingredient ───────────────────────────────────────────────────────────────

export interface Ingredient {
  id: string
  outlet_id: string
  name: string
  base_unit: BaseUnit
  purchase_unit: string
  quantity_per_unit: number
  purchase_cost: number
  cost_per_base_unit: number        // GENERATED column in DB
  min_stock: number
  current_stock: number
  created_at: string
  updated_at: string
}

export interface IngredientFormData {
  name: string
  base_unit: BaseUnit
  purchase_unit: string
  quantity_per_unit: number | string
  purchase_cost: number | string
  min_stock: number | string
  current_stock: number | string
}

// ─── Sub Recipe ───────────────────────────────────────────────────────────────

export interface SubRecipeItem {
  id: string
  sub_recipe_id: string
  ingredient_id: string
  quantity_used: number
  unit: string
  ingredient_cost: number
  ingredient?: Pick<Ingredient, 'id' | 'name' | 'base_unit' | 'cost_per_base_unit'>
}

export interface SubRecipeItemInput {
  ingredient_id: string
  quantity_used: number
  unit: string
  cost_per_base_unit: number
}

export interface SubRecipe {
  id: string
  outlet_id: string
  name: string
  yield_quantity: number
  yield_unit: string
  total_cost: number
  cost_per_unit: number
  shelf_life_hours: number
  created_at: string
  updated_at: string
}

export interface SubRecipeWithItems extends SubRecipe {
  items: SubRecipeItem[]
}

export interface SubRecipeFormData {
  name: string
  yield_quantity: number | string
  yield_unit: string
  shelf_life_hours: number | string
  items: {
    ingredient_id: string
    quantity_used: number | string
    unit: string
  }[]
}

// ─── Recipe ───────────────────────────────────────────────────────────────────

export type RecipeItemType = 'ingredient' | 'sub_recipe'

export interface RecipeItem {
  id: string
  recipe_id: string
  item_type: RecipeItemType
  ingredient_id?: string | null
  sub_recipe_id?: string | null
  quantity_used: number
  unit: string
  calculated_cost: number
  ingredient?: Pick<Ingredient, 'id' | 'name' | 'base_unit' | 'cost_per_base_unit'>
  sub_recipe?: Pick<SubRecipe, 'id' | 'name' | 'yield_unit' | 'cost_per_unit'>
}

export interface RecipeItemInput {
  item_type: RecipeItemType
  ingredient_id?: string
  sub_recipe_id?: string
  quantity_used: number
  unit: string
  cost_per_base_unit?: number
  sub_recipe_cost_per_unit?: number
}

export interface Recipe {
  id: string
  outlet_id: string
  name: string
  menu_item_id?: string | null
  total_cost: number
  created_at: string
  updated_at: string
}

export interface RecipeWithItems extends Recipe {
  items: RecipeItem[]
}

export interface RecipeFormData {
  name: string
  menu_item_id?: string
  items: {
    item_type: RecipeItemType
    ingredient_id?: string
    sub_recipe_id?: string
    quantity_used: number | string
    unit: string
  }[]
}
