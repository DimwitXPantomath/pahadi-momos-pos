import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { useState, useEffect, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import { cn, sanitizePhoneDigits } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

// Public, no-login online ordering page — what the counter QR now points to
// instead of a printed loyalty card. Deliberately simple: no size/addon
// picker, no online payment (there's no payment gateway wired into this app
// yet — see the migration notes in 010_online_ordering_and_loyalty_toggle.sql).
// The order lands with payment_status='pending'; a staff member confirms
// payment in the Orders board, and THAT is what fires a stamp/points, not
// this page.
//
// 2026-08-13: migrated from inline style={{}} objects (hardcoded hex) to
// Tailwind classes bound to tailwind.config.ts tokens, same pass as
// DigitalMenu.tsx. Presentation only — every hook, query, filter, and
// handler below is unchanged from the previous version.

type Category = { id: string; name: string; sort_order: number }
type MenuItem = { id: string; name: string; price: number; category_id: string | null; is_veg: boolean; available: boolean; estimated_calories?: number | null }
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
      // FIXED: categories/menu_items have no outlet_id column (single
      // shared menu today, confirmed against the live schema) — the
      // .eq("outlet_id", ...) filter errored on every call, silently
      // leaving both arrays empty, so this page has shown an empty
      // menu since it was built. outletId stays in the URL/state for
      // when multi-outlet menus exist, just not used to filter yet.
      const [{ data: cats, error: catsError }, { data: items, error: itemsError }] = await Promise.all([
        supabase.from("categories").select("*").order("sort_order", { ascending: true }),
        supabase.from("menu_items").select("*").eq("available", true).order("name", { ascending: true }),
      ])
      if (catsError) console.error("Fetch categories error:", catsError)
      if (itemsError) console.error("Fetch menu items error:", itemsError)
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
      <div className="max-w-[480px] mx-auto px-4 pt-4 pb-6 min-h-screen bg-background font-sans">
        <Card className="p-6 text-center mt-10">
          <p className="text-5xl m-0 mb-2">✅</p>
          <h2 className="m-0 mb-2 text-foreground text-xl font-bold">Order placed!</h2>
          <p className="text-gray-600 text-sm mb-4">
            {tableId ? `Table ${tableId.replace(/^T/i, "")} — s` : "S"}how your phone number ({phone}) at the counter to pay. Your stamp/points are added once staff confirm payment.
          </p>
          <button
            onClick={() => navigate(`/order/${placedOrderId}`)}
            className="bg-primary text-primary-foreground border-none rounded-xl text-sm font-bold cursor-pointer px-6 py-3 mb-2"
          >Track my order</button>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-[480px] mx-auto px-4 pt-4 pb-6 min-h-screen bg-background font-sans">
      <div className="text-center my-4 mb-5">
        <h1 className="text-xl font-extrabold m-0 text-foreground">🌿 Praang</h1>
        <p className="text-muted-foreground mt-1 mb-0 text-[13px]">Order online — pay at the counter</p>
        {tableId && (
          <Badge variant="success" className="mt-2">📍 Table {tableId.replace(/^T/i, "")}</Badge>
        )}
      </div>

      {!showCheckout ? (
        <>
          {/* Category tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3">
            <Pill active={activeCategory === "all"} onClick={() => setActiveCategory("all")}>All</Pill>
            {categories.map(c => (
              <Pill key={c.id} active={activeCategory === c.id} onClick={() => setActiveCategory(c.id)}>{c.name}</Pill>
            ))}
          </div>

          {loading ? (
            <p className="text-center text-gray-400 py-10">Loading menu…</p>
          ) : filteredItems.length === 0 ? (
            <p className="text-center text-gray-400 py-10">No items available right now.</p>
          ) : (
            <div className={cn("flex flex-col gap-2.5", cartQty > 0 ? "pb-[90px]" : "pb-5")}>
              {filteredItems.map(item => (
                <Card key={item.id} className="p-3 px-4 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn("w-2 h-2 rounded-full flex-shrink-0", item.is_veg ? "bg-green-600" : "bg-red-600")} />
                    <div>
                      <p className="m-0 font-semibold text-sm text-foreground">{item.name}</p>
                      <p className="mt-0.5 mb-0 text-[13px] text-gray-500">
                        ₹{item.price}
                        {item.estimated_calories != null && ` · ~${item.estimated_calories} kcal`}
                      </p>
                    </div>
                  </div>
                  {qtyInCart(item.id) === 0 ? (
                    <button
                      onClick={() => addItem(item)}
                      className="bg-primary text-primary-foreground border-none rounded-xl text-[13px] font-bold cursor-pointer px-4 py-1.5"
                    >Add</button>
                  ) : (
                    <div className="flex items-center gap-2.5">
                      <QtyBtn onClick={() => decreaseItem(item.id)}>−</QtyBtn>
                      <span className="font-bold">{qtyInCart(item.id)}</span>
                      <QtyBtn onClick={() => addItem(item)}>+</QtyBtn>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}

          {/* Sticky cart bar */}
          {cartQty > 0 && (
            <div className="fixed left-0 right-0 bottom-0 max-w-[480px] mx-auto bg-card border-t border-border pos-shadow-lg px-4 py-3 flex items-center justify-between">
              <div>
                <p className="m-0 text-xs text-gray-500">{cartQty} item{cartQty > 1 ? "s" : ""}</p>
                <p className="m-0 font-extrabold text-base text-foreground">₹{total.toFixed(2)}</p>
              </div>
              <button
                onClick={() => setShowCheckout(true)}
                className="bg-primary text-primary-foreground border-none rounded-xl text-sm font-bold cursor-pointer px-6 py-3"
              >View Cart →</button>
            </div>
          )}
        </>
      ) : (
        <>
          <button onClick={() => setShowCheckout(false)} className="bg-transparent border-none text-gray-500 text-[13px] cursor-pointer p-0 mb-3">← Back to menu</button>

          <Card className="p-4 mb-3">
            <p className="font-bold m-0 mb-2.5 text-sm text-foreground">Your order</p>
            {cart.map(i => (
              <div key={i.id} className="flex justify-between text-sm py-1.5">
                <span>{i.name} × {i.quantity}</span>
                <span>₹{(i.price * i.quantity).toFixed(0)}</span>
              </div>
            ))}
            <div className="border-t border-border my-2" />
            <div className="flex justify-between text-[13px] text-gray-500"><span>Subtotal</span><span>₹{subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between text-[13px] text-gray-500"><span>GST (5%)</span><span>₹{gst.toFixed(2)}</span></div>
            <div className="flex justify-between font-extrabold text-base mt-1.5 text-foreground"><span>Total</span><span>₹{total.toFixed(2)}</span></div>
          </Card>

          <Card className="p-4 mb-3">
            <p className="font-bold m-0 mb-2.5 text-sm text-foreground">Your details</p>
            <input
              type="tel" maxLength={10}
              placeholder="📞 Phone number (required)"
              value={phone}
              onChange={e => setPhone(sanitizePhoneDigits(e.target.value))}
              className="w-full box-border px-3 py-2.5 border-[1.5px] border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-ring focus:border-primary mb-2"
            />
            <input
              placeholder="👤 Name (optional)"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full box-border px-3 py-2.5 border-[1.5px] border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-ring focus:border-primary"
            />
            <p className="text-[11px] text-gray-400 mt-2">Used to track your stamp/loyalty progress and to confirm payment at the counter.</p>
          </Card>

          {submitError && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-3.5 py-2.5 mb-3 text-[13px] text-destructive">{submitError}</div>
          )}

          <button
            onClick={submitOrder}
            disabled={submitting}
            className="bg-primary text-primary-foreground border-none rounded-xl text-sm font-bold cursor-pointer w-full py-3.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Placing order..." : `Place order — ₹${total.toFixed(2)}`}
          </button>
          <p className="text-[11px] text-gray-400 text-center mt-2.5">Pay at the counter (cash/UPI) — staff confirm your payment there.</p>
        </>
      )}
    </div>
  )
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-4 py-1.5 rounded-full border-[1.5px] whitespace-nowrap cursor-pointer text-[13px] font-semibold transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "border-gray-200 bg-white text-gray-700"
      )}
    >
      {children}
    </button>
  )
}

function QtyBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="w-7 h-7 rounded-md border border-border bg-muted cursor-pointer text-base font-bold text-foreground"
    >
      {children}
    </button>
  )
}
