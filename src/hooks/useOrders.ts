import { useState, useRef, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { OrderStatus } from "@/types/pos"
import type { Order } from "@/types/pos"

const OUTLET_ID = "demo-outlet"

export const useOrders = () => {
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
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("outlet_id", OUTLET_ID)
      .order("created_at", { ascending: false })
      .limit(200)

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
    const end = closedAt ? new Date(closedAt).getTime() : Date.now()
    const diff = Math.floor((end - new Date(createdAt).getTime()) / 1000)
    if (diff < 0) return "0:00"
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
