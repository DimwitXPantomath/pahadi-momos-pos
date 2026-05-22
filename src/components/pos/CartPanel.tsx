import { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"
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
    discount: number
    discountType: DiscountType
    cartNotes: Record<string, string>
    orderNotes: string
    payment: PaymentMethod
    dueAmount?: number
    customerPhone?: string
    customerName?: string
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

  // ── Payment state ─────────────────────────────────────────────────
  const [payment, setPayment] = useState<PaymentMethod>(paymentMethod as PaymentMethod)
  const [dueAmount, setDueAmount] = useState<string>("")

  // Split: keyed by method name, amount string
  const [splitAmounts, setSplitAmounts] = useState<Record<string, string>>({ CASH: "", UPI: "", CARD: "" })

  // ── Customer state — always visible ──────────────────────────────
  const [customerPhone, setCustomerPhone] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [lookingUp, setLookingUp] = useState(false)
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // ── SPLIT validation ──────────────────────────────────────────────
  const splitTotal = Object.values(splitAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const splitValid = payment !== "SPLIT" || Math.abs(splitTotal - finalTotal) < 0.01

  // ── Auto-lookup customer by phone ─────────────────────────────────
  useEffect(() => {
    if (lookupTimer.current) clearTimeout(lookupTimer.current)
    const digits = customerPhone.replace(/\D/g, "")
    if (digits.length < 10) {
      // Don't clear manually typed name
      return
    }
    lookupTimer.current = setTimeout(async () => {
      setLookingUp(true)
      // Try loyalty_customers first
      const { data: lc } = await supabase
        .from("loyalty_customers")
        .select("name")
        .eq("customer_phone", digits)
        .maybeSingle()
      if (lc?.name) {
        setCustomerName(lc.name)
        setLookingUp(false)
        return
      }
      // Fallback: look for name in credit_sales history
      const { data: cs } = await supabase
        .from("credit_sales")
        .select("customer_name")
        .eq("customer_phone", digits)
        .not("customer_name", "eq", "")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (cs?.customer_name) setCustomerName(cs.customer_name)
      setLookingUp(false)
    }, 600)
  }, [customerPhone])

  // ── Place order handler ───────────────────────────────────────────
  const handlePlaceOrder = () => {
    if (payment === "SPLIT" && !splitValid) {
      alert(`Split amounts (₹${splitTotal.toFixed(0)}) must equal total (₹${finalTotal.toFixed(0)})`)
      return
    }
    const splitPayments = payment === "SPLIT"
      ? Object.fromEntries(
          Object.entries(splitAmounts)
            .filter(([, v]) => parseFloat(v) > 0)
            .map(([k, v]) => [k, parseFloat(v)])
        )
      : undefined

    onPlaceOrder({
      discount: discountAmount,
      discountType,
      cartNotes,
      orderNotes,
      payment,
      dueAmount: payment === "DUE" ? Number(dueAmount) || finalTotal : undefined,
      customerPhone: customerPhone || undefined,
      customerName: customerName || undefined,
      splitPayments,
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

      {/* Customer details — always visible */}
      <div style={{ padding: "8px 16px", borderBottom: "1px solid #f3f4f6", flexShrink: 0, background: "#fafafa" }}>
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <input
              type="tel"
              maxLength={10}
              placeholder="📞 Phone (auto-fetch name)"
              value={customerPhone}
              onChange={e => setCustomerPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              style={{ width: "100%", padding: "5px 8px", border: "1.5px solid #e5e7eb", borderRadius: 6, fontSize: 12, outline: "none", boxSizing: "border-box", background: "white" }}
            />
            {lookingUp && (
              <span style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "#9ca3af" }}>
                searching…
              </span>
            )}
          </div>
          <input
            placeholder="👤 Name"
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            style={{ flex: 1, padding: "5px 8px", border: "1.5px solid #e5e7eb", borderRadius: 6, fontSize: 12, outline: "none", background: "white" }}
          />
        </div>
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
              <button
                onClick={() => setExpandedItem(expandedItem === i.id ? null : i.id)}
                title="Add note"
                style={{ background: cartNotes[i.id] ? "#fffbeb" : "#f3f4f6", border: "1px solid", borderColor: cartNotes[i.id] ? "#fbbf24" : "#e5e7eb", borderRadius: 6, padding: "2px 6px", fontSize: 11, cursor: "pointer", flexShrink: 0 }}
              >📝</button>
            </div>
            {expandedItem === i.id && (
              <input
                placeholder="Note for this item..."
                value={cartNotes[i.id] || ""}
                onChange={e => setCartNotes(prev => ({ ...prev, [i.id]: e.target.value }))}
                autoFocus
                style={{ width: "100%", marginTop: 6, padding: "5px 8px", border: "1.5px solid #fbbf24", borderRadius: 6, fontSize: 12, outline: "none", boxSizing: "border-box" }}
              />
            )}
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

        {/* Payment method — CASH / UPI / CARD / DUE / SPLIT */}
        <div style={{ display: "flex", gap: 3, marginBottom: 8, flexWrap: "wrap" }}>
          {(["CASH", "UPI", "CARD", "DUE", "SPLIT"] as PaymentMethod[]).map(m => (
            <button
              key={m}
              onClick={() => {
                setPayment(m)
                if (m !== "DUE" && m !== "SPLIT") setPaymentMethod(m as "CASH" | "CARD" | "UPI")
                // Pre-fill split with full amount in CASH when entering SPLIT
                if (m === "SPLIT") setSplitAmounts({ CASH: finalTotal.toFixed(0), UPI: "", CARD: "" })
              }}
              style={{
                flex: "1 1 auto", padding: "5px 0", border: "1.5px solid", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                borderColor: payment === m ? (m === "DUE" ? "#dc2626" : m === "SPLIT" ? "#7c3aed" : "#111") : "#e5e7eb",
                background: payment === m ? (m === "DUE" ? "#dc2626" : m === "SPLIT" ? "#7c3aed" : "#111") : "white",
                color: payment === m ? "white" : "#374151",
              }}
            >
              {m === "CASH" ? "💵" : m === "UPI" ? "📱" : m === "CARD" ? "💳" : m === "DUE" ? "📒" : "🔀"} {m}
            </button>
          ))}
        </div>

        {/* SPLIT payment inputs */}
        {payment === "SPLIT" && (
          <div style={{ background: "#faf5ff", border: "1px solid #ddd6fe", borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", margin: "0 0 8px" }}>🔀 Split Payment — Total: ₹{finalTotal.toFixed(0)}</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              {(["CASH", "UPI", "CARD"] as const).map(m => (
                <div key={m}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", marginBottom: 2 }}>
                    {m === "CASH" ? "💵" : m === "UPI" ? "📱" : "💳"} {m}
                  </div>
                  <input
                    type="number"
                    min="0"
                    placeholder="₹0"
                    value={splitAmounts[m]}
                    onChange={e => setSplitAmounts(prev => ({ ...prev, [m]: e.target.value }))}
                    style={{ width: "100%", padding: "5px 8px", border: `1.5px solid ${splitValid ? "#ddd6fe" : "#fca5a5"}`, borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12 }}>
              <span style={{ color: "#6b7280" }}>Sum: ₹{splitTotal.toFixed(0)}</span>
              {!splitValid && (
                <span style={{ color: "#dc2626", fontWeight: 600 }}>
                  {splitTotal < finalTotal ? `₹${(finalTotal - splitTotal).toFixed(0)} short` : `₹${(splitTotal - finalTotal).toFixed(0)} over`}
                </span>
              )}
              {splitValid && splitTotal > 0 && <span style={{ color: "#16a34a", fontWeight: 600 }}>✓ Balanced</span>}
            </div>
          </div>
        )}

        {/* Due/Credit fields */}
        {payment === "DUE" && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "#dc2626", margin: "0 0 8px" }}>📒 Credit Sale</p>
            <input
              type="number"
              placeholder={`Due amount (default: ₹${finalTotal.toFixed(0)})`}
              value={dueAmount}
              onChange={e => setDueAmount(e.target.value)}
              style={{ width: "100%", padding: "6px 10px", border: "1.5px solid #fecaca", borderRadius: 6, fontSize: 12, outline: "none", boxSizing: "border-box" }}
            />
            <p style={{ fontSize: 10, color: "#9ca3af", margin: "4px 0 0" }}>Leave blank to mark full amount as due · Name/phone from above</p>
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
          disabled={!canPlace || (payment === "SPLIT" && !splitValid)}
          style={{
            width: "100%", padding: "13px", borderRadius: 10, border: "none",
            background: canPlace && (payment !== "SPLIT" || splitValid) ? "#111" : "#e5e7eb",
            color: canPlace && (payment !== "SPLIT" || splitValid) ? "white" : "#9ca3af",
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
