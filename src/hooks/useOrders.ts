import { useState, useRef, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { OrderStatus } from "@/types/pos"
import type { Order } from "@/types/pos"

// outletId passed as parameter from component

export const useOrders = (outletId: string = "demo-outlet") => {
  const [orders, setOrders] = useState<Order[]>([])
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [qrOrderId, setQrOrderId] = useState<string | null>(null)
  const alertedOrdersRef = useRef<Set<string>>(new Set())

  const placedOrders = orders.filter(o => o.status === OrderStatus.PLACED)
  const preparingOrders = orders.filter(o => o.status === OrderStatus.PREPARING)
  const readyOrders = orders.filter(o => o.status === OrderStatus.READY)
  const collectedOrders = orders.filter(o => o.status === OrderStatus.COLLECTED)

  // ── Fetch orders ─────────────────────────────────────────────────
  const fetchOrders = useCallback(async () => {
    // Only fetch today's orders for the live board
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("outlet_id", outletId)
      .gte("created_at", todayStart.toISOString())
      .order("created_at", { ascending: false })
      .limit(500)

    if (error) { console.error("Orders fetch error:", error); return }
    if (data) setOrders(data)
  }, [])

  // ── Realtime subscription ────────────────────────────────────────
  const subscribeToOrders = useCallback(() => {
    const channel = supabase
      .channel("orders-channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) => {
        const newOrder = payload.new as Order
        if (payload.eventType === "INSERT") {
          setOrders(prev => prev.some(o => o.id === newOrder.id) ? prev : [newOrder, ...prev])
        }
        if (payload.eventType === "UPDATE") {
          setOrders(prev => prev.map(o => o.id === newOrder.id ? newOrder : o))
        }
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  // ── Start preparing — saves to Supabase ──────────────────────────
  const startPreparing = async (orderId: string, minutes: number) => {
    const readyAt = new Date(Date.now() + minutes * 60 * 1000).toISOString()
    console.log("startPreparing:", orderId, minutes, "readyAt:", readyAt)

    const { data, error } = await supabase
      .from("orders")
      .update({ status: OrderStatus.PREPARING, ready_at: readyAt })
      .eq("id", orderId)
      .select()
      .single()

    if (error) {
      console.error("startPreparing error:", error)
      alert("Could not update order: " + error.message)
      return
    }

    if (data) {
      setOrders(prev => prev.map(o => o.id === orderId ? data : o))
    }
  }

  // ── Mark ready ───────────────────────────────────────────────────
  const markReady = async (orderId: string) => {
    const { data, error } = await supabase
      .from("orders")
      .update({ status: OrderStatus.READY })
      .eq("id", orderId)
      .select()
      .single()

    if (error) { console.error("markReady error:", error); return }
    if (data) setOrders(prev => prev.map(o => o.id === orderId ? data : o))
  }

  // ── Collect order ────────────────────────────────────────────────
  const collectOrder = async (orderId: string) => {
    const closedAt = new Date().toISOString()
    const { data, error } = await supabase
      .from("orders")
      .update({ status: OrderStatus.COLLECTED, closed_at: closedAt })
      .eq("id", orderId)
      .select()
      .single()

    if (error) { console.error("collectOrder error:", error); return }
    if (data) setOrders(prev => prev.map(o => o.id === orderId ? data : o))
  }

  // ── Update payment ───────────────────────────────────────────────
  const updatePayment = async (orderId: string, method: "CASH" | "CARD" | "UPI") => {
    const { data, error } = await supabase
      .from("orders")
      .update({ payment_method: method })
      .eq("id", orderId)
      .select()
      .single()

    if (error) { console.error("updatePayment error:", error); return }
    if (data) setOrders(prev => prev.map(o => o.id === orderId ? data : o))
  }

  // ── Timer — stops when collected ─────────────────────────────────
  const getOrderTime = (createdAt: string, closedAt?: string | null) => {
    const created = new Date(createdAt).getTime()
    const end = closedAt ? new Date(closedAt).getTime() : Date.now()
    const diff = Math.floor((end - created) / 1000)
    // Cap at 24h to avoid showing crazy numbers for old test orders
    if (diff < 0 || diff > 86400) return "—"
    const minutes = Math.floor(diff / 60)
    const seconds = diff % 60
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }

  // ── Color — only for active orders ───────────────────────────────
  const getOrderColor = (createdAt: string) => {
    const minutes = (Date.now() - new Date(createdAt).getTime()) / 60000
    if (minutes < 3) return "#22c55e"
    if (minutes < 6) return "#eab308"
    if (minutes < 10) return "#f97316"
    return "#ef4444"
  }

  return {
    orders, setOrders,
    isPlacingOrder, setIsPlacingOrder,
    qrOrderId, setQrOrderId,
    alertedOrdersRef,
    placedOrders, preparingOrders, readyOrders, collectedOrders,
    fetchOrders, subscribeToOrders,
    startPreparing, markReady, collectOrder, updatePayment,
    getOrderTime, getOrderColor,
  }
}
