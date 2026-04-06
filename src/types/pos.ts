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