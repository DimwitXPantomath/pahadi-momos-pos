import { useEffect, useRef, useState } from "react"
import type { Order } from "@/types/pos"
import { parseDbTimestamp } from "@/lib/utils"

// Replaces the old "Placed" board column. POS orders never land in PLACED
// anymore (see Index.tsx placeOrder — they insert straight into PREPARING
// with a staff-picked prep time). So every order that reaches PLACED now
// came in on its own, without a staff member standing there: online
// self-order, PRAANG Ahead pre-orders, or a WhatsApp-shared order link.
// Those need a human to actually look at them once — this modal is that
// checkpoint, instead of a passive column someone has to remember to check.
// Accept behaves exactly like a walk-in order once confirmed (straight to
// PREPARING with a chosen prep time). Reject just cancels the order in this
// app — it does not touch Razorpay. If the order was already paid, staff
// has to refund manually; this app never executes a payment/refund itself.

type Props = {
  orders: Order[] // queue, oldest-first
  onAccept: (orderId: string, prepMinutes: number) => void
  onReject: (orderId: string) => void
}

const PREP_OPTIONS = [5, 10, 15, 20, 30]

const SOURCE_LABEL: Record<string, string> = {
  online: "🌐 Online order",
  preorder: "📅 Ahead pre-order",
}

function playAlertChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const notes = [784, 988, 1175]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = freq
      osc.type = "sine"
      gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.4)
      osc.start(ctx.currentTime + i * 0.15)
      osc.stop(ctx.currentTime + i * 0.15 + 0.4)
    })
  } catch { /* audio unavailable — non-fatal */ }
}

export default function IncomingOrderModal({ orders, onAccept, onReject }: Props) {
  const [prepMinutes, setPrepMinutes] = useState(15)
  const [confirmingReject, setConfirmingReject] = useState(false)
  const seenIds = useRef<Set<string>>(new Set())

  const queue = [...orders].sort((a, b) => parseDbTimestamp(a.created_at).getTime() - parseDbTimestamp(b.created_at).getTime())
  const active = queue[0]

  // Chime whenever a genuinely new order enters the queue (not on every
  // re-render, and not for orders already known about on mount).
  useEffect(() => {
    orders.forEach(o => {
      if (!seenIds.current.has(o.id)) {
        seenIds.current.add(o.id)
        if (seenIds.current.size > 1) playAlertChime() // skip the very first paint
      }
    })
  }, [orders])

  useEffect(() => {
    setConfirmingReject(false)
    setPrepMinutes(15)
  }, [active?.id])

  if (!active) return null

  const isPaid = active.payment_status === "paid"

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200, padding: 16 }}>
      <div style={{ background: "white", borderRadius: 16, width: "100%", maxWidth: 400, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 25px 50px rgba(0,0,0,0.35)" }}>

        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 16 }}>🔔 New order</p>
            {queue.length > 1 && (
              <span style={{ fontSize: 11, fontWeight: 700, background: "#fef3c7", color: "#92400e", padding: "3px 8px", borderRadius: 20 }}>
                +{queue.length - 1} more waiting
              </span>
            )}
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280" }}>{SOURCE_LABEL[active.order_source ?? "online"] ?? "🌐 Online order"}</p>
        </div>

        <div style={{ padding: 20, overflowY: "auto" }}>

          {/* Customer */}
          {(active.customer_name || active.customer_phone) && (
            <p style={{ margin: "0 0 10px", fontSize: 13 }}>
              👤 {active.customer_name || "—"}{active.customer_phone ? ` · ${active.customer_phone}` : ""}
            </p>
          )}

          {active.preorder_for && (
            <p style={{ margin: "0 0 10px", fontSize: 13, color: "hsl(var(--brand-accent))", fontWeight: 600 }}>
              📅 Requested for {parseDbTimestamp(active.preorder_for).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </p>
          )}

          {/* Items */}
          <div style={{ background: "#f9fafb", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
            {active.items.map((item, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span>{item.name} <span style={{ color: "#6b7280" }}>×{item.quantity}</span></span>
                <span style={{ fontWeight: 600 }}>₹{(item.price * item.quantity).toFixed(0)}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 800, marginTop: 6, paddingTop: 6, borderTop: "1px dashed #d1d5db" }}>
              <span>Total</span>
              <span style={{ color: "hsl(var(--brand-accent))" }}>₹{active.total.toFixed(2)}</span>
            </div>
          </div>

          <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 600, color: isPaid ? "#16a34a" : "#d97706" }}>
            {isPaid ? "✅ Payment received" : "⏳ Payment pending"}
          </p>

          {!confirmingReject ? (
            <>
              <p style={sectionLabel}>Food ready in</p>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 16 }}>
                {PREP_OPTIONS.map(min => (
                  <button key={min} onClick={() => setPrepMinutes(min)} style={{
                    flex: "1 1 auto", padding: "8px 0", border: "1.5px solid", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    borderColor: prepMinutes === min ? "hsl(var(--primary))" : "#e5e7eb",
                    background: prepMinutes === min ? "hsl(var(--primary))" : "white",
                    color: prepMinutes === min ? "white" : "#374151",
                  }}>{min} min</button>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setConfirmingReject(true)} style={rejectBtn}>Reject</button>
                <button onClick={() => onAccept(active.id, prepMinutes)} style={{ ...acceptBtn, flex: 2 }}>
                  Accept &amp; start preparing
                </button>
              </div>
            </>
          ) : (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 14px" }}>
              <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: "#991b1b" }}>Reject this order?</p>
              {isPaid && (
                <p style={{ margin: "0 0 10px", fontSize: 12, color: "#991b1b" }}>
                  This customer already paid ₹{active.total.toFixed(2)}. Rejecting only cancels the order here — you'll need to issue the refund yourself from the Razorpay dashboard.
                </p>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setConfirmingReject(false)} style={backBtn}>Never mind</button>
                <button onClick={() => onReject(active.id)} style={{ ...rejectBtn, flex: 2, background: "#dc2626", color: "white", borderColor: "#dc2626" }}>
                  Yes, reject
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const sectionLabel: React.CSSProperties = {
  margin: "0 0 6px", fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5,
}

const acceptBtn: React.CSSProperties = {
  padding: "13px", borderRadius: 10, border: "none",
  background: "hsl(var(--primary))", color: "white", fontSize: 14, fontWeight: 700, cursor: "pointer",
}

const rejectBtn: React.CSSProperties = {
  flex: 1, padding: "13px", borderRadius: 10, border: "1.5px solid #dc2626",
  background: "white", color: "#dc2626", fontSize: 14, fontWeight: 700, cursor: "pointer",
}

const backBtn: React.CSSProperties = {
  flex: 1, padding: "13px", borderRadius: 10, border: "1.5px solid #e5e7eb",
  background: "white", color: "#374151", fontSize: 14, fontWeight: 600, cursor: "pointer",
}
