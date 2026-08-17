import { supabase } from "@/lib/supabase"
import { OrderStatus } from "@/types/pos"
import type { Order, OrderItem } from "@/types/pos"
import { printKOT } from "@/utils/printKOT"
import { printReceipt } from "@/utils/printReceipt"

// Outlet ID — reads from profile stored in localStorage (set on login)
const getOutletId = (): string => {
  try {
    const profile = JSON.parse(localStorage.getItem("praang_profile") || "{}")
    return profile?.outlet_id ?? "demo-outlet"
  } catch {
    return "demo-outlet"
  }
}

// ── Place a new order ─────────────────────────────────────────────
export const placeOrder = async ({
  cart,
  subtotal,
  gst,
  grandTotal,
  paymentMethod,
  orders,
  tableId,
  orderType,
  orderNotes,
  splitItemsByStation,
  expandRecipe,
  updateStock,
}: {
  cart: OrderItem[]
  subtotal: number
  gst: number
  grandTotal: number
  paymentMethod: "CASH" | "CARD" | "UPI"
  orders: Order[]
  tableId?: string | null
  orderType?: "DINE_IN" | "TAKEAWAY" | "ON_THE_GO"
  orderNotes?: string
  splitItemsByStation: (items: OrderItem[]) => Record<string, OrderItem[]>
  expandRecipe: (recipeId: string) => Promise<any[]>
  updateStock: (ingredientId: string, qty: number) => Promise<void>
}) => {
  if (cart.length === 0) throw new Error("Cart is empty")

  const payload = {
    outlet_id: getOutletId(),
    token_no: orders.length + 101,
    items: cart,
    subtotal,
    gst,
    total: grandTotal,
    status: OrderStatus.PLACED,
    payment_method: paymentMethod,
    loyalty_points_earned: Math.floor(grandTotal / 100),
    loyalty_points_used: 0,
    created_at: new Date().toISOString(),
    // Table service fields
    ...(tableId ? { table_id: tableId } : {}),
    ...(orderType ? { order_type: orderType } : {}),
    ...(orderNotes ? { notes: orderNotes } : {}),
  }

  const { data, error } = await supabase
    .from("orders")
    .insert(payload)
    .select()
    .single()

  if (error) throw new Error(error.message)

  // Insert order items
  const orderItemsPayload = cart.map(item => ({
    order_id: data.id,
    outlet_id: getOutletId(),
    item_id: item.id,
    quantity: item.quantity,
  }))

  const { error: itemError } = await supabase
    .from("order_items")
    .insert(orderItemsPayload)

  if (itemError) console.error("Order items error:", itemError)

  // Print KOT per station
  const stationMap = splitItemsByStation(cart)
  Object.entries(stationMap).forEach(([station, items]) => {
    printKOT({ order: data, items, station })
  })

  // Deduct stock
  for (const item of cart) {
    const { data: recipe } = await supabase
      .from("recipes")
      .select("*")
      .eq("menu_item_id", item.baseId || item.id)
      .single()

    if (!recipe) continue

    const ingredientsList = await expandRecipe(recipe.id)

    const finalList = ingredientsList.map(i => ({
      ...i,
      quantity: i.quantity * item.quantity,
    }))

    for (const ing of finalList) {
      await updateStock(ing.ingredient_id, ing.quantity)
    }
  }

  // Print receipt
  printReceipt(data)

  return data
}

// ── Fetch all orders ──────────────────────────────────────────────
export const fetchOrders = async (): Promise<Order[]> => {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("outlet_id", getOutletId())
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Fetch orders error:", error)
    return []
  }

  return data ?? []
}

// ── Update order status ───────────────────────────────────────────
export const updateOrderStatus = async (
  orderId: string,
  status: OrderStatus,
  extra?: Record<string, any>
) => {
  const { data, error } = await supabase
    .from("orders")
    .update({ status, ...extra })
    .eq("id", orderId)
    .select()
    .single()

  if (error) {
    console.error("Update status error:", error)
    return null
  }

  return data
}

// ── Update payment method ─────────────────────────────────────────
export const updateOrderPayment = async (
  orderId: string,
  method: "CASH" | "CARD" | "UPI"
) => {
  const { data, error } = await supabase
    .from("orders")
    .update({ payment_method: method })
    .eq("id", orderId)
    .select()
    .single()

  if (error) {
    console.error("Update payment error:", error)
    return null
  }

  return data
}

// ── Fetch most ordered items ──────────────────────────────────────
export const fetchMostOrderedItems = async () => {
  const { data, error } = await supabase
    .from("order_items")
    .select("item_id, quantity")
    .eq("outlet_id", getOutletId())

  if (error) {
    console.error("Most ordered fetch error:", error)
    return {}
  }

  const counts: Record<string, number> = {}
  data?.forEach(row => {
    counts[row.item_id] = (counts[row.item_id] || 0) + row.quantity
  })

  return counts
}
