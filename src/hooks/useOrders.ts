import { useState, useRef, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { OrderStatus } from "@/types/pos"
import type { Order } from "@/types/pos"
import { fetchStampProgram, addStamp } from "@/services/stampCardService"
import { parseDbTimestamp } from "@/lib/utils"

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
    // Only fetch today's orders for the live board
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("outlet_id", OUTLET_ID)
      .gte("created_at", todayStart.toISOString())
      .order("created_at", { ascending: false })
      .limit(500)

    if (error) { console.error("Orders fetch error:", error); return }
    if (data) setOrders(data)
  }, [])

  // ── Realtime subscription ────────────────────────────────────────
  // Was unfiltered — every browser with this POS open received every
  // order change on the entire platform, not just this outlet's. Now
  // scoped both here (so the client doesn't even ask for other outlets'
  // changes) and at the RLS layer (015_tenant_scoped_rls.sql — Realtime
  // won't deliver a row a session's RLS policy wouldn't let it SELECT,
  // so this is defense in depth, not the only thing stopping cross-
  // tenant delivery).
  const subscribeToOrders = useCallback(() => {
    const channel = supabase
      .channel("orders-channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `outlet_id=eq.${OUTLET_ID}` }, (payload) => {
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

  // ── Reject an incoming online/preorder order ─────────────────────
  // POS orders never land in PLACED anymore (they insert straight into
  // PREPARING with a staff-picked prep time — see Index.tsx placeOrder).
  // So every order that reaches PLACED now is online/preorder, surfaced via
  // the incoming-order popup instead of a board column. This does NOT touch
  // Razorpay — if the order was already paid, staff has to issue any refund
  // manually through the Razorpay dashboard; this app doesn't execute
  // payment transactions.
  const rejectOrder = async (orderId: string) => {
    const { data, error } = await supabase
      .from("orders")
      .update({ status: OrderStatus.CANCELLED, cancelled_at: new Date().toISOString() })
      .eq("id", orderId)
      .select()
      .single()

    if (error) { console.error("rejectOrder error:", error); alert("Could not reject order: " + error.message); return }
    if (data) setOrders(prev => prev.map(o => o.id === orderId ? data : o))
  }

  // ── Mark ready + send FCM push to customer ──────────────────────
  const markReady = async (orderId: string) => {
    const { data, error } = await supabase
      .from("orders")
      .update({ status: OrderStatus.READY })
      .eq("id", orderId)
      .select()
      .single()

    if (error) { console.error("markReady error:", error); return }
    if (!data) return

    setOrders(prev => prev.map(o => o.id === orderId ? data : o))

    // ── Send FCM push notification to customer ────────────────────
    // FCM token is stored in orders table when customer scans QR
    // We retrieve the token linked to this order
    try {
      const { data: tokenRow } = await supabase
        .from("fcm_tokens")
        .select("token")
        .eq("order_id", orderId)
        .single()

      const fcmToken = tokenRow?.token

      if (fcmToken && data.token_no) {
        const { error: fnError } = await supabase.functions.invoke("notify-order-ready", {
          body: { fcmToken, tokenNo: data.token_no },
        })
        if (fnError) console.warn("FCM send error (non-fatal):", fnError)
        else console.log("FCM push sent for token #", data.token_no)
      } else {
        console.log("No FCM token found for order — skipping push")
      }
    } catch (err) {
      console.warn("FCM push failed (non-fatal):", err)
    }
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

  // ── Mark an online order's payment as confirmed ──────────────────
  // This is the actual trigger for stamps/points on self-ordered (online)
  // orders — there's no payment gateway in this app, so a staff member
  // confirming payment in person is what stands in for it. The
  // .eq("payment_status", "pending") guard means a double-click (or two
  // staff clicking at once) only fires the reward once: the second update
  // matches zero rows and .single() returns no data, so nothing double-fires.
  const markPaid = async (orderId: string) => {
    const { data, error } = await supabase
      .from("orders")
      .update({ payment_status: "paid" })
      .eq("id", orderId)
      .eq("payment_status", "pending")
      .select()
      .single()

    if (error) { console.error("markPaid error:", error); return }
    if (!data) return // already paid — nothing to do

    setOrders(prev => prev.map(o => o.id === orderId ? data : o))

    if (!data.customer_phone) return

    try {
      const [{ data: loyaltySettings }, stampProgram] = await Promise.all([
        supabase.from("loyalty_settings").select("points_per_100, is_active").eq("outlet_id", data.outlet_id).maybeSingle(),
        fetchStampProgram(data.outlet_id),
      ])

      if (loyaltySettings?.is_active) {
        const pointsEarned = Math.floor((data.total ?? 0) / 100 * (loyaltySettings.points_per_100 ?? 10))
        if (pointsEarned > 0) {
          await supabase.from("loyalty_transactions").insert({
            outlet_id: data.outlet_id,
            customer_phone: data.customer_phone,
            type: "earned",
            points: pointsEarned,
            order_id: data.id,
          }).then(({ error: e }) => { if (e) console.warn("markPaid points log error (non-fatal):", e.message) })
        }
      }

      if (stampProgram?.is_active) {
        await addStamp({
          programId: stampProgram.id,
          customerPhone: data.customer_phone,
          customerName: data.customer_name ?? undefined,
          orderId: data.id,
        })
      }
    } catch (err) {
      console.warn("markPaid loyalty error (non-fatal):", err)
    }
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
    const created = parseDbTimestamp(createdAt).getTime()
    const end = closedAt ? parseDbTimestamp(closedAt).getTime() : Date.now()
    const diff = Math.floor((end - created) / 1000)
    // Cap at 24h to avoid showing crazy numbers for old test orders
    if (diff < 0 || diff > 86400) return "—"
    const minutes = Math.floor(diff / 60)
    const seconds = diff % 60
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }

  // ── Color — only for active orders ───────────────────────────────
  // Was previously using a bare `new Date(createdAt)` — same naive-timestamp
  // bug as getOrderTime used to have (see parseDbTimestamp), which meant this
  // always computed ~330 minutes elapsed (the IST offset) for every order,
  // so every card silently showed the "very overdue" color immediately.
  const getOrderColor = (createdAt: string) => {
    const minutes = (Date.now() - parseDbTimestamp(createdAt).getTime()) / 60000
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
    startPreparing, rejectOrder, markReady, collectOrder, updatePayment, markPaid,
    getOrderTime, getOrderColor,
  }
}
