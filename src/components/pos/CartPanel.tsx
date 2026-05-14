import type { OrderItem } from "@/types/pos"

export type PrintMode = "BILL" | "KOT" | "KOT+BILL"

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
  onPlaceOrder: () => void
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
}: Props) {

  const isTableService = posMode === "TABLE_SERVICE"
  const canPlace = !isPlacingOrder && cart.length > 0 && (!isTableService || !!selectedTable)

  const btnLabel = isPlacingOrder
    ? "Placing order..."
    : isTableService && !selectedTable
      ? "Select a table first"
      : "Place order"

  return (
    <div style={{
      background: "white",
      border: "1px solid #e5e7eb",
      borderRadius: 12,
      display: "flex",
      flexDirection: "column",
      height: "100%",           // ← fill the grid cell
      overflow: "hidden",       // ← contain children
    }}>

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
        {isTableService && selectedTable && (
          <p style={{ fontSize: 12, color: "#f97316", margin: "2px 0 0", fontWeight: 600 }}>Table {selectedTable}</p>
        )}
        {isTableService && !selectedTable && (
          <p style={{ fontSize: 12, color: "#dc2626", margin: "2px 0 0" }}>Please select a table first</p>
        )}
      </div>

      {/* Dine-in / Takeaway */}
      {isTableService && (
        <div style={{ display: "flex", gap: 4, padding: "10px 16px 0", flexShrink: 0 }}>
          {(["DINE_IN", "TAKEAWAY"] as const).map(t => (
            <button key={t} onClick={() => setOrderType(t)} style={{
              flex: 1, padding: "6px", borderRadius: 8, border: "1.5px solid", fontSize: 12,
              fontWeight: 600, cursor: "pointer",
              borderColor: orderType === t ? "#111" : "#e5e7eb",
              background: orderType === t ? "#111" : "white",
              color: orderType === t ? "white" : "#374151",
            }}>
              {t === "DINE_IN" ? "Dine-in" : "Takeaway"}
            </button>
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
        ) : (
          cart.map(i => (
            <div key={i.id} style={{
              display: "flex", alignItems: "center", gap: 8,
              paddingBottom: 10, marginBottom: 10,
              borderBottom: "1px solid #f3f4f6",
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {i.name}
                </p>
                <p style={{ fontSize: 11, color: "#6b7280", margin: "2px 0 0" }}>
                  ₹{i.price} × {i.quantity}
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                <button onClick={() => decreaseQty(i.id)} style={qtyBtn("#f3f4f6", "#111")}>−</button>
                <span style={{ fontSize: 13, fontWeight: 700, minWidth: 18, textAlign: "center" }}>{i.quantity}</span>
                <button onClick={() => increaseQty(i.id)} style={qtyBtn("#111", "white")}>+</button>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, minWidth: 44, textAlign: "right" }}>
                ₹{(i.price * i.quantity).toFixed(0)}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Bill summary + actions — fixed at bottom */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid #e5e7eb", flexShrink: 0, background: "#fafafa" }}>

        {/* Totals */}
        <div style={{ marginBottom: 10 }}>
          <div style={row}>
            <span style={{ fontSize: 12, color: "#6b7280" }}>Subtotal</span>
            <span style={{ fontSize: 12, color: "#6b7280" }}>₹{(subtotal || 0).toFixed(2)}</span>
          </div>
          <div style={row}>
            <span style={{ fontSize: 12, color: "#6b7280" }}>GST (5%)</span>
            <span style={{ fontSize: 12, color: "#6b7280" }}>₹{gst.toFixed(2)}</span>
          </div>
          <div style={{ ...row, marginTop: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 800 }}>Total</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: "#f97316" }}>₹{grandTotal.toFixed(2)}</span>
          </div>
        </div>

        {/* Notes */}
        {isTableService && (
          <textarea
            placeholder="Notes / special instructions..."
            value={orderNotes}
            onChange={e => setOrderNotes(e.target.value)}
            rows={2}
            style={{
              width: "100%", padding: "6px 10px", border: "1.5px solid #e5e7eb",
              borderRadius: 8, fontSize: 12, resize: "none", marginBottom: 8,
              fontFamily: "system-ui", color: "#111", background: "white",
              boxSizing: "border-box",
            }}
          />
        )}

        {/* Payment method */}
        <select
          value={paymentMethod}
          onChange={e => setPaymentMethod(e.target.value as "CASH" | "CARD" | "UPI")}
          style={{
            width: "100%", padding: "8px 10px", border: "1.5px solid #e5e7eb",
            borderRadius: 8, fontSize: 13, marginBottom: 10,
            background: "white", color: "#111",
          }}
        >
          <option value="CASH">💵 Cash</option>
          <option value="CARD">💳 Card</option>
          <option value="UPI">📱 UPI</option>
        </select>

        {/* Place Order */}
        <button
          onClick={onPlaceOrder}
          disabled={!canPlace}
          style={{
            width: "100%", padding: "13px", borderRadius: 10, border: "none",
            background: canPlace ? "#111" : "#e5e7eb",
            color: canPlace ? "white" : "#9ca3af",
            fontSize: 15, fontWeight: 700,
            cursor: canPlace ? "pointer" : "not-allowed",
            transition: "background 0.15s",
          }}
        >
          {btnLabel}
        </button>
      </div>
    </div>
  )
}

// ── Style helpers ─────────────────────────────────────────────────────────────

function qtyBtn(bg: string, color: string): React.CSSProperties {
  return {
    width: 24, height: 24, borderRadius: 5,
    border: "1px solid #e5e7eb",
    background: bg, color,
    cursor: "pointer", fontSize: 15,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: 700, lineHeight: 1,
  }
}

const row: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 3,
}
