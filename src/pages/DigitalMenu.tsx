import { useParams, Link } from "react-router-dom"
import { useState, useEffect, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"

// Public, read-only "just browse the menu" page — auto-generated from the
// same menu_items/categories tables the in-store POS and the online-order
// page use, so there's exactly one menu to keep updated, not three. No cart,
// no checkout. For outlets that want a QR customers can scan without being
// funneled straight into ordering (table tents, Instagram bio link, etc).
// Reuses the anon SELECT policies already added for CustomerSelfOrder.tsx
// in 010_online_ordering_and_loyalty_toggle.sql — no new RLS needed.
//
// 2026-08-13: migrated from inline style={{}} objects (hardcoded hex,
// never updated in the 2026-08-04 rebrand pass — see CLAUDE.md "Known
// gap") to Tailwind classes bound to the real design tokens in
// tailwind.config.ts. Presentation only — every hook, query, filter,
// and conditional below is unchanged from the previous version.

type Category = { id: string; name: string; sort_order: number }
type MenuItem = { id: string; name: string; price: number; category_id: string | null; is_veg: boolean; available: boolean; estimated_calories?: number | null }

export default function DigitalMenu() {
  const { outletId = "demo-outlet" } = useParams()
  const [categories, setCategories] = useState<Category[]>([])
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [activeCategory, setActiveCategory] = useState<string | "all">("all")
  const [vegOnly, setVegOnly] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      // FIXED: categories/menu_items have no outlet_id column (single
      // shared menu today, confirmed against the live schema) — the
      // .eq("outlet_id", ...) filter errored on every call, silently
      // leaving both arrays empty. outletId is kept in the URL/state
      // for when multi-outlet menus exist, just not used to filter yet.
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
    <div className="max-w-[480px] mx-auto px-4 pt-4 pb-12 min-h-screen bg-background font-sans">
      <div className="text-center my-4 mb-5">
        <h1 className="text-xl font-extrabold m-0 text-foreground">🌿 Praang</h1>
        <p className="text-muted-foreground mt-1 mb-0 text-[13px]">Menu</p>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-1.5 items-center">
        <Pill active={activeCategory === "all"} onClick={() => setActiveCategory("all")}>All</Pill>
        {categories.map(c => (
          <Pill key={c.id} active={activeCategory === c.id} onClick={() => setActiveCategory(c.id)}>{c.name}</Pill>
        ))}
      </div>
      <div className="mb-4">
        <button
          onClick={() => setVegOnly(v => !v)}
          className={cn(
            "px-4 py-1.5 rounded-full border-[1.5px] whitespace-nowrap cursor-pointer text-[13px] font-semibold transition-colors",
            vegOnly ? "border-green-600 bg-green-50 text-green-600" : "border-gray-200 bg-white text-gray-700"
          )}
        >
          🟢 Veg only
        </button>
      </div>

      {loading ? (
        <p className="text-center text-gray-400 py-10">Loading menu…</p>
      ) : filteredItems.length === 0 ? (
        <p className="text-center text-gray-400 py-10">No items to show right now.</p>
      ) : activeCategory !== "all" ? (
        <ItemList items={filteredItems} />
      ) : (
        categories.map(c => (
          grouped[c.id]?.length ? (
            <div key={c.id} className="mb-[22px]">
              <h3 className="text-[15px] font-extrabold mb-2.5 text-foreground">{c.name}</h3>
              <ItemList items={grouped[c.id]} />
            </div>
          ) : null
        ))
      )}

      <div className="sticky bottom-4 mt-6 text-center">
        <Link
          to={`/order-online/${outletId}`}
          className="inline-block bg-primary text-primary-foreground px-8 py-3.5 rounded-full font-bold text-sm no-underline shadow-lg"
        >
          🛒 Order Online
        </Link>
      </div>
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

function ItemList({ items }: { items: MenuItem[] }) {
  return (
    <div className="flex flex-col gap-2">
      {items.map(item => (
        <div key={item.id} className="flex items-center justify-between px-3.5 py-2.5 bg-white border border-gray-100 rounded-xl shadow-sm">
          <div className="flex items-center gap-2">
            <span className={cn("w-2 h-2 rounded-full flex-shrink-0", item.is_veg ? "bg-green-600" : "bg-red-600")} />
            <div>
              <span className="font-semibold text-sm text-foreground">{item.name}</span>
              {item.estimated_calories != null && (
                <span className="block text-[11px] text-gray-400">~{item.estimated_calories} kcal</span>
              )}
            </div>
          </div>
          <span className="font-bold text-sm text-brand-accent">₹{item.price}</span>
        </div>
      ))}
    </div>
  )
}
