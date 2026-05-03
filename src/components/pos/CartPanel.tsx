import type { OrderItem } from "@/types/pos"

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
  // Table service props
  posMode: "SELF_SERVICE" | "TABLE_SERVICE"
  selectedTable: string | null
  orderType: "DINE_IN" | "TAKEAWAY"
  setOrderType: (v: "DINE_IN" | "TAKEAWAY") => void
  orderNotes: string
  setOrderNotes: (v: string) => void
}

export default function CartPanel({
  cart,
  subtotal,
  gst,
  grandTotal,
  paymentMethod,
  setPaymentMethod,
  increaseQty,
  decreaseQty,
  isPlacingOrder,
  onPlaceOrder,
  posMode,
  selectedTable,
  orderType,
  setOrderType,
  orderNotes,
  setOrderNotes,
}: Props) {

  const isTableService = posMode === "TABLE_SERVICE"
  const canPlace = !isPlacingOrder && cart.length > 0 && (!isTableService || !!selectedTable)

  const btnLabel = isPlacingOrder
    ? "Placing order..."
    : isTableService && !selectedTable
      ? "Select a table first"
      : "Place order"

  return (
    <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 12, display: "flex", flexDirection: "column", minHeight: 0 }}>

      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb" }}>
        <p style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>Your order</p>
        {isTableService && selectedTable && (
          <p style={{ fontSize: 12, color: "#f97316", margin: "2px 0 0", fontWeight: 600 }}>Table {selectedTable}</p>
        )}
        {isTableService && !selectedTable && (
          <p style={{ fontSize: 12, color: "#dc2626", margin: "2px 0 0" }}>Please select a table first</p>
        )}
      </div>

      {/* Dine-in / Takeaway toggle */}
      {isTableService && (
        <div style={{ display: "flex", gap: 4, padding: "10px 16px 0" }}>
          {(["DINE_IN", "TAKEAWAY"] as const).map(t => (
            <button
              key={t}
              onClick={() => setOrderType(t)}
              style={{
                flex: 1, padding: "6px", borderRadius: 8, border: "1.5px solid", fontSize: 12,
                fontWeight: 600, cursor: "pointer",
                borderColor: orderType === t ? "#111" : "#e5e7eb",
                background: orderType === t ? "#111" : "white",
                color: orderType === t ? "white" : "#374151",
              }}
            >{t === "DINE_IN" ? "Dine-in" : "Takeaway"}</button>
          ))}
        </div>
      )}

      {/* Cart items */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 16px" }}>
        {cart.length === 0 ? (
          <div style={{ textAlign: "center", paddingTop: 32, color: "#9ca3af" }}>
            <p style={{ fontSize: 28, marginBottom: 8 }}>🛒</p>
            <p style={{ fontSize: 13 }}>No items added yet</p>
          </div>
        ) : cart.map(i => (
          <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 10, marginBottom: 10, borderBottom: "1px solid #f3f4f6" }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{i.name}</p>
              <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>₹{i.price} × {i.quantity}</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button onClick={() => decreaseQty(i.id)} style={{ width: 22, height: 22, borderRadius: 4, border: "1px solid #e5e7eb", background: "#f3f4f6", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>-</button>
              <span style={{ fontSize: 12, fontWeight: 700, minWidth: 16, textAlign: "center" }}>{i.quantity}</span>
              <button onClick={() => increaseQty(i.id)} style={{ width: 22, height: 22, borderRadius: 4, border: "none", background: "#111", color: "white", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, minWidth: 40, textAlign: "right" }}>₹{(i.price * i.quantity).toFixed(0)}</span>
          </div>
        ))}
      </div>

      {/* Bill + payment */}
      <div style={{ padding: "10px 16px", borderTop: "1px solid #e5e7eb" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
          <span>Subtotal</span><span>₹{subtotal.toFixed(2)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
          <span>GST (5%)</span><span>₹{gst.toFixed(2)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 800, marginBottom: 12 }}>
          <span>Total</span>
          <span style={{ color: "#f97316" }}>₹{grandTotal.toFixed(2)}</span>
        </div>

        {/* Notes — table service only */}
        {isTableService && (
          <textarea
            placeholder="Notes / special instructions..."
            value={orderNotes}
            onChange={e => setOrderNotes(e.target.value)}
            rows={2}
            style={{ width: "100%", padding: "6px 10px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 12, resize: "none", marginBottom: 8, fontFamily: "system-ui", color: "#111", background: "white" }}
          />
        )}

        {/* Payment method */}
        <select
          value={paymentMethod}
          onChange={e => setPaymentMethod(e.target.value as "CASH" | "CARD" | "UPI")}
          style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 13, marginBottom: 10, background: "white", color: "#111" }}
        >
          <option value="CASH">💵 Cash</option>
          <option value="CARD">💳 Card</option>
          <option value="UPI">📱 UPI</option>
        </select>

        <button
          onClick={onPlaceOrder}
          disabled={!canPlace}
          style={{
            width: "100%", padding: "12px", borderRadius: 10, border: "none",
            background: canPlace ? "#111" : "#e5e7eb",
            color: canPlace ? "white" : "#9ca3af",
            fontSize: 14, fontWeight: 700,
            cursor: canPlace ? "pointer" : "not-allowed",
          }}
        >{btnLabel}</button>
      </div>
    </div>
  )
}
