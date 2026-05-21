import { useState } from "react"
import type { OrderItem } from "@/types/pos"

export type PrintMode = "KOT" | "BILL" | "KOT+BILL"
export type PaymentMethod = "CASH" | "CARD" | "UPI" | "DUE" | "SPLIT"

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
  onPlaceOrder: (opts?: {
    discount?: number; discountType?: string
    cartNotes?: Record<string, string>; orderNotes?: string
    payment?: string; dueAmount?: number
    customerName?: string; customerPhone?: string
    splitPayments?: Record<string, number>
  }) => void
  posMode: "SELF_SERVICE" | "TABLE_SERVICE"
  selectedTable: string | null
  orderType: "DINE_IN" | "TAKEAWAY"
  setOrderType: (v: "DINE_IN" | "TAKEAWAY") => void
  orderNotes: string
  setOrderNotes: (v: string) => void
  printMode?: PrintMode
  setPrintMode?: (v: PrintMode) => void
  existingCustomers?: { phone: string; name: string }[]
}

export default function CartPanel({
  cart, subtotal, gst, grandTotal,
  paymentMethod, setPaymentMethod,
  increaseQty, decreaseQty,
  isPlacingOrder, onPlaceOrder,
  posMode, selectedTable,
  orderType, setOrderType,
  orderNotes, setOrderNotes,
  printMode = "KOT+BILL", setPrintMode,
  existingCustomers = [],
}: Props) {

  const isTableService = posMode === "TABLE_SERVICE"

  // ── Customer details ──────────────────────────────────────────────
  const [customerPhone, setCustomerPhone] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [phoneMatches, setPhoneMatches] = useState<typeof existingCustomers>([])

  const handlePhoneChange = (val: string) => {
    setCustomerPhone(val)
    if (val.length >= 3) {
      const matches = existingCustomers.filter(c => c.phone.includes(val))
      setPhoneMatches(matches.slice(0, 3))
    } else {
      setPhoneMatches([])
    }
  }

  const selectCustomer = (c: { phone: string; name: string }) => {
    setCustomerPhone(c.phone)
    setCustomerName(c.name)
    setPhoneMatches([])
  }

  // ── Discount ──────────────────────────────────────────────────────
  const [discountType, setDiscountType] = useState<DiscountType>("percent")
  const [discountValue, setDiscountValue] = useState("")
  const [showDiscount, setShowDiscount] = useState(false)

  // ── Per-item notes ────────────────────────────────────────────────
  const [cartNotes, setCartNotes] = useState<Record<string, string>>({})
  const [expandedItem, setExpandedItem] = useState<string | null>(null)

  // ── Payment ───────────────────────────────────────────────────────
  const [payment, setPayment] = useState<PaymentMethod>("CASH")
  const [dueAmount, setDueAmount] = useState("")
  // Split payment amounts
  const [splitCash, setSplitCash] = useState("")
  const [splitUPI, setSplitUPI] = useState("")
  const [splitCard, setSplitCard] = useState("")

  // ── Totals ────────────────────────────────────────────────────────
  const discountNum = Number(discountValue) || 0
  const discountAmount = discountType === "percent"
    ? (grandTotal * discountNum) / 100
    : Math.min(discountNum, grandTotal)
  const finalTotal = Math.max(0, grandTotal - discountAmount)

  const splitTotal = (Number(splitCash) || 0) + (Number(splitUPI) || 0) + (Number(splitCard) || 0)
  const splitRemaining = finalTotal - splitTotal

  const canPlace = !isPlacingOrder && cart.length > 0 && (!isTableService || !!selectedTable)
  const btnLabel = isPlacingOrder ? "Placing order..."
    : isTableService && !selectedTable ? "Select a table first"
    : "Place order"

  const handlePlaceOrder = () => {
    if (payment === "DUE") {
      if (!customerName.trim()) { alert("Customer name required for credit sale"); return }
      if (!customerPhone.trim()) { alert("Customer phone required for credit sale"); return }
    }
    onPlaceOrder({
      discount: discountAmount, discountType,
      cartNotes, orderNotes, payment,
      dueAmount: payment === "DUE" ? (Number(dueAmount) || finalTotal) : undefined,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      splitPayments: payment === "SPLIT" ? {
        CASH: Number(splitCash) || 0,
        UPI: Number(splitUPI) || 0,
        CARD: Number(splitCard) || 0,
      } : undefined,
    })
    if (payment === "DUE") { setCustomerName(""); setCustomerPhone(""); setDueAmount("") }
    if (payment === "SPLIT") { setSplitCash(""); setSplitUPI(""); setSplitCard("") }
  }

  const PAY_METHODS: { value: PaymentMethod; label: string }[] = [
    { value: "CASH", label: "💵 Cash" },
    { value: "CARD", label: "💳 Card" },
    { value: "UPI", label: "📱 UPI" },
    { value: "DUE", label: "📒 Due" },
    { value: "SPLIT", label: "✂️ Split" },
  ]

  return (
    <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 12, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* ── Customer details — top of cart ── */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #f3f4f6", background: "#fafafa", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ flex: 1, position: "relative" }}>
            <input
              placeholder="📱 Phone"
              value={customerPhone}
              onChange={e => handlePhoneChange(e.target.value)}
              style={{ width: "100%", padding: "5px 8px", border: "1.5px solid #e5e7eb", borderRadius: 6, fontSize: 12, outline: "none", boxSizing: "border-box" as const }}
            />
            {phoneMatches.length > 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "white", border: "1px solid #e5e7eb", borderRadius: 6, zIndex: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                {phoneMatches.map(c => (
                  <div key={c.phone} onClick={() => selectCustomer(c)} style={{ padding: "6px 10px", fontSize: 12, cursor: "pointer", borderBottom: "1px solid #f3f4f6" }}>
                    📱 {c.phone} — {c.name}
                  </div>
                ))}
              </div>
            )}
          </div>
          <input
            placeholder="👤 Name"
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            style={{ flex: 1, padding: "5px 8px", border: "1.5px solid #e5e7eb", borderRadius: 6, fontSize: 12, outline: "none", boxSizing: "border-box" as const }}
          />
        </div>
      </div>

      {/* ── Header ── */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #e5e7eb", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>🛒 Your order</p>
          {cart.length > 0 && (
            <span style={{ background: "#111", color: "white", borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
              {cart.reduce((s, i) => s + i.quantity, 0)} items
            </span>
          )}
        </div>
        {isTableService && selectedTable && <p style={{ fontSize: 11, color: "#f97316", margin: "2px 0 0", fontWeight: 600 }}>Table {selectedTable}</p>}
        {isTableService && !selectedTable && <p style={{ fontSize: 11, color: "#dc2626", margin: "2px 0 0" }}>Select a table first</p>}
      </div>

      {/* Dine-in / Takeaway */}
      {isTableService && (
        <div style={{ display: "flex", gap: 4, padding: "8px 14px 0", flexShrink: 0 }}>
          {(["DINE_IN", "TAKEAWAY"] as const).map(t => (
            <button key={t} onClick={() => setOrderType(t)} style={{ flex: 1, padding: "5px", borderRadius: 6, border: "1.5px solid", fontSize: 11, fontWeight: 600, cursor: "pointer", borderColor: orderType === t ? "#111" : "#e5e7eb", background: orderType === t ? "#111" : "white", color: orderType === t ? "white" : "#374151" }}>
              {t === "DINE_IN" ? "Dine-in" : "Takeaway"}
            </button>
          ))}
        </div>
      )}

      {/* ── Cart items ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 14px" }}>
        {cart.length === 0 ? (
          <div style={{ textAlign: "center", paddingTop: 32, color: "#9ca3af" }}>
            <p style={{ fontSize: 28, marginBottom: 6 }}>🛒</p>
            <p style={{ fontSize: 12, fontWeight: 600 }}>Cart is empty</p>
          </div>
        ) : cart.map(i => (
          <div key={i.id} style={{ paddingBottom: 6, marginBottom: 6, borderBottom: "1px solid #f3f4f6" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 600, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.name}</p>
                <p style={{ fontSize: 11, color: "#6b7280", margin: "1px 0 0" }}>₹{i.price} × {i.quantity}</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <button onClick={() => decreaseQty(i.id)} style={qBtn("#f3f4f6", "#111")}>−</button>
                <span style={{ fontSize: 12, fontWeight: 700, minWidth: 16, textAlign: "center" }}>{i.quantity}</span>
                <button onClick={() => increaseQty(i.id)} style={qBtn("#111", "white")}>+</button>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, minWidth: 38, textAlign: "right" }}>₹{(i.price * i.quantity).toFixed(0)}</span>
              <button
                onClick={() => setExpandedItem(expandedItem === i.id ? null : i.id)}
                style={{ background: cartNotes[i.id] ? "#fffbeb" : "#f3f4f6", border: "1px solid", borderColor: cartNotes[i.id] ? "#fbbf24" : "#e5e7eb", borderRadius: 4, padding: "2px 5px", fontSize: 10, cursor: "pointer" }}
              >📝</button>
            </div>
            {expandedItem === i.id && (
              <input autoFocus placeholder="Note for this item..." value={cartNotes[i.id] || ""} onChange={e => setCartNotes(prev => ({ ...prev, [i.id]: e.target.value }))}
                style={{ width: "100%", marginTop: 4, padding: "4px 8px", border: "1.5px solid #fbbf24", borderRadius: 5, fontSize: 11, outline: "none", boxSizing: "border-box" as const }} />
            )}
            {cartNotes[i.id] && expandedItem !== i.id && (
              <p style={{ fontSize: 10, color: "#d97706", margin: "2px 0 0" }}>📝 {cartNotes[i.id]}</p>
            )}
          </div>
        ))}
      </div>

      {/* ── Bill + actions ── */}
      <div style={{ padding: "10px 14px", borderTop: "1px solid #e5e7eb", flexShrink: 0, background: "#fafafa" }}>

        {/* Order notes */}
        <textarea placeholder="Order notes..." value={orderNotes} onChange={e => setOrderNotes(e.target.value)} rows={1}
          style={{ width: "100%", padding: "5px 8px", border: "1.5px solid #e5e7eb", borderRadius: 6, fontSize: 11, resize: "none", marginBottom: 6, fontFamily: "system-ui", color: "#111", background: "white", boxSizing: "border-box" as const }} />

        {/* Discount */}
        <div style={{ marginBottom: 6 }}>
          <button onClick={() => setShowDiscount(!showDiscount)} style={{ fontSize: 11, color: "#6b7280", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            {showDiscount ? "▾" : "▸"} {discountAmount > 0 ? `Discount: −₹${discountAmount.toFixed(0)}` : "Add discount"}
          </button>
          {showDiscount && (
            <div style={{ display: "flex", gap: 5, marginTop: 4 }}>
              <button onClick={() => setDiscountType("percent")} style={{ ...pill, borderColor: discountType === "percent" ? "#111" : "#e5e7eb", background: discountType === "percent" ? "#111" : "white", color: discountType === "percent" ? "white" : "#374151" }}>%</button>
              <button onClick={() => setDiscountType("fixed")} style={{ ...pill, borderColor: discountType === "fixed" ? "#111" : "#e5e7eb", background: discountType === "fixed" ? "#111" : "white", color: discountType === "fixed" ? "white" : "#374151" }}>₹</button>
              <input type="number" placeholder={discountType === "percent" ? "e.g. 10" : "e.g. 50"} value={discountValue} onChange={e => setDiscountValue(e.target.value)}
                style={{ flex: 1, padding: "4px 8px", border: "1.5px solid #e5e7eb", borderRadius: 5, fontSize: 12, outline: "none" }} />
            </div>
          )}
        </div>

        {/* Totals */}
        <div style={{ marginBottom: 8 }}>
          <div style={row}><span style={{ fontSize: 11, color: "#6b7280" }}>Subtotal</span><span style={{ fontSize: 11, color: "#6b7280" }}>₹{(subtotal || 0).toFixed(2)}</span></div>
          <div style={row}><span style={{ fontSize: 11, color: "#6b7280" }}>GST (5%)</span><span style={{ fontSize: 11, color: "#6b7280" }}>₹{(gst || 0).toFixed(2)}</span></div>
          {discountAmount > 0 && (
            <div style={row}><span style={{ fontSize: 11, color: "#16a34a" }}>Discount {discountType === "percent" ? `(${discountValue}%)` : ""}</span><span style={{ fontSize: 11, color: "#16a34a" }}>−₹{discountAmount.toFixed(2)}</span></div>
          )}
          <div style={{ ...row, marginTop: 4 }}><span style={{ fontSize: 14, fontWeight: 800 }}>Total</span><span style={{ fontSize: 16, fontWeight: 800, color: "#f97316" }}>₹{finalTotal.toFixed(2)}</span></div>
        </div>

        {/* Payment method — CASH | CARD | UPI | DUE | SPLIT */}
        <div style={{ display: "flex", gap: 3, marginBottom: 6, flexWrap: "wrap" as const }}>
          {PAY_METHODS.map(m => (
            <button key={m.value} onClick={() => { setPayment(m.value); if (["CASH","CARD","UPI"].includes(m.value)) setPaymentMethod(m.value as any) }}
              style={{ flex: 1, minWidth: 40, padding: "5px 2px", border: "1.5px solid", borderRadius: 5, fontSize: 10, fontWeight: 600, cursor: "pointer",
                borderColor: payment === m.value ? (m.value === "DUE" ? "#dc2626" : "#111") : "#e5e7eb",
                background: payment === m.value ? (m.value === "DUE" ? "#dc2626" : "#111") : "white",
                color: payment === m.value ? "white" : "#374151" }}>
              {m.label}
            </button>
          ))}
        </div>

        {/* DUE fields */}
        {payment === "DUE" && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 7, padding: "8px 10px", marginBottom: 6 }}>
            <p style={{ fontSize: 10, fontWeight: 600, color: "#dc2626", margin: "0 0 6px" }}>📒 Credit Sale — existing customers only</p>
            <input placeholder="Phone *" value={customerPhone} readOnly={!!customerPhone}
              style={{ width: "100%", padding: "5px 8px", border: "1.5px solid #fecaca", borderRadius: 5, fontSize: 11, outline: "none", marginBottom: 5, boxSizing: "border-box" as const, background: customerPhone ? "#f0fdf4" : "white" }} />
            <input placeholder="Name *" value={customerName} readOnly={!!customerName}
              style={{ width: "100%", padding: "5px 8px", border: "1.5px solid #fecaca", borderRadius: 5, fontSize: 11, outline: "none", marginBottom: 5, boxSizing: "border-box" as const, background: customerName ? "#f0fdf4" : "white" }} />
            <input type="number" placeholder={`Due amount (default: ₹${finalTotal.toFixed(0)})`} value={dueAmount} onChange={e => setDueAmount(e.target.value)}
              style={{ width: "100%", padding: "5px 8px", border: "1.5px solid #fecaca", borderRadius: 5, fontSize: 11, outline: "none", boxSizing: "border-box" as const }} />
            {!customerPhone && <p style={{ fontSize: 10, color: "#9ca3af", margin: "4px 0 0" }}>Enter phone above to find existing customer</p>}
          </div>
        )}

        {/* SPLIT payment fields */}
        {payment === "SPLIT" && (
          <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 7, padding: "8px 10px", marginBottom: 6 }}>
            <p style={{ fontSize: 10, fontWeight: 600, color: "#0369a1", margin: "0 0 6px" }}>✂️ Split Payment — Total: ₹{finalTotal.toFixed(0)} | Remaining: ₹{splitRemaining.toFixed(0)}</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
              {[["💵 Cash", splitCash, setSplitCash], ["📱 UPI", splitUPI, setSplitUPI], ["💳 Card", splitCard, setSplitCard]].map(([label, val, setter]: any) => (
                <div key={label}>
                  <p style={{ fontSize: 9, color: "#6b7280", margin: "0 0 2px" }}>{label}</p>
                  <input type="number" placeholder="₹0" value={val} onChange={e => setter(e.target.value)}
                    style={{ width: "100%", padding: "4px 6px", border: "1.5px solid #bae6fd", borderRadius: 5, fontSize: 11, outline: "none", boxSizing: "border-box" as const }} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Print mode */}
        <div style={{ display: "flex", gap: 3, marginBottom: 5 }}>
          {(["KOT", "BILL", "KOT+BILL"] as const).map(mode => (
            <button key={mode} onClick={() => setPrintMode?.(mode)}
              style={{ flex: 1, padding: "4px 0", border: "1.5px solid", borderRadius: 5, fontSize: 9, fontWeight: 600, cursor: "pointer",
                borderColor: printMode === mode ? "#111" : "#e5e7eb",
                background: printMode === mode ? "#111" : "white",
                color: printMode === mode ? "white" : "#374151" }}>{mode}</button>
          ))}
        </div>

        {/* Place Order */}
        <button onClick={handlePlaceOrder} disabled={!canPlace}
          style={{ width: "100%", padding: "11px", borderRadius: 9, border: "none",
            background: canPlace ? "#111" : "#e5e7eb",
            color: canPlace ? "white" : "#9ca3af",
            fontSize: 14, fontWeight: 700, cursor: canPlace ? "pointer" : "not-allowed" }}>
          {btnLabel}
        </button>
      </div>
    </div>
  )
}

const qBtn = (bg: string, color: string): React.CSSProperties => ({
  width: 22, height: 22, borderRadius: 4, border: "1px solid #e5e7eb",
  background: bg, color, cursor: "pointer", fontSize: 13,
  display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700,
})
const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }
const pill: React.CSSProperties = { padding: "4px 10px", border: "1.5px solid", borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: "pointer" }
