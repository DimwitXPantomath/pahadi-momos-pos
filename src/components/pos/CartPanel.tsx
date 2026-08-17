import { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { sanitizePhoneDigits } from "@/lib/utils"
import type { OrderItem } from "@/types/pos"
import type { StampCard, StampCardProgram } from "@/types/loyalty"
import { describeReward } from "@/types/loyalty"
import { fetchStampProgram, lookupCardByPhone } from "@/services/stampCardService"
import CheckoutFlowModal from "./CheckoutFlowModal"

const OUTLET_ID = "demo-outlet"

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
    stampProgramId?: string
    applyStampReward?: boolean
    stampCardIdToRedeem?: string
    prepMinutes: number
  }) => void
  posMode: "SELF_SERVICE" | "TABLE_SERVICE"
  selectedTable: string | null
  orderType: "DINE_IN" | "TAKEAWAY" | "ON_THE_GO"
  setOrderType: (v: "DINE_IN" | "TAKEAWAY" | "ON_THE_GO") => void
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

  // ── Checkout modal — service type / payment / print mode now live in
  // CheckoutFlowModal, stepped through after "Place order" is tapped,
  // instead of all being inline in the cart footer at once.
  const [showCheckout, setShowCheckout] = useState(false)

  // ── Customer state — always visible ──────────────────────────────
  const [customerPhone, setCustomerPhone] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [lookingUp, setLookingUp] = useState(false)
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Stamp card state ────────────────────────────────────────────────
  const [stampProgram, setStampProgram] = useState<StampCardProgram | null>(null)
  const [stampCard, setStampCard] = useState<StampCard | null>(null)
  const [applyStampReward, setApplyStampReward] = useState(false)

  // Load the outlet's active stamp program once — if none is active this whole
  // block just never renders, no extra queries per phone digit.
  useEffect(() => {
    fetchStampProgram(OUTLET_ID).then(p => { if (p?.is_active) setStampProgram(p) })
  }, [])

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

  // ── Auto-lookup customer by phone ─────────────────────────────────
  useEffect(() => {
    if (lookupTimer.current) clearTimeout(lookupTimer.current)
    const digits = customerPhone.replace(/\D/g, "")
    if (digits.length < 10) {
      // Don't clear manually typed name
      setStampCard(null)
      setApplyStampReward(false)
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
      } else {
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
      }

      // Stamp card status for this phone, if a program is active
      if (stampProgram) {
        const card = await lookupCardByPhone(stampProgram.id, digits, OUTLET_ID)
        setStampCard(card)
        setApplyStampReward(false)
      }

      setLookingUp(false)
    }, 600)
  }, [customerPhone, stampProgram])

  // Auto-fill the discount fields when staff confirms redeeming a discount-type
  // reward — reuses the existing discount UI instead of a second total-adjustment
  // path. Complimentary-item rewards don't touch price; staff handles that comp
  // manually (e.g. zero an item or apply an equivalent discount themselves).
  useEffect(() => {
    if (!applyStampReward || !stampProgram) return
    if (stampProgram.reward_type === "discount_percent") {
      setDiscountType("percent")
      setDiscountValue(String(stampProgram.reward_value ?? 0))
      setShowDiscount(true)
    } else if (stampProgram.reward_type === "discount_flat") {
      setDiscountType("fixed")
      setDiscountValue(String(stampProgram.reward_value ?? 0))
      setShowDiscount(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyStampReward])

  // ── Place order handler — called from CheckoutFlowModal's single confirm
  // screen (service type / prep time / payment / print mode all picked there)
  const handleConfirmCheckout = (info: {
    payment: PaymentMethod
    dueAmount?: number
    splitPayments?: Record<string, number>
    printMode: PrintMode
    prepMinutes: number
  }) => {
    if (info.payment === "CASH" || info.payment === "UPI" || info.payment === "CARD") {
      setPaymentMethod(info.payment)
    }
    setPrintMode?.(info.printMode)

    onPlaceOrder({
      discount: discountAmount,
      discountType,
      cartNotes,
      orderNotes,
      payment: info.payment,
      dueAmount: info.dueAmount,
      customerPhone: customerPhone || undefined,
      customerName: customerName || undefined,
      splitPayments: info.splitPayments,
      stampProgramId: stampProgram?.id,
      applyStampReward: applyStampReward && stampCard?.status === "reward_ready",
      stampCardIdToRedeem: applyStampReward && stampCard?.status === "reward_ready" ? stampCard.id : undefined,
      prepMinutes: info.prepMinutes,
    })
    setShowCheckout(false)
  }

  return (
    <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 12, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>🛒 Your order</p>
          {cart.length > 0 && (
            <span style={{ background: "hsl(var(--primary))", color: "white", borderRadius: 20, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>
              {cart.reduce((s, i) => s + i.quantity, 0)} items
            </span>
          )}
        </div>
        {isTableService && selectedTable && <p style={{ fontSize: 12, color: "hsl(var(--brand-accent))", margin: "2px 0 0", fontWeight: 600 }}>Table {selectedTable}</p>}
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
              onChange={e => setCustomerPhone(sanitizePhoneDigits(e.target.value))}
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

      {/* Stamp card status — only shows once a valid phone is entered and a program is active */}
      {stampProgram && customerPhone.replace(/\D/g, "").length === 10 && !lookingUp && (
        <div style={{
          margin: "8px 16px 0", padding: "8px 12px", borderRadius: 8, flexShrink: 0,
          background: stampCard?.status === "reward_ready" ? "#fffbeb" : "#f0fdf4",
          border: `1px solid ${stampCard?.status === "reward_ready" ? "#fde68a" : "#bbf7d0"}`,
        }}>
          {!stampCard ? (
            <span style={{ fontSize: 12, color: "#16a34a" }}>🎟️ New stamp card starts with this order</span>
          ) : stampCard.status === "reward_ready" ? (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "#92400e", fontWeight: 700 }}>🎁 Reward ready — {describeReward(stampProgram)}</span>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 12, color: "#92400e", cursor: "pointer" }}>
                <input type="checkbox" checked={applyStampReward} onChange={e => setApplyStampReward(e.target.checked)} />
                Apply reward to this order
              </label>
            </>
          ) : (
            <span style={{ fontSize: 12, color: "#16a34a" }}>
              🎟️ {stampCard.stamps_count}/{stampProgram.stamps_required} stamps — this order adds one more
            </span>
          )}
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
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                <button onClick={() => decreaseQty(i.id)} style={qtyBtn("#f3f4f6", "#111")}>−</button>
                <span style={{ fontSize: 13, fontWeight: 700, minWidth: 18, textAlign: "center" }}>{i.quantity}</span>
                <button onClick={() => increaseQty(i.id)} style={qtyBtn("hsl(var(--primary))", "white")}>+</button>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.name}</p>
                <p style={{ fontSize: 11, color: "#6b7280", margin: "2px 0 0" }}>₹{i.price} × {i.quantity}</p>
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
              <button onClick={() => setDiscountType("percent")} style={{ ...pillBtn, borderColor: discountType === "percent" ? "hsl(var(--primary))" : "#e5e7eb", background: discountType === "percent" ? "hsl(var(--primary))" : "white", color: discountType === "percent" ? "white" : "#374151" }}>%</button>
              <button onClick={() => setDiscountType("fixed")} style={{ ...pillBtn, borderColor: discountType === "fixed" ? "hsl(var(--primary))" : "#e5e7eb", background: discountType === "fixed" ? "hsl(var(--primary))" : "white", color: discountType === "fixed" ? "white" : "#374151" }}>₹</button>
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
            <span style={{ fontSize: 18, fontWeight: 800, color: "hsl(var(--brand-accent))" }}>₹{finalTotal.toFixed(2)}</span>
          </div>
        </div>

        {/* Place Order — opens the guided checkout modal (service type →
            payment → print mode) instead of placing directly */}
        <button
          onClick={() => setShowCheckout(true)}
          disabled={!canPlace}
          style={{
            width: "100%", padding: "13px", borderRadius: 10, border: "none",
            background: canPlace ? "hsl(var(--primary))" : "#e5e7eb",
            color: canPlace ? "white" : "#9ca3af",
            fontSize: 15, fontWeight: 700,
            cursor: canPlace ? "pointer" : "not-allowed",
            transition: "background 0.15s",
          }}
        >{btnLabel}</button>
      </div>

      {showCheckout && (
        <CheckoutFlowModal
          isTableService={isTableService}
          orderType={orderType}
          setOrderType={setOrderType}
          finalTotal={finalTotal}
          isPlacingOrder={isPlacingOrder}
          onClose={() => setShowCheckout(false)}
          onConfirm={handleConfirmCheckout}
        />
      )}
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
