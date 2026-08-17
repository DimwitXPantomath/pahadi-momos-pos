import { useState } from "react"
import type { PrintMode, PaymentMethod } from "./CartPanel"

// Single-screen checkout — everything needed to place an order (service
// type, estimated prep time, payment, print mode) on one popup instead of
// stepping through separate screens, for speed at a busy counter.
//
// Also replaces the old "Placed" holding state: previously an order landed
// as PLACED and a staff member had to remember to come back and tap
// "Start preparing in: 5/10/15 min" on the board, or the order just sat
// there. Now the prep-time estimate is picked here, at order time, and the
// order is inserted directly as PREPARING with ready_at already set — no
// separate step to forget. This only applies to orders placed from the POS
// cart; online/self-order orders still land in PLACED on the board since no
// staff is physically present when those arrive and someone has to notice
// and accept them.

type OrderType = "DINE_IN" | "TAKEAWAY" | "ON_THE_GO"

type Props = {
  isTableService: boolean
  orderType: OrderType
  setOrderType: (v: OrderType) => void
  finalTotal: number
  isPlacingOrder: boolean
  onClose: () => void
  onConfirm: (info: {
    payment: PaymentMethod
    dueAmount?: number
    splitPayments?: Record<string, number>
    printMode: PrintMode
    prepMinutes: number
  }) => void
}

const ORDER_TYPES: { value: OrderType; label: string; icon: string }[] = [
  { value: "DINE_IN", label: "Dine-in", icon: "🍽️" },
  { value: "TAKEAWAY", label: "Take-Away", icon: "🥡" },
  { value: "ON_THE_GO", label: "On the go", icon: "🏃" },
]

const PREP_OPTIONS = [5, 10, 15, 20, 30]

