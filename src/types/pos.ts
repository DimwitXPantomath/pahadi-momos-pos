// ─── Menu ────────────────────────────────────────────────────────────────────

export type MenuSize = {
  label: string
  price: number
}

export type MenuAddon = {
  name: string
  price: number
}

export type MenuItem = {
  id: string
  name: string
  price: number
  category_id: string
  available: boolean
  is_veg: boolean
  created_at?: string
  sizes?: MenuSize[]
  addons?: MenuAddon[]
  station?: "MOMO" | "TANDOOR" | "DRINKS" | "GENERAL"

  // Taste Palette tagging (see 022_ahead_and_taste_palette_schema.sql)
  // — all nullable, no defaults. An untagged dish must never silently
  // read as "safe"; see DishTaggingModal.tsx for how incompleteness
  // is surfaced rather than hidden.
  dietary_type?: "vegetarian" | "non_vegetarian" | "eggetarian" | "vegan" | "jain" | null
  allergens?: string[] | null
  spice_level?: number | null
  estimated_calories?: number | null
  calories_manually_overridden?: boolean
  cooking_type?: string[] | null
  cuisine_category?: string | null
  meal_course_type?: "starter" | "main" | "dessert" | "beverage" | "snack" | null
  flavor_profile?: string[] | null
}

// ─── Cart & Order Items ───────────────────────────────────────────────────────

export type OrderItem = {
  id: string
  name: string
  price: number
  quantity: number
  category?: string
  baseId?: string
  size?: { label: string; price: number } | null
  addons?: { name: string; price: number }[]
  station?: string
}

// CartItem mirrors OrderItem — used before order is placed
export type CartItem = OrderItem

// ─── Orders ──────────────────────────────────────────────────────────────────

export enum OrderStatus {
  PLACED = "PLACED",
  PREPARING = "PREPARING",
  READY = "READY",
  COLLECTED = "COLLECTED",
}

export type Order = {
  id: string

  // identifiers
  order_no: number
  token_no: number
  outlet_id?: string

  // items & totals
  items: OrderItem[]
  subtotal?: number
  gst?: number
  total: number

  // status
  status: OrderStatus

  // timestamps
  created_at: string
  ready_at?: string | null
  closed_at?: string | null

  // payment
  payment_method?: "CASH" | "CARD" | "UPI"

  // online self-order (see supabase/migrations/010_online_ordering_and_loyalty_toggle.sql)
  order_source?: "pos" | "online"
  payment_status?: "pending" | "paid"
  customer_phone?: string | null
  customer_name?: string | null
  table_id?: string | null

  // optional
  tableNumber?: number | null
  rating?: number | null
  loyalty_points_earned?: number
  loyalty_points_used?: number
}

// ─── Outlet ───────────────────────────────────────────────────────────────────

export type OutletInfo = {
  id: string
  name: string
  taxRate: number
  address?: string
  phone?: string
  gst_number?: string
}

// ─── POS Settings ─────────────────────────────────────────────────────────────

export type POSSettings = {
  kdsEnabled: boolean
  delayAlertMinutes: number
  soundAlert: boolean
  autoSortOrders: boolean
  customerDisplayEnabled: boolean
  posMode: "SELF_SERVICE" | "TABLE_SERVICE"
  printers: {
    id: string
    name: string
    role: "BILL" | "KOT" | "BOTH"
  }[]
}

// ─── Ingredients & Stock ──────────────────────────────────────────────────────

export type Ingredient = {
  id: string
  name: string
  unit: string
  current_stock: number
  min_stock: number
}

export type IngredientPrice = {
  id: string
  ingredient_id: string
  vendor_name: string
  price_per_unit: number
}

// ─── Recipes ──────────────────────────────────────────────────────────────────

export type SubRecipe = {
  id: string
  name: string
  yield_qty: number
  unit: string
}

export type SubRecipeItem = {
  id: string
  sub_recipe_id: string
  ingredient_id: string
  quantity: number
  yield_percent?: number
  wastage?: number
}

export type Recipe = {
  id: string
  menu_item_id: string
  name: string
}

export type RecipeItem = {
  id: string
  recipe_id: string
  ingredient_id?: string | null
  sub_recipe_id?: string | null
  quantity: number
  yield_percent?: number
}
