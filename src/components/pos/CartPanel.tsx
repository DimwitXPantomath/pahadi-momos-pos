import { useState } from "react"
import type { OrderItem } from "@/types/pos"

export type PrintMode = "KOT" | "BILL" | "KOT+BILL"
export type PaymentMethod = "CASH" | "CARD" | "UPI" | "DUE"

type DiscountType = "percent" | "fixed"

type Props = {
  cart: OrderItem[]
  subtotal: number
  gst: number
  grandTotal: number
  paymentMethod: "CASH" | "CARD" | "UPI"
  setPaymentMethod: (v: "CASH" | "CARD" | "UPI") => void
  increaseQty: (id: string) => void
  decreaseQty: (id: string) => void
  isPlacingOrder: boolean
  onPlaceOrder: (opts?: { discount: number; discountType: DiscountType; cartNotes: Record<string, string>; orderNotes: string; payment: PaymentMethod; dueAmount?: number }) => void
  posMode: "SELF_SERVICE" | "TABLE_SERVICE"
  selectedTable: string | null
  orderType: "DINE_IN" | "TAKEAWAY"
  setOrderType: (v: "DINE_IN" | "TAKEAWAY") => void
  orderNotes: string
  setOrderNotes: (v: string) => void
  printMode?: PrintMode
  setPrintMode?: (v: PrintMode) => void
}

export default function CartPanel({
  cart, subtotal, gst, grandTotal,
  paymentMethod, setPaymentMethod,
  increaseQty, decreaseQty,
  isPlacingOrder, onPlaceOrder,
  posMode, selectedTable,
  orderType, setOrderType,
  orderNotes, setOrderNotes,
  printMode = "KOT+BILL",
  setPrintMode,
}: Props) {

  const isTableService = posMode === "TABLE_SERVICE"

  // ── Discount state ────────────────────────────────────────────────
  const [discountType, setDiscountType] = useState<DiscountType>("percent")
  const [discountValue, setDiscountValue] = useState<string>("")
  const [showDiscount, setShowDiscount] = useState(false)

  // ── Per-item notes ────────────────────────────────────────────────
  const [cartNotes, setCartNotes] = useState<Record<string, string>>({})
  const [expandedItem, setExpandedItem] = useState<string | null>(null)

  // ── Credit/Due state ──────────────────────────────────────────────
  const [payment, setPayment] = useState<PaymentMethod>(paymentMethod as PaymentMethod)
  const [customerPhone, setCustomerPhone] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [dueAmount, setDueAmount] = useState<string>("")

  // ── Discount calculation ──────────────────────────────────────────
  const discountNum = Number(discountValue) || 0
  const discountAmount = discountType === "percent"
    ? (grandTotal * discountNum) / 100
    : Math.min(discountNum, grandTotal)
  const finalTotal = Math.max(0, grandTotal - discountAmount)

  const canPlace = !isPlacingOrder && cart.length > 0 && (!isTableService || !!selectedTable)
  const btnLabel = isPlacingOrder
    ? "Placing order..."
    : isTableService && !selectedTable
      ? "Select a table first"
      : "Place order"

  const handlePlaceOrder = () => {
    onPlaceOrder({
      discount: discountAmount,
      discountType,
      cartNotes,
      orderNotes,
      payment,
      dueAmount: payment === "DUE" ? Number(dueAmount) || finalTotal : undefined,
      customerPhone: payment === "DUE" ? customerPhone : undefined,
      customerName: payment === "DUE" ? customerName : undefined,
    })
  }

  return (
    <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 12, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>🛒 Your order</p>
          {cart.length > 0 && (
            <span style={{ background: "#111", color: "white", borderRadius: 20, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>
              {cart.reduce((s, i) => s + i.quantity, 0)} items
            </span>
          )}
        </div>
        {isTableService && selectedTable && <p style={{ fontSize: 12, color: "#f97316", margin: "2px 0 0", fontWeight: 600 }}>Table {selectedTable}</p>}
        {isTableService && !selectedTable && <p style={{ fontSize: 12, color: "#dc2626", margin: "2px 0 0" }}>Please select a table first</p>}
      </div>

      {/* Dine-in / Takeaway */}
      {isTableService && (
        <div style={{ display: "flex", gap: 4, padding: "10px 16px 0", flexShrink: 0 }}>
          {(["DINE_IN", "TAKEAWAY"] as const).map(t => (
            <button key={t} onClick={() => setOrderType(t)} style={{
              flex: 1, padding: "6px", borderRadius: 8, border: "1.5px solid", fontSize: 12, fontWeight: 600, cursor: "pointer",
              borderColor: orderType === t ? "#111" : "#e5e7eb",
              background: orderType === t ? "#111" : "white",
              color: orderType === t ? "white" : "#374151",
            }}>{t === "DINE_IN" ? "Dine-in" : "Takeaway"}</button>
          ))}
        </div>
      )}

      {/* Cart items — scrollable */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 16px" }}>
        {cart.length === 0 ? (
          <div style={{ textAlign: "center", paddingTop: 48, color: "#9ca3af" }}>
            <p style={{ fontSize: 36, marginBottom: 8 }}>🛒</p>
            <p style={{ fontSize: 13, fontWeight: 600 }}>Cart is empty</p>
            <p style={{ fontSize: 12, marginTop: 4 }}>Tap items to add them</p>
          </div>
        ) : cart.map(i => (
          <div key={i.id} style={{ paddingBottom: 8, marginBottom: 8, borderBottom: "1px solid #f3f4f6" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.name}</p>
                <p style={{ fontSize: 11, color: "#6b7280", margin: "2px 0 0" }}>₹{i.price} × {i.quantity}</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                <button onClick={() => decreaseQty(i.id)} style={qtyBtn("#f3f4f6", "#111")}>−</button>
                <span style={{ fontSize: 13, fontWeight: 700, minWidth: 18, textAlign: "center" }}>{i.quantity}</span>
                <button onClick={() => increaseQty(i.id)} style={qtyBtn("#111", "white")}>+</button>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, minWidth: 44, textAlign: "right" }}>₹{(i.price * i.quantity).toFixed(0)}</span>
              {/* Note toggle */}
              <button
                onClick={() => setExpandedItem(expandedItem === i.id ? null : i.id)}
                title="Add note"
                style={{ background: cartNotes[i.id] ? "#fffbeb" : "#f3f4f6", border: "1px solid", borderColor: cartNotes[i.id] ? "#fbbf24" : "#e5e7eb", borderRadius: 6, padding: "2px 6px", fontSize: 11, cursor: "pointer", flexShrink: 0 }}
              >📝</button>
            </div>
            {/* Per-item note input */}
            {expandedItem === i.id && (
              <input
                placeholder="Note for this item..."
                value={cartNotes[i.id] || ""}
                onChange={e => setCartNotes(prev => ({ ...prev, [i.id]: e.target.value }))}
                autoFocus
                style={{ width: "100%", marginTop: 6, padding: "5px 8px", border: "1.5px solid #fbbf24", borderRadius: 6, fontSize: 12, outline: "none", boxSizing: "border-box" }}
              />
            )}
            {/* Show note if exists and not expanded */}
            {cartNotes[i.id] && expandedItem !== i.id && (
              <p style={{ fontSize: 11, color: "#d97706", margin: "4px 0 0" }}>📝 {cartNotes[i.id]}</p>
            )}
          </div>
        ))}
      </div>

      {/* Bill summary + actions */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid #e5e7eb", flexShrink: 0, background: "#fafafa" }}>

        {/* Cart-level notes */}
        <textarea
          placeholder="Order notes / special instructions..."
          value={orderNotes}
          onChange={e => setOrderNotes(e.target.value)}
          rows={1}
          style={{ width: "100%", padding: "6px 10px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 12, resize: "none", marginBottom: 8, fontFamily: "system-ui", color: "#111", background: "white", boxSizing: "border-box" }}
        />

        {/* Discount section */}
        <div style={{ marginBottom: 8 }}>
          <button
            onClick={() => setShowDiscount(!showDiscount)}
            style={{ fontSize: 12, color: "#6b7280", background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 4 }}
          >
            {showDiscount ? "▾" : "▸"} {discountAmount > 0 ? `Discount: ₹${discountAmount.toFixed(0)}` : "Add discount"}
          </button>
          {showDiscount && (
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <button onClick={() => setDiscountType("percent")} style={{ ...pillBtn, borderColor: discountType === "percent" ? "#111" : "#e5e7eb", background: discountType === "percent" ? "#111" : "white", color: discountType === "percent" ? "white" : "#374151" }}>%</button>
              <button onClick={() => setDiscountType("fixed")} style={{ ...pillBtn, borderColor: discountType === "fixed" ? "#111" : "#e5e7eb", background: discountType === "fixed" ? "#111" : "white", color: discountType === "fixed" ? "white" : "#374151" }}>₹</button>
              <input
                type="number"
                placeholder={discountType === "percent" ? "e.g. 10" : "e.g. 50"}
                value={discountValue}
                onChange={e => setDiscountValue(e.target.value)}
                style={{ flex: 1, padding: "5px 8px", border: "1.5px solid #e5e7eb", borderRadius: 6, fontSize: 13, outline: "none" }}
              />
            </div>
          )}
        </div>

        {/* Totals */}
        <div style={{ marginBottom: 10 }}>
          <div style={rowStyle}>
            <span style={{ fontSize: 12, color: "#6b7280" }}>Subtotal</span>
            <span style={{ fontSize: 12, color: "#6b7280" }}>₹{(subtotal || 0).toFixed(2)}</span>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 12, color: "#6b7280" }}>GST (5%)</span>
            <span style={{ fontSize: 12, color: "#6b7280" }}>₹{(gst || 0).toFixed(2)}</span>
          </div>
          {discountAmount > 0 && (
            <div style={rowStyle}>
              <span style={{ fontSize: 12, color: "#16a34a" }}>Discount {discountType === "percent" ? `(${discountValue}%)` : ""}</span>
              <span style={{ fontSize: 12, color: "#16a34a" }}>− ₹{discountAmount.toFixed(2)}</span>
            </div>
          )}
          <div style={{ ...rowStyle, marginTop: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 800 }}>Total</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: "#f97316" }}>₹{finalTotal.toFixed(2)}</span>
          </div>
        </div>

        {/* Payment method — includes DUE */}
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          {(["CASH", "UPI", "CARD", "DUE"] as PaymentMethod[]).map(m => (
            <button
              key={m}
              onClick={() => { setPayment(m); if (m !== "DUE") setPaymentMethod(m as "CASH" | "CARD" | "UPI") }}
              style={{
                flex: 1, padding: "5px 0", border: "1.5px solid", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                borderColor: payment === m ? (m === "DUE" ? "#dc2626" : "#111") : "#e5e7eb",
                background: payment === m ? (m === "DUE" ? "#dc2626" : "#111") : "white",
                color: payment === m ? "white" : "#374151",
              }}
            >
              {m === "CASH" ? "💵" : m === "UPI" ? "📱" : m === "CARD" ? "💳" : "📒"} {m}
            </button>
          ))}
        </div>

        {/* Due/Credit fields */}
        {payment === "DUE" && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "#dc2626", margin: "0 0 8px" }}>📒 Credit Sale — Customer Details</p>
            <input
              type="tel"
              placeholder="Phone number *"
              value={customerPhone}
              onChange={e => setCustomerPhone(e.target.value)}
              style={{ width: "100%", padding: "6px 10px", border: "1.5px solid #fecaca", borderRadius: 6, fontSize: 12, outline: "none", marginBottom: 6, boxSizing: "border-box" }}
            />
            <input
              placeholder="Customer name"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              style={{ width: "100%", padding: "6px 10px", border: "1.5px solid #fecaca", borderRadius: 6, fontSize: 12, outline: "none", marginBottom: 6, boxSizing: "border-box" }}
            />
            <input
              type="number"
              placeholder={`Due amount (default: ₹${finalTotal.toFixed(0)})`}
              value={dueAmount}
              onChange={e => setDueAmount(e.target.value)}
              style={{ width: "100%", padding: "6px 10px", border: "1.5px solid #fecaca", borderRadius: 6, fontSize: 12, outline: "none", boxSizing: "border-box" }}
            />
            <p style={{ fontSize: 10, color: "#9ca3af", margin: "4px 0 0" }}>Leave amount empty to mark full amount as due</p>
          </div>
        )}

        {/* Print mode */}
        <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
          {(["KOT", "BILL", "KOT+BILL"] as const).map(mode => (
            <button key={mode} onClick={() => setPrintMode?.(mode)} style={{
              flex: 1, padding: "5px 0", border: "1.5px solid", borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: "pointer", transition: "all .15s",
              borderColor: printMode === mode ? "#111" : "#e5e7eb",
              background: printMode === mode ? "#111" : "white",
              color: printMode === mode ? "white" : "#374151",
            }}>{mode}</button>
          ))}
        </div>

        {/* Place Order */}
        <button
          onClick={handlePlaceOrder}
          disabled={!canPlace}
          style={{
            width: "100%", padding: "13px", borderRadius: 10, border: "none",
            background: canPlace ? "#111" : "#e5e7eb",
            color: canPlace ? "white" : "#9ca3af",
            fontSize: 15, fontWeight: 700,
            cursor: canPlace ? "pointer" : "not-allowed",
            transition: "background 0.15s",
          }}
        >{btnLabel}</button>
      </div>
    </div>
  )
}

const qtyBtn = (bg: string, color: string): React.CSSProperties => ({
  width: 24, height: 24, borderRadius: 5, border: "1px solid #e5e7eb",
  background: bg, color, cursor: "pointer", fontSize: 15,
  display: "flex", alignItems: "center", justifyContent: "center",
  fontWeight: 700, lineHeight: 1,
})

const rowStyle: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3,
}

const pillBtn: React.CSSProperties = {
  padding: "5px 10px", border: "1.5px solid", borderRadius: 6,
  fontSize: 12, fontWeight: 700, cursor: "pointer",
}