export default function CheckoutFlowModal({
  isTableService, orderType, setOrderType, finalTotal, isPlacingOrder, onClose, onConfirm,
}: Props) {
  const [prepMinutes, setPrepMinutes] = useState(10)
  const [payment, setPayment] = useState<PaymentMethod>("CASH")
  const [dueAmount, setDueAmount] = useState("")
  const [splitAmounts, setSplitAmounts] = useState<Record<string, string>>({ CASH: "", UPI: "", CARD: "" })
  const [printMode, setPrintMode] = useState<PrintMode>("KOT+BILL")

  const splitTotal = Object.values(splitAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const splitValid = payment !== "SPLIT" || Math.abs(splitTotal - finalTotal) < 0.01
  const canConfirm = !isPlacingOrder && (payment !== "SPLIT" || splitValid)

  const handleConfirm = () => {
    if (!canConfirm) return
    onConfirm({
      payment,
      dueAmount: payment === "DUE" ? Number(dueAmount) || finalTotal : undefined,
      splitPayments: payment === "SPLIT"
        ? Object.fromEntries(Object.entries(splitAmounts).filter(([, v]) => parseFloat(v) > 0).map(([k, v]) => [k, parseFloat(v)]))
        : undefined,
      printMode: isTableService ? printMode : "KOT+BILL",
      prepMinutes,
    })
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }} onClick={onClose}>
      <div style={{ background: "white", borderRadius: 16, width: "100%", maxWidth: 400, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 25px 50px rgba(0,0,0,0.3)" }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #e5e7eb", flexShrink: 0 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>Confirm order</p>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#9ca3af" }}>✕</button>
        </div>

        <div style={{ padding: 20, overflowY: "auto" }}>

          {/* Total */}
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>Total due</p>
            <p style={{ margin: "2px 0 0", fontSize: 26, fontWeight: 800, color: "hsl(var(--brand-accent))" }}>₹{finalTotal.toFixed(2)}</p>
          </div>

          {/* Service type */}
          <p style={sectionLabel}>Service type</p>
          <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
            {ORDER_TYPES.map(t => (
              <button key={t.value} onClick={() => setOrderType(t.value)} style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "8px 4px", borderRadius: 8, border: "1.5px solid", cursor: "pointer", fontSize: 11, fontWeight: 600,
                borderColor: orderType === t.value ? "hsl(var(--primary))" : "#e5e7eb",
                background: orderType === t.value ? "hsl(var(--primary))" : "white",
                color: orderType === t.value ? "white" : "#374151",
              }}>
                <span style={{ fontSize: 16 }}>{t.icon}</span>{t.label}
              </button>
            ))}
          </div>

          {/* Estimated prep time */}
          <p style={sectionLabel}>Food ready in</p>
          <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
            {PREP_OPTIONS.map(min => (
              <button key={min} onClick={() => setPrepMinutes(min)} style={{
                flex: "1 1 auto", padding: "8px 0", border: "1.5px solid", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                borderColor: prepMinutes === min ? "hsl(var(--primary))" : "#e5e7eb",
                background: prepMinutes === min ? "hsl(var(--primary))" : "white",
                color: prepMinutes === min ? "white" : "#374151",
              }}>{min} min</button>
            ))}
          </div>

          {/* Payment */}
          <p style={sectionLabel}>Payment</p>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
            {(["CASH", "UPI", "CARD", "DUE", "SPLIT"] as PaymentMethod[]).map(m => (
              <button key={m} onClick={() => {
                setPayment(m)
                if (m === "SPLIT") setSplitAmounts({ CASH: finalTotal.toFixed(0), UPI: "", CARD: "" })
              }} style={{
                flex: "1 1 auto", padding: "8px 0", border: "1.5px solid", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                borderColor: payment === m ? (m === "DUE" ? "#dc2626" : m === "SPLIT" ? "#7c3aed" : "hsl(var(--primary))") : "#e5e7eb",
                background: payment === m ? (m === "DUE" ? "#dc2626" : m === "SPLIT" ? "#7c3aed" : "hsl(var(--primary))") : "white",
                color: payment === m ? "white" : "#374151",
              }}>
                {m === "CASH" ? "💵" : m === "UPI" ? "📱" : m === "CARD" ? "💳" : m === "DUE" ? "📒" : "🔀"} {m}
              </button>
            ))}
          </div>

          {payment === "SPLIT" && (
            <div style={{ background: "#faf5ff", border: "1px solid #ddd6fe", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                {(["CASH", "UPI", "CARD"] as const).map(m => (
                  <div key={m}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", marginBottom: 2 }}>
                      {m === "CASH" ? "💵" : m === "UPI" ? "📱" : "💳"} {m}
                    </div>
                    <input type="number" min="0" placeholder="₹0" value={splitAmounts[m]}
                      onChange={e => setSplitAmounts(prev => ({ ...prev, [m]: e.target.value }))}
                      style={{ width: "100%", padding: "5px 8px", border: `1.5px solid ${splitValid ? "#ddd6fe" : "#fca5a5"}`, borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12 }}>
                <span style={{ color: "#6b7280" }}>Sum: ₹{splitTotal.toFixed(0)}</span>
                {!splitValid && <span style={{ color: "#dc2626", fontWeight: 600 }}>{splitTotal < finalTotal ? `₹${(finalTotal - splitTotal).toFixed(0)} short` : `₹${(splitTotal - finalTotal).toFixed(0)} over`}</span>}
                {splitValid && splitTotal > 0 && <span style={{ color: "#16a34a", fontWeight: 600 }}>✓ Balanced</span>}
              </div>
            </div>
          )}

          {payment === "DUE" && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
              <input type="number" placeholder={`Due amount (default: ₹${finalTotal.toFixed(0)})`} value={dueAmount}
                onChange={e => setDueAmount(e.target.value)}
                style={{ width: "100%", padding: "6px 10px", border: "1.5px solid #fecaca", borderRadius: 6, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
            </div>
          )}

          {/* Print mode — table service only; self-service always does KOT+BILL */}
          {isTableService && (
            <>
              <p style={sectionLabel}>Print</p>
              <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                {(["KOT", "BILL", "KOT+BILL"] as const).map(mode => (
                  <button key={mode} onClick={() => setPrintMode(mode)} style={{
                    flex: 1, padding: "8px 0", border: "1.5px solid", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer",
                    borderColor: printMode === mode ? "hsl(var(--primary))" : "#e5e7eb",
                    background: printMode === mode ? "hsl(var(--primary))" : "white",
                    color: printMode === mode ? "white" : "#374151",
                  }}>{mode}</button>
                ))}
              </div>
            </>
          )}

        </div>

        {/* Confirm */}
        <div style={{ padding: "12px 20px 20px", flexShrink: 0 }}>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            style={{
              width: "100%", padding: "13px", borderRadius: 10, border: "none",
              background: canConfirm ? "hsl(var(--primary))" : "#e5e7eb",
              color: canConfirm ? "white" : "#9ca3af",
              fontSize: 15, fontWeight: 700, cursor: canConfirm ? "pointer" : "not-allowed",
            }}
          >{isPlacingOrder ? "Placing order..." : "Place order"}</button>
        </div>

      </div>
    </div>
  )
}

const sectionLabel: React.CSSProperties = {
  margin: "0 0 6px", fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5,
}
