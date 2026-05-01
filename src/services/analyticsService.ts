import type { Order, MenuItem } from "@/types/pos"
import { calculateItemProfit } from "./inventoryService"

// ── Sales analytics ───────────────────────────────────────────────

export const getSalesData = (orders: Order[]) => {
  const daily: Record<string, number> = {}

  orders.forEach(order => {
    const date = new Date(order.created_at).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
    })
    daily[date] = (daily[date] || 0) + order.total
  })

  return Object.entries(daily)
    .slice(-7)
    .map(([date, total]) => ({ date, total }))
}

export const getPaymentData = (orders: Order[]) => {
  const totals = { CASH: 0, CARD: 0, UPI: 0 }
  orders.forEach(order => {
    totals[order.payment_method as keyof typeof totals] += order.total
  })

  return [
    { name: "Cash", value: totals.CASH },
    { name: "Card", value: totals.CARD },
    { name: "UPI", value: totals.UPI },
  ]
}

export const getTopSelling = (orders: Order[]) => {
  const map: Record<string, number> = {}

  orders.forEach(order => {
    order.items?.forEach(item => {
      map[item.name] = (map[item.name] || 0) + item.quantity
    })
  })

  return Object.entries(map).sort((a, b) => b[1] - a[1])
}

export const getItemDemand = (orders: Order[], days = 7) => {
  const map: Record<string, number> = {}
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000

  orders.forEach(order => {
    if (new Date(order.created_at).getTime() < cutoff) return
    order.items?.forEach(item => {
      map[item.name] = (map[item.name] || 0) + item.quantity
    })
  })

  return map
}

export const getDailyPrepSuggestion = (orders: Order[]) => {
  const demand = getItemDemand(orders, 7)
  const daily: Record<string, number> = {}

  Object.entries(demand).forEach(([item, qty]) => {
    daily[item] = Math.ceil(qty / 7)
  })

  return daily
}

// ── Menu engineering (BCG Matrix) ────────────────────────────────

export const classifyMenuItems = async (
  menuItems: MenuItem[],
  orders: Order[]
) => {
  const result = []

  for (const item of menuItems) {
    const sales = orders.reduce((sum, o) => {
      return (
        sum +
        (o.items?.filter(i => i.name === item.name).reduce((s, i) => s + i.quantity, 0) ?? 0)
      )
    }, 0)

    const profit = await calculateItemProfit(item.id, item.price)

    let type = ""
    if (sales > 50 && profit > 50) type = "STAR"
    else if (sales > 50) type = "CASH COW"
    else if (profit > 50) type = "PUZZLE"
    else type = "DOG"

    result.push({ name: item.name, sales, profit, type })
  }

  return result
}

export const getSmartSuggestions = async (
  menuItems: MenuItem[],
  orders: Order[]
): Promise<string[]> => {
  const classified = await classifyMenuItems(menuItems, orders)

  return classified
    .map(item => {
      if (item.type === "DOG") return `❌ Consider removing ${item.name} — low sales and low profit`
      if (item.type === "PUZZLE") return `📢 Promote ${item.name} — high profit but low visibility`
      if (item.type === "CASH_COW") return `💰 Slightly increase price of ${item.name}`
      if (item.type === "STAR") return `🔥 Highlight ${item.name} — your best performer`
      return null
    })
    .filter((s): s is string => Boolean(s))
}

export const suggestPrice = (cost: number, marginPercent: number): number => {
  return cost / (1 - marginPercent / 100)
}
