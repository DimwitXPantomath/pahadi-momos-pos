export const categories = [
  "All",
  "Coffee",
  "Tea",
  "Pastries",
  "Food",
  "Beverages",
];

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

export type OrderItem = {
  id: string
  name: string
  price: number
  quantity: number
  category?: string;

  baseId?: string
  size?: { label: string; price: number } | null
  addons?: { name: string; price: number }[]

  station?: string
}

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  category?: string;
  size?: string
};

export type OutletInfo = {
  id: string;
  name: string;
  taxRate: number;
  address?: string;
  phone?: string;
};



export enum OrderStatus {
  PLACED = "PLACED",
  PREPARING = "PREPARING",
  READY = "READY",
  COLLECTED = "COLLECTED",
}

export type Order = {
  id: string

  // core identifiers
  order_no: number
  token_no: number
  outlet_id?: string   // optional (safe for now)

  // order data
  items: OrderItem[]
  total: number
  status: OrderStatus

  // timestamps
  created_at: string
  ready_at?: string | null

  // optional business fields
  payment_method?: "CASH" | "CARD" | "UPI"
  tableNumber?: number | null
  rating?: number | null
}

export type POSSettings = {
  kdsEnabled: boolean
  delayAlertMinutes: number
  soundAlert: boolean
  autoSortOrders: boolean
  printers: {
    id: string
    name: string
    role: "BILL" | "KOT" | "BOTH"
  }[]

  customerDisplayEnabled: boolean   // ✅ your new feature
}

export type MenuItem = {
  id: string;
  name: string;
  price: number;
  category_id: string;
  available: boolean;
  created_at?: string;
  is_veg: boolean;
  sizes?: MenuSize[]
  addons?: MenuAddon[]
  station?: "MOMO" | "TANDOOR" | "DRINKS" | "GENERAL"
};

export type MenuItemSize = {
  label: string
  price: number
}

export type MenuSize = {
  label: string
  price: number
}

export type MenuAddon = {
  name: string
  price: number
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
