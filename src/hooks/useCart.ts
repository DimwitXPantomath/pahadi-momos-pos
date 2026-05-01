import { useState } from "react"
import type { MenuItem, OrderItem } from "@/types/pos"

export const useCart = () => {
  const [cart, setCart] = useState<OrderItem[]>([])
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "UPI">("CASH")

  // ── Totals ──────────────────────────────────────────────────────
  const subtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const gst = subtotal * 0.05
  const grandTotal = subtotal + gst

  // ── Add to cart (exact copy of existing logic) ───────────────────
  const addToCart = (
    item: MenuItem,
    size?: { label: string; price: number },
    addons: { name: string; price: number }[] = []
  ) => {
    // Normalize addons (stable sort for consistent IDs)
    const sortedAddons = [...addons].sort((a, b) => a.name.localeCompare(b.name))
    const addonPrice = sortedAddons.reduce((sum, a) => sum + a.price, 0)
    const basePrice = size ? size.price : item.price
    const itemPrice = basePrice + addonPrice

    // Stable unique ID per variant
    const itemId = [item.id, size?.label || "base", ...sortedAddons.map(a => a.name)].join("|")

    // Display name with size + addons
    const itemName =
      item.name +
      (size ? ` (${size.label})` : "") +
      (sortedAddons.length ? ` + ${sortedAddons.map(a => a.name).join(", ")}` : "")

    setCart(prev => {
      const existing = prev.find(i => i.id === itemId)
      if (existing) {
        return prev.map(i =>
          i.id === itemId ? { ...i, quantity: i.quantity + 1 } : i
        )
      }
      return [
        ...prev,
        {
          id: itemId,
          name: itemName,
          price: itemPrice,
          quantity: 1,
          baseId: item.id,
          size: size || null,
          addons: sortedAddons,
          station: item.station || "GENERAL",
        },
      ]
    })
  }

  // ── Quantity controls ────────────────────────────────────────────
  const increaseQty = (id: string) => {
    setCart(prev =>
      prev.map(item => item.id === id ? { ...item, quantity: item.quantity + 1 } : item)
    )
  }

  const decreaseQty = (id: string) => {
    setCart(prev =>
      prev
        .map(item => item.id === id ? { ...item, quantity: item.quantity - 1 } : item)
        .filter(item => item.quantity > 0)
    )
  }

  const clearCart = () => setCart([])

  // ── Split by kitchen station ─────────────────────────────────────
  const splitItemsByStation = (items: OrderItem[]) => {
    const map: Record<string, OrderItem[]> = {}
    items.forEach(item => {
      const station = item.station || "GENERAL"
      if (!map[station]) map[station] = []
      map[station].push(item)
    })
    return map
  }

  return {
    cart,
    setCart,
    paymentMethod,
    setPaymentMethod,
    subtotal,
    gst,
    grandTotal,
    addToCart,
    increaseQty,
    decreaseQty,
    clearCart,
    splitItemsByStation,
  }
}
