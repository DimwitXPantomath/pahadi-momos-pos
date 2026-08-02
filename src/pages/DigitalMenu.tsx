import { useParams, Link } from "react-router-dom"
import { useState, useEffect, useMemo } from "react"
import { supabase } from "@/lib/supabase"

// Public, read-only "just browse the menu" page — auto-generated from the
// same menu_items/categories tables the in-store POS and the online-order
// page use, so there's exactly one menu to keep updated, not three. No cart,
// no checkout. For outlets that want a QR customers can scan without being
// funneled straight into ordering (table tents, Instagram bio link, etc).
// Reuses the anon SELECT policies already added for CustomerSelfOrder.tsx
// in 010_online_ordering_and_loyalty_toggle.sql — no new RLS needed.

type Category = { id: string; name: string; sort_order: number }
type MenuItem = { id: string; name: string; price: number; category_id: string | null; is_veg: boolean; available: boolean }

export default function DigitalMenu() {
  const { outletId = "demo-outlet" } = useParams()
  const [categories, setCategories] = useState<Category[]>([])
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [activeCategory, setActiveCategory] = useState<string | "all">("all")
  const [vegOnly, setVegOnly] = useState(false)
  const [loading, setLoading] = useState(true)

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
    return menuItems.filter(i => {
      if (activeCategory !== "all" && i.category_id !== activeCategory) return false
      if (vegOnly && !i.is_veg) return false
      return true
    })
  }, [menuItems, activeCategory, vegOnly])

  const grouped = useMemo(() => {
    const map: Record<string, MenuItem[]> = {}
    filteredItems.forEach(item => {
      const key = item.category_id ?? "uncategorized"
      if (!map[key]) map[key] = []
      map[key].push(item)
    })
    return map
  }, [filteredItems])

  return (
    <div style={s.page}>
      <div style={{ textAlign: "center", margin: "16px 0 20px" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>🌿 Praang</h1>
        <p style={{ color: "#6b7280", margin: "4px 0 0", fontSize: 13 }}>Menu</p>
      </div>

      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 6, alignItems: "center" }}>
        <button onClick={() => setActiveCategory("all")} style={pill(activeCategory === "all")}>All</button>
        {categories.map(c => (
          <button key={c.id} onClick={() => setActiveCategory(c.id)} style={pill(activeCategory === c.id)}>{c.name}</button>
        ))}
      </div>
      <div style={{ marginBottom: 16 }}>
        <button onClick={() => setVegOnly(v => !v)} style={{ ...pill(vegOnly), borderColor: vegOnly ? "#16a34a" : "#e5e7eb", background: vegOnly ? "#f0fdf4" : "white", color: vegOnly ? "#16a34a" : "#374151" }}>
          🟢 Veg only
        </button>
      </div>

      {loading ? (
        <p style={{ textAlign: "center", color: "#9ca3af", padding: "40px 0" }}>Loading menu…</p>
      ) : filteredItems.length === 0 ? (
        <p style={{ textAlign: "center", color: "#9ca3af", padding: "40px 0" }}>No items to show right now.</p>
      ) : activeCategory !== "all" ? (
        <ItemList items={filteredItems} />
      ) : (
        categories.map(c => (
          grouped[c.id]?.length ? (
            <div key={c.id} style={{ marginBottom: 22 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 10px", color: "#111" }}>{c.name}</h3>
              <ItemList items={grouped[c.id]} />
            </div>
          ) : null
        ))
      )}

      <div style={{ position: "sticky", bottom: 16, marginTop: 24, textAlign: "center" }}>
        <Link
          to={`/order-online/${outletId}`}
          style={{ display: "inline-block", background: "#111", color: "white", padding: "13px 32px", borderRadius: 30, fontWeight: 700, fontSize: 14, textDecoration: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}
        >
          🛒 Order Online
        </Link>
      </div>
    </div>
  )
}

function ItemList({ items }: { items: MenuItem[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map(item => (
        <div key={item.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "white", border: "1px solid #e5e7eb", borderRadius: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.is_veg ? "#16a34a" : "#dc2626", flexShrink: 0 }} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</span>
          </div>
          <span style={{ fontWeight: 700, fontSize: 14, color: "#f97316" }}>₹{item.price}</span>
        </div>
      ))}
    </div>
  )
}

const pill = (active: boolean): React.CSSProperties => ({
  padding: "6px 16px", borderRadius: 20, border: "1.5px solid", whiteSpace: "nowrap", cursor: "pointer", fontSize: 13, fontWeight: 600,
  borderColor: active ? "#111" : "#e5e7eb",
  background: active ? "#111" : "white",
  color: active ? "white" : "#374151",
})

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 480, margin: "0 auto", padding: "16px 16px 48px", fontFamily: "system-ui, sans-serif", minHeight: "100vh", background: "#fafafa" },
}
