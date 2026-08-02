import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { useState, useEffect, useMemo } from "react"
import { supabase } from "@/lib/supabase"

// Public, no-login online ordering page — what the counter QR now points to
// instead of a printed loyalty card. Deliberately simple: no size/addon
// picker, no online payment (there's no payment gateway wired into this app
// yet — see the migration notes in 010_online_ordering_and_loyalty_toggle.sql).
// The order lands with payment_status='pending'; a staff member confirms
// payment in the Orders board, and THAT is what fires a stamp/points, not
// this page.

type Category = { id: string; name: string; sort_order: number }
type MenuItem = { id: string; name: string; price: number; category_id: string | null; is_veg: boolean; available: boolean }
type CartLine = { id: string; name: string; price: number; quantity: number }

export default function CustomerSelfOrder() {
  const { outletId = "demo-outlet" } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // Set by a table's NFC tag/QR: /order-online/demo-outlet?table=T5 — same
  // table IDs (T1, T2...) the in-store TableSelector already uses, so an
  // order placed from either path lands in the same `orders.table_id` column.
  const tableId = searchParams.get("table")

  const [categories, setCategories] = useState<Category[]>([])
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [activeCategory, setActiveCategory] = useState<string | "all">("all")
  const [loading, setLoading] = useState(true)

  const [cart, setCart] = useState<CartLine[]>([])
  const [showCheckout, setShowCheckout] = useState(false)
  const [phone, setPhone] = useState("")
  const [name, setName] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const [{ data: cats }, { data: items }] = await Promise.all([
        supabase.from("categories").select("*").eq("outlet_id", outletId).order("sort_order", { ascending: true }),
        supabase.from("menu_items").select("*").eq("outlet_id", outletId).eq("available", true).order("name", { ascending: true }),
      ])
      setCategories(cats ?? [])
      setMenuItems(items ?? [])
      setLoading(false)
    })()
  }, [outletId])

  const filteredItems = useMemo(() => {
    if (activeCategory === "all") return menuItems
    return menuItems.filter(i => i.category_id === activeCategory)
  }, [menuItems, activeCategory])

  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0)
  const gst = subtotal * 0.05
  const total = subtotal + gst
  const cartQty = cart.reduce((s, i) => s + i.quantity, 0)

  const addItem = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id)
      if (existing) return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { id: item.id, name: item.name, price: item.price, quantity: 1 }]
    })
  }
  const decreaseItem = (id: string) => {
    setCart(prev => prev.map(i => i.id === id ? { ...i, quantity: i.quantity - 1 } : i).filter(i => i.quantity > 0))
  }
  const qtyInCart = (id: string) => cart.find(i => i.id === id)?.quantity ?? 0

  const submitOrder = async () => {
    const digits = phone.replace(/\D/g, "")
    if (digits.length < 10) { setSubmitError("Enter a 10-digit phone number"); return }
    if (cart.length === 0) { setSubmitError("Your cart is empty"); return }
    setSubmitError(null)
    setSubmitting(true)

    // Price is never sent from here anymore — place_online_order() looks up
    // each item's real price from menu_items itself and recomputes the
    // total server-side. Only item id + quantity are trusted from the
    // client (see 017_price_safe_online_orders.sql). subtotal/gst/total
    // shown on this page are a preview for the customer, not what gets
    // charged — the order actually created reflects server-verified prices.
    const { data: order, error } = await supabase.rpc("place_online_order", {
      p_outlet_id: outletId,
      p_items: cart.map(i => ({ id: i.id, quantity: i.quantity })),
      p_customer_phone: digits,
      p_customer_name: name || null,
      p_table_id: tableId || null,
    })

    if (error || !order) {
      console.error("Online order error:", error)
      setSubmitError(error?.message || "Could not place order — please try again or order at the counter.")
      setSubmitting(false)
      return
    }

    setPlacedOrderId(order.id)
    setSubmitting(false)
  }

  if (placedOrderId) {
    return (
      <div style={s.page}>
        <div style={{ ...s.card, textAlign: "center", marginTop: 40 }}>
          <p style={{ fontSize: 48, margin: "0 0 8px" }}>✅</p>
          <h2 style={{ margin: "0 0 8px" }}>Order placed!</h2>
          <p style={{ color: "#374151", fontSize: 14, marginBottom: 16 }}>
            {tableId ? `Table ${tableId.replace(/^T/i, "")} — s` : "S"}how your phone number ({phone}) at the counter to pay. Your stamp/points are added once staff confirm payment.
          </p>
          <button
            onClick={() => navigate(`/order/${placedOrderId}`)}
            style={{ ...s.primaryBtn, marginBottom: 8 }}
          >Track my order</button>
        </div>
      </div>
    )
  }

  return (
    <div style={s.page}>
      <div style={{ textAlign: "center", margin: "16px 0 20px" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>🌿 Praang</h1>
        <p style={{ color: "#6b7280", margin: "4px 0 0", fontSize: 13 }}>Order online — pay at the counter</p>
        {tableId && (
          <span style={{ display: "inline-block", marginTop: 8, fontSize: 12, fontWeight: 700, padding: "3px 12px", borderRadius: 20, background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0" }}>
            📍 Table {tableId.replace(/^T/i, "")}
          </span>
        )}
      </div>

      {!showCheckout ? (
        <>
          {/* Category tabs */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 12 }}>
            <button onClick={() => setActiveCategory("all")} style={pill(activeCategory === "all")}>All</button>
            {categories.map(c => (
              <button key={c.id} onClick={() => setActiveCategory(c.id)} style={pill(activeCategory === c.id)}>{c.name}</button>
            ))}
          </div>

          {loading ? (
            <p style={{ textAlign: "center", color: "#9ca3af", padding: "40px 0" }}>Loading menu…</p>
          ) : filteredItems.length === 0 ? (
            <p style={{ textAlign: "center", color: "#9ca3af", padding: "40px 0" }}>No items available right now.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: cartQty > 0 ? 90 : 20 }}>
              {filteredItems.map(item => (
                <div key={item.id} style={{ ...s.card, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.is_veg ? "#16a34a" : "#dc2626", flexShrink: 0 }} />
                    <div>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{item.name}</p>
                      <p style={{ margin: "2px 0 0", fontSize: 13, color: "#6b7280" }}>₹{item.price}</p>
                    </div>
                  </div>
                  {qtyInCart(item.id) === 0 ? (
                    <button onClick={() => addItem(item)} style={{ ...s.primaryBtn, padding: "6px 16px", fontSize: 13 }}>Add</button>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <button onClick={() => decreaseItem(item.id)} style={qtyBtn}>−</button>
                      <span style={{ fontWeight: 700 }}>{qtyInCart(item.id)}</span>
                      <button onClick={() => addItem(item)} style={qtyBtn}>+</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Sticky cart bar */}
          {cartQty > 0 && (
            <div style={s.stickyBar}>
              <div>
                <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>{cartQty} item{cartQty > 1 ? "s" : ""}</p>
                <p style={{ margin: 0, fontWeight: 800, fontSize: 16 }}>₹{total.toFixed(2)}</p>
              </div>
              <button onClick={() => setShowCheckout(true)} style={{ ...s.primaryBtn, padding: "12px 24px" }}>View Cart →</button>
            </div>
          )}
        </>
      ) : (
        <>
          <button onClick={() => setShowCheckout(false)} style={{ background: "none", border: "none", color: "#6b7280", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 12 }}>← Back to menu</button>

          <div style={{ ...s.card, marginBottom: 12 }}>
            <p style={{ fontWeight: 700, margin: "0 0 10px", fontSize: 14 }}>Your order</p>
            {cart.map(i => (
              <div key={i.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "6px 0" }}>
                <span>{i.name} × {i.quantity}</span>
                <span>₹{(i.price * i.quantity).toFixed(0)}</span>
              </div>
            ))}
            <div style={{ borderTop: "1px solid #e5e7eb", margin: "8px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#6b7280" }}><span>Subtotal</span><span>₹{subtotal.toFixed(2)}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#6b7280" }}><span>GST (5%)</span><span>₹{gst.toFixed(2)}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 16, marginTop: 6 }}><span>Total</span><span>₹{total.toFixed(2)}</span></div>
          </div>

          <div style={{ ...s.card, marginBottom: 12 }}>
            <p style={{ fontWeight: 700, margin: "0 0 10px", fontSize: 14 }}>Your details</p>
            <input
              type="tel" maxLength={10}
              placeholder="📞 Phone number (required)"
              value={phone}
              onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              style={{ ...s.input, marginBottom: 8 }}
            />
            <input
              placeholder="👤 Name (optional)"
              value={name}
              onChange={e => setName(e.target.value)}
              style={s.input}
            />
            <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 8 }}>Used to track your stamp/loyalty progress and to confirm payment at the counter.</p>
          </div>

          {submitError && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#dc2626" }}>{submitError}</div>
          )}

          <button onClick={submitOrder} disabled={submitting} style={{ ...s.primaryBtn, width: "100%", padding: 14 }}>
            {submitting ? "Placing order..." : `Place order — ₹${total.toFixed(2)}`}
          </button>
          <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", marginTop: 10 }}>Pay at the counter (cash/UPI) — staff confirm your payment there.</p>
        </>
      )}
    </div>
  )
}

const pill = (active: boolean): React.CSSProperties => ({
  padding: "6px 16px", borderRadius: 20, border: "1.5px solid", whiteSpace: "nowrap", cursor: "pointer", fontSize: 13, fontWeight: 600,
  borderColor: active ? "#111" : "#e5e7eb",
  background: active ? "#111" : "white",
  color: active ? "white" : "#374151",
})

const qtyBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 6, border: "1px solid #e5e7eb", background: "#f3f4f6",
  cursor: "pointer", fontSize: 16, fontWeight: 700,
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 480, margin: "0 auto", padding: "16px 16px 24px", fontFamily: "system-ui, sans-serif", minHeight: "100vh", background: "#fafafa" },
  card: { background: "white", borderRadius: 14, border: "1px solid #e5e7eb", padding: "14px 16px" },
  input: { width: "100%", padding: "10px 12px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box" as const },
  primaryBtn: { background: "#111", color: "white", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" },
  stickyBar: { position: "fixed", left: 0, right: 0, bottom: 0, maxWidth: 480, margin: "0 auto", background: "white", borderTop: "1px solid #e5e7eb", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 -4px 16px rgba(0,0,0,0.06)" },
}
