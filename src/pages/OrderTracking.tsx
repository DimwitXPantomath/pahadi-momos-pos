import { useParams } from "react-router-dom"
import { useEffect, useState, useCallback } from "react"
import { supabase } from "@/lib/supabase"

type OrderItem = { name: string; quantity: number; price: number }
type Order = {
  id: string
  order_no: number
  token_no: number
  status: "PLACED" | "PREPARING" | "READY" | "COLLECTED"
  ready_at?: string | null
  items: OrderItem[]
  total: number
}

const STATUS_CONFIG = {
  PLACED:    { label: "Order Received",    emoji: "📋", color: "#6b7280", bg: "#f3f4f6", message: "Your order has been received and will be prepared soon." },
  PREPARING: { label: "Being Prepared",    emoji: "👨‍🍳", color: "#d97706", bg: "#fffbeb", message: "Your order is being prepared. Hang tight!" },
  READY:     { label: "Ready for Pickup!", emoji: "🎉", color: "#16a34a", bg: "#f0fdf4", message: "Your order is ready! Please collect it from the counter." },
  COLLECTED: { label: "Collected",         emoji: "✅", color: "#6b7280", bg: "#f3f4f6", message: "Order collected. Thank you for visiting!" },
}

export default function OrderTracking() {
  const { id } = useParams()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [showReadyBanner, setShowReadyBanner] = useState(false)
  const [prevStatus, setPrevStatus] = useState<string | null>(null)

  const handleStatusChange = useCallback((newOrder: Order) => {
    // Show big banner when order becomes READY
    if (prevStatus && prevStatus !== "READY" && newOrder.status === "READY") {
      setShowReadyBanner(true)
      // Try vibration on mobile
      if (navigator.vibrate) navigator.vibrate([300, 100, 300])
    }
    setPrevStatus(newOrder.status)
    setOrder(newOrder)
  }, [prevStatus])

  useEffect(() => {
    if (!id) { setLoading(false); return }

    supabase.from("orders").select("*").eq("id", id).single().then(({ data, error }) => {
      if (error) console.error("Order fetch error:", error)
      if (data) {
        setOrder(data)
        setPrevStatus(data.status)
      }
      setLoading(false)
    })

    const channel = supabase
      .channel(`order-tracking-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${id}` }, (payload) => {
        handleStatusChange(payload.new as Order)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [id, handleStatusChange])

  if (loading) return (
    <div style={s.centered}>
      <p style={{ fontSize: 32 }}>⏳</p>
      <p style={{ color: "#6b7280", marginTop: 12 }}>Loading your order…</p>
    </div>
  )

  if (!order) return (
    <div style={s.centered}>
      <p style={{ fontSize: 48 }}>😕</p>
      <h2 style={{ margin: "12px 0 8px" }}>Order Not Found</h2>
      <p style={{ color: "#6b7280", textAlign: "center", maxWidth: 280 }}>This link may have expired.</p>
    </div>
  )

  const config = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.PLACED
  const items: OrderItem[] = Array.isArray(order.items) ? order.items : []

  return (
    <div style={s.page}>

      {/* READY BANNER — big popup when order is ready */}
      {showReadyBanner && (
        <div style={s.readyBanner} onClick={() => setShowReadyBanner(false)}>
          <div style={s.readyBannerInner}>
            <p style={{ fontSize: 56, margin: 0 }}>🎉</p>
            <h2 style={{ fontSize: 24, fontWeight: 900, color: "#16a34a", margin: "8px 0 4px" }}>
              Order Ready!
            </h2>
            <p style={{ fontSize: 15, color: "#374151", margin: 0 }}>
              Please collect your order from the counter
            </p>
            <p style={{ fontSize: 16, fontWeight: 800, color: "#16a34a", marginTop: 8 }}>
              Token #{order.token_no}
            </p>
            <button
              onClick={() => setShowReadyBanner(false)}
              style={{ marginTop: 16, padding: "10px 32px", background: "#16a34a", color: "white", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer" }}
            >Got it!</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={s.header}>
        <h1 style={s.headerTitle}>🌿 Praang</h1>
        <p style={s.headerSub}>Order Tracker</p>
      </div>

      {/* Token card */}
      <div style={{ ...s.tokenCard, border: `2px solid ${config.color}` }}>
        <p style={s.tokenLabel}>Your Token</p>
        <p style={{ ...s.tokenNumber, color: config.color }}>#{order.token_no ?? "—"}</p>
      </div>

      {/* Status card */}
      <div style={{ ...s.statusCard, background: config.bg }}>
        <p style={{ fontSize: 40, marginBottom: 8 }}>{config.emoji}</p>
        <p style={{ ...s.statusLabel, color: config.color }}>{config.label}</p>
        <p style={s.statusMessage}>{config.message}</p>
        {order.status === "PREPARING" && order.ready_at && (
          <p style={s.readyTime}>
            ⏱ Estimated ready at <strong>{new Date(order.ready_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong>
          </p>
        )}
      </div>

      {/* Order items */}
      {items.length > 0 && (
        <div style={s.itemsCard}>
          <p style={s.itemsTitle}>Your Order</p>
          {items.map((item, i) => (
            <div key={i} style={s.itemRow}>
              <span>{item.name}</span>
              <span style={{ color: "#6b7280" }}>× {item.quantity}</span>
            </div>
          ))}
          <div style={s.divider} />
          <div style={{ ...s.itemRow, fontWeight: 700 }}>
            <span>Total</span>
            <span>₹{order.total?.toFixed(2) ?? "–"}</span>
          </div>
        </div>
      )}

      {/* Progress steps */}
      <div style={s.stepsRow}>
        {(["PLACED", "PREPARING", "READY", "COLLECTED"] as const).map((step, i) => {
          const stepConfig = STATUS_CONFIG[step]
          const currentIndex = ["PLACED", "PREPARING", "READY", "COLLECTED"].indexOf(order.status)
          const isActive = currentIndex >= i
          return (
            <div key={step} style={s.step}>
              <div style={{ ...s.stepDot, background: isActive ? config.color : "#e5e7eb" }} />
              <p style={{ ...s.stepLabel, color: isActive ? config.color : "#9ca3af", fontWeight: order.status === step ? 700 : 400 }}>
                {stepConfig.emoji}
              </p>
            </div>
          )
        })}
      </div>

      <p style={s.footer}>This page updates automatically — no need to refresh!</p>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 420, margin: "0 auto", padding: "24px 16px 48px", fontFamily: "system-ui, sans-serif" },
  centered: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24, fontFamily: "system-ui, sans-serif" },
  readyBanner: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 24 },
  readyBannerInner: { background: "white", borderRadius: 20, padding: "32px 28px", textAlign: "center", maxWidth: 320, width: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" },
  header: { textAlign: "center", marginBottom: 24 },
  headerTitle: { fontSize: 22, fontWeight: 800, margin: 0 },
  headerSub: { color: "#6b7280", margin: "4px 0 0", fontSize: 14 },
  tokenCard: { borderRadius: 16, padding: "20px 24px", textAlign: "center", marginBottom: 16, background: "white", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" },
  tokenLabel: { margin: 0, fontSize: 13, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 },
  tokenNumber: { margin: "4px 0 0", fontSize: 52, fontWeight: 900, lineHeight: 1 },
  statusCard: { borderRadius: 16, padding: "24px 20px", textAlign: "center", marginBottom: 16 },
  statusLabel: { fontSize: 20, fontWeight: 700, margin: "0 0 8px" },
  statusMessage: { color: "#374151", margin: 0, fontSize: 15, lineHeight: 1.5 },
  readyTime: { marginTop: 12, fontSize: 14, color: "#374151" },
  itemsCard: { background: "white", border: "1px solid #e5e7eb", borderRadius: 16, padding: "16px 20px", marginBottom: 16 },
  itemsTitle: { fontWeight: 700, margin: "0 0 12px", fontSize: 15 },
  itemRow: { display: "flex", justifyContent: "space-between", fontSize: 15, padding: "6px 0" },
  divider: { borderTop: "1px solid #e5e7eb", margin: "8px 0" },
  stepsRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 8px", marginBottom: 16 },
  step: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 },
  stepDot: { width: 12, height: 12, borderRadius: "50%" },
  stepLabel: { fontSize: 20, margin: 0 },
  footer: { textAlign: "center", color: "#9ca3af", fontSize: 13 },
}
