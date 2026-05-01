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

  // ── Filtered views ───────────────────────────────────────────────
  const placedOrders = orders.filter(o => o.status === OrderStatus.PLACED)
  const preparingOrders = orders.filter(o => o.status === OrderStatus.PREPARING)
  const readyOrders = orders.filter(o => o.status === OrderStatus.READY)
  const collectedOrders = orders.filter(o => o.status === OrderStatus.COLLECTED)

  // ── Fetch all orders ─────────────────────────────────────────────
  const fetchOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("outlet_id", OUTLET_ID)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Orders fetch error:", error)
      return
    }

    if (data) setOrders(data)
  }, [])

  // ── Realtime subscription ────────────────────────────────────────
  const subscribeToOrders = useCallback(() => {
    const channel = supabase
      .channel("orders-channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload) => {
          const newOrder = payload.new as Order

          if (payload.eventType === "INSERT") {
            setOrders(prev => {
              if (prev.some(o => o.id === newOrder.id)) return prev
              return [newOrder, ...prev]
            })
          }

          if (payload.eventType === "UPDATE") {
            setOrders(prev =>
              prev.map(o => o.id === newOrder.id ? newOrder : o)
            )
          }
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  // ── Status updates ───────────────────────────────────────────────
  const startPreparing = async (orderId: string, minutes: number) => {
    const readyAt = new Date(Date.now() + minutes * 60 * 1000).toISOString()

    const { error } = await supabase
      .from("orders")
      .update({ status: OrderStatus.PREPARING, ready_at: readyAt })
      .eq("id", orderId)

    if (!error) {
      setOrders(prev =>
        prev.map(o =>
          o.id === orderId ? { ...o, status: OrderStatus.PREPARING, ready_at: readyAt } : o
        )
      )
    }
  }

  const markReady = async (orderId: string) => {
    const { error } = await supabase
      .from("orders")
      .update({ status: OrderStatus.READY })
      .eq("id", orderId)

    if (!error) {
      setOrders(prev =>
        prev.map(o => o.id === orderId ? { ...o, status: OrderStatus.READY } : o)
      )
    }
  }

  const collectOrder = async (orderId: string) => {
    const { error } = await supabase
      .from("orders")
      .update({ status: OrderStatus.COLLECTED, closed_at: new Date().toISOString() })
      .eq("id", orderId)

    if (!error) {
      setOrders(prev =>
        prev.map(o => o.id === orderId ? { ...o, status: OrderStatus.COLLECTED } : o)
      )
    }
  }

  const updatePayment = async (orderId: string, method: "CASH" | "CARD" | "UPI") => {
    const { error } = await supabase
      .from("orders")
      .update({ payment_method: method })
      .eq("id", orderId)

    if (!error) {
      setOrders(prev =>
        prev.map(o => o.id === orderId ? { ...o, payment_method: method } : o)
      )
    }
  }

  // ── Order time helpers ───────────────────────────────────────────
  const getOrderTime = (createdAt: string) => {
    const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000)
    const minutes = Math.floor(diff / 60)
    const seconds = diff % 60
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }

  const getOrderColor = (createdAt: string) => {
    const minutes = (Date.now() - new Date(createdAt).getTime()) / 60000
    if (minutes < 3) return "#22c55e"
    if (minutes < 6) return "#eab308"
    if (minutes < 10) return "#f97316"
    return "#ef4444"
  }

  return {
    orders,
    setOrders,
    isPlacingOrder,
    setIsPlacingOrder,
    qrOrderId,
    setQrOrderId,
    alertedOrdersRef,
    placedOrders,
    preparingOrders,
    readyOrders,
    collectedOrders,
    fetchOrders,
    subscribeToOrders,
    startPreparing,
    markReady,
    collectOrder,
    updatePayment,
    getOrderTime,
    getOrderColor,
  }
}
