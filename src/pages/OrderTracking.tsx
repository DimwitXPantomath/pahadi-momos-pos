import { useParams } from "react-router-dom"
import { useEffect, useState, useCallback, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { requestFCMPermission } from "@/hooks/useFCM"

type OrderItem = { name: string; quantity: number; price: number }
type Order = {
  id: string
  order_no: number
  token_no: number
  status: "PLACED" | "PREPARING" | "READY" | "COLLECTED"
  ready_at?: string | null
  created_at: string
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
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>("default")
  const prevStatusRef = useRef<string | null>(null)

  // ── Request notification permission ───────────────────────────────
  // Register service worker on mount
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(console.error)
    }
    // FCM for background push when phone is locked — pass order id so token is linked
    // id comes from useParams, will be available by the time this runs
    if (id) requestFCMPermission(id)
    if ("Notification" in window) {
      setNotifPermission(Notification.permission)
    }
  }, [])

  const requestNotification = async () => {
    if (!("Notification" in window)) {
      alert("Your browser doesn't support notifications. Keep this page open.")
      return
    }

    const permission = await Notification.requestPermission()
    setNotifPermission(permission)

    if (permission === "granted") {
      // Show test notification immediately so user confirms it works
      new Notification("✅ Notifications On!", {
        body: "You'll be notified when your order is ready",
        icon: "/favicon.ico",
        tag: "praang-test",
      })
    }
  }

  const notifyReady = useCallback((tokenNo: number) => {
    // Vibrate
    if (navigator.vibrate) navigator.vibrate([500, 100, 500, 100, 500])
    // Sound
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      ;[784, 1047, 1319].forEach((freq, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.frequency.value = freq; osc.type = "sine"
        gain.gain.setValueAtTime(0.4, ctx.currentTime + i * 0.2)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.2 + 0.5)
        osc.start(ctx.currentTime + i * 0.2); osc.stop(ctx.currentTime + i * 0.2 + 0.5)
      })
    } catch(e) {}

    // Push notification — works when phone is locked if SW registered
    if (Notification.permission === "granted") {
      // Try via service worker first (works when locked)
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(reg => {
          reg.showNotification("🎉 Your Order is Ready!", {
            body: `Token #${tokenNo} — Please collect from the counter`,
            icon: "/favicon.ico",
            requireInteraction: true,
            vibrate: [400, 100, 400],
            tag: "order-ready",
          } as NotificationOptions)
        })
      } else {
        // Fallback — direct notification
        new Notification("🎉 Your Order is Ready!", {
          body: `Token #${tokenNo} — Please collect from the counter`,
          icon: "/favicon.ico",
          requireInteraction: true,
          tag: "order-ready",
        })
      }
    }

    // Show in-app banner
    setShowReadyBanner(true)
  }, [])

  // ── Handle status change ──────────────────────────────────────────
  const handleStatusChange = useCallback((newOrder: Order) => {
    const wasReady = prevStatusRef.current !== "READY" && newOrder.status === "READY"
    prevStatusRef.current = newOrder.status
    setOrder(newOrder)
    if (wasReady) notifyReady(newOrder.token_no)
  }, [notifyReady])

  // ── Fetch order + subscribe ───────────────────────────────────────
  useEffect(() => {
    if (!id) { setLoading(false); return }

    // Check existing notification permission
    if ("Notification" in window) {
      setNotifPermission(Notification.permission)
    }

    supabase.from("orders").select("*").eq("id", id).single().then(({ data }) => {
      if (data) {
        setOrder(data)
        prevStatusRef.current = data.status
        // If already ready when page loads, show banner
        if (data.status === "READY") setShowReadyBanner(true)
      }
      setLoading(false)
    })

    const channel = supabase
      .channel(`order-tracking-${id}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${id}`
      }, (payload) => handleStatusChange(payload.new as Order))
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
      <h2>Order Not Found</h2>
      <p style={{ color: "#6b7280", textAlign: "center", maxWidth: 280 }}>This link may have expired.</p>
    </div>
  )

  const config = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.PLACED
  const items: OrderItem[] = Array.isArray(order.items) ? order.items : []

  return (
    <div style={s.page}>

      {/* READY BANNER — full screen popup */}
      {showReadyBanner && (
        <div style={s.overlay} onClick={() => setShowReadyBanner(false)}>
          <div style={s.banner} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 64, margin: 0 }}>🎉</p>
            <h2 style={{ fontSize: 26, fontWeight: 900, color: "#16a34a", margin: "8px 0 6px" }}>Order Ready!</h2>
            <p style={{ fontSize: 15, color: "#374151", margin: "0 0 8px" }}>Please collect from the counter</p>
            <p style={{ fontSize: 20, fontWeight: 800, color: "#16a34a" }}>Token #{order.token_no}</p>
            <button
              onClick={() => setShowReadyBanner(false)}
              style={{ marginTop: 20, padding: "12px 40px", background: "#16a34a", color: "white", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: "pointer" }}
            >Got it! ✓</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>🌿 Praang</h1>
        <p style={{ color: "#6b7280", margin: "4px 0 0", fontSize: 14 }}>Order Tracker</p>
      </div>

      {/* Token */}
      <div style={{ ...s.card, border: `2px solid ${config.color}`, textAlign: "center", marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 }}>Your Token</p>
        <p style={{ margin: "4px 0 0", fontSize: 56, fontWeight: 900, color: config.color, lineHeight: 1 }}>
          #{order.token_no ?? "—"}
        </p>
        {order.created_at && (
          <p style={{ fontSize: 12, color: "#9ca3af", margin: "6px 0 0" }}>
            📅 {new Date(order.created_at).toLocaleString("en-IN", { day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit", hour12:true })}
          </p>
        )}
      </div>

      {/* Status */}
      <div style={{ ...s.card, background: config.bg, border: "none", textAlign: "center", marginBottom: 16 }}>
        <p style={{ fontSize: 40, marginBottom: 8 }}>{config.emoji}</p>
        <p style={{ fontSize: 20, fontWeight: 700, color: config.color, margin: "0 0 8px" }}>{config.label}</p>
        <p style={{ color: "#374151", margin: 0, fontSize: 15, lineHeight: 1.5 }}>{config.message}</p>
        {order.status === "PREPARING" && order.ready_at && (
          <p style={{ marginTop: 12, fontSize: 14, color: "#374151" }}>
            ⏱ Estimated ready at <strong>{new Date(order.ready_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong>
          </p>
        )}
      </div>

      {/* Notification button */}
      {order.status !== "COLLECTED" && (
        <div style={{ marginBottom: 16 }}>
          {notifPermission === "granted" ? (
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#16a34a", display: "flex", alignItems: "center", gap: 8 }}>
              <span>🔔</span> Notifications enabled — we'll alert you when ready
            </div>
          ) : notifPermission === "denied" ? (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#dc2626" }}>
              🔕 Notifications blocked. Keep this page open to track your order.
            </div>
          ) : (
            <button
              onClick={requestNotification}
              style={{ width: "100%", padding: "14px", background: "#1d4ed8", color: "white", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              <span>🔔</span> Tap to get notified when ready
            </button>
          )}
        </div>
      )}

      {/* Order items */}
      {items.length > 0 && (
        <div style={{ ...s.card, marginBottom: 16 }}>
          <p style={{ fontWeight: 700, margin: "0 0 12px", fontSize: 15 }}>Your Order</p>
          {items.map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 15, padding: "6px 0" }}>
              <span>{item.name}</span>
              <span style={{ color: "#6b7280" }}>× {item.quantity}</span>
            </div>
          ))}
          <div style={{ borderTop: "1px solid #e5e7eb", margin: "8px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 700 }}>
            <span>Total</span>
            <span>₹{order.total?.toFixed(2) ?? "–"}</span>
          </div>
        </div>
      )}

      {/* Progress steps */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 8px", marginBottom: 16 }}>
        {(["PLACED", "PREPARING", "READY", "COLLECTED"] as const).map((step, i) => {
          const stepConfig = STATUS_CONFIG[step]
          const currentIndex = ["PLACED", "PREPARING", "READY", "COLLECTED"].indexOf(order.status)
          const isActive = currentIndex >= i
          return (
            <div key={step} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: isActive ? config.color : "#e5e7eb" }} />
              <p style={{ fontSize: 20, margin: 0, color: isActive ? config.color : "#9ca3af" }}>{stepConfig.emoji}</p>
            </div>
          )
        })}
      </div>

      <p style={{ textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
        This page updates automatically — no need to refresh!
      </p>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 420, margin: "0 auto", padding: "24px 16px 48px", fontFamily: "system-ui, sans-serif" },
  centered: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24, fontFamily: "system-ui, sans-serif" },
  card: { background: "white", borderRadius: 16, padding: "16px 20px", border: "1px solid #e5e7eb" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 24 },
  banner: { background: "white", borderRadius: 24, padding: "36px 28px", textAlign: "center", maxWidth: 320, width: "100%", boxShadow: "0 12px 48px rgba(0,0,0,0.25)" },
}
