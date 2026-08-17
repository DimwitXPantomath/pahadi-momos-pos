import { useState } from "react"
import type { MenuItem, OrderItem } from "@/types/pos"

export const useCart = () => {
  const [cart, setCart] = useState<OrderItem[]>([])
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "UPI">("CASH")

  // ── Totals ──────────────────────────────────────────────────────
  // Mixed tax-inclusive/exclusive cart: each line's `price` may already
  // include GST (price_includes_tax, copied from the menu item at
  // add-to-cart time) or may not (the old, still-default behavior). A flat
  // `subtotal * 0.05` can't handle a mix, so GST is computed per line and
  // summed. GST rate is a flat 5% everywhere in this codebase, not
  // per-item or configurable.
  const GST_RATE = 0.05
  const lineBreakdown = cart.map(i => {
    const lineTotal = i.price * i.quantity
    if (i.price_includes_tax) {
      const base = lineTotal / (1 + GST_RATE)
      return { base, tax: lineTotal - base }
    }
    return { base: lineTotal, tax: lineTotal * GST_RATE }
  })
  const subtotal = lineBreakdown.reduce((sum, l) => sum + l.base, 0)
  const gst = lineBreakdown.reduce((sum, l) => sum + l.tax, 0)
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
          price_includes_tax: item.price_includes_tax ?? false,
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
