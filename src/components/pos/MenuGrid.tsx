import { Coffee, Leaf, Cake, UtensilsCrossed, GlassWater } from "lucide-react"
import { cn } from "../../lib/utils"
import type { MenuItem, OrderItem } from "@/types/pos"

type Props = {
  menuItems: MenuItem[]
  categories: { id: string; name: string }[]
  mostOrdered: MenuItem[]
  cart: OrderItem[]
  activeCategory: string
  setActiveCategory: (v: string) => void
  searchQuery: string
  setSearchQuery: (v: string) => void
  vegFilter: "all" | "veg" | "nonveg"
  setVegFilter: (v: "all" | "veg" | "nonveg") => void
  addToCart: (item: MenuItem, size?: { label: string; price: number }) => void
  increaseQty: (id: string) => void
  decreaseQty: (id: string) => void
  toggleAvailability?: (id: string, current: boolean) => void | Promise<void>
}

const categoryIcons: Record<string, React.ReactNode> = {
  Coffee: <Coffee className="w-4 h-4" />,
  Tea: <Leaf className="w-4 h-4" />,
  Pastries: <Cake className="w-4 h-4" />,
  Food: <UtensilsCrossed className="w-4 h-4" />,
  Beverages: <GlassWater className="w-4 h-4" />,
}

// ── Must match useCart.ts ID format exactly ───────────────────────────────────
// useCart builds: [item.id, size?.label || "base", ...addonNames].join("|")
// No size, no addons → "itemId|base"
// With size, no addons → "itemId|Large"
function buildCartId(itemId: string, size?: { label: string }) {
  return [itemId, size?.label ?? "base"].join("|")
}

export default function MenuGrid({
  menuItems, categories, mostOrdered, cart,
  activeCategory, setActiveCategory,
  searchQuery, setSearchQuery,
  vegFilter, setVegFilter,
  addToCart, increaseQty, decreaseQty,
}: Props) {

  const filtered = menuItems.filter(item => {
    if (activeCategory && activeCategory !== "all" && item.category_id !== activeCategory) return false
    if (!(item.available ?? true)) return false
    if (vegFilter === "veg" && !item.is_veg) return false
    if (vegFilter === "nonveg" && item.is_veg) return false
    if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Search + Veg Filter */}
      <div className="flex gap-2 mb-3">
        <input
          placeholder="Search menu..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="flex-1 px-3 py-2 border rounded-lg text-sm"
        />
        {(["all", "veg", "nonveg"] as const).map(f => (
          <button key={f} onClick={() => setVegFilter(f)}
            className={cn("px-3 py-2 rounded-lg text-xs font-semibold border",
              vegFilter === f
                ? f === "veg" ? "bg-green-600 text-white"
                : f === "nonveg" ? "bg-red-600 text-white"
                : "bg-primary text-white"
                : "bg-white"
            )}>
            {f === "all" ? "All" : f === "veg" ? "🟢 Veg" : "🔴 Non-veg"}
          </button>
        ))}
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
        <button onClick={() => setActiveCategory("all")}
          className={cn("px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap",
            activeCategory === "all" ? "bg-indigo-600 text-white" : "bg-white border")}>
          All
        </button>
        {categories.map(cat => (
          <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
            className={cn("flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap",
              activeCategory === cat.id ? "bg-indigo-600 text-white" : "bg-white border")}>
            {categoryIcons[cat.name]}
            {cat.name}
          </button>
        ))}
      </div>

      {/* Most Ordered */}
      {mostOrdered.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-bold text-gray-500 mb-1">⭐ Most Ordered</p>
          <div className="flex gap-2 flex-wrap">
            {mostOrdered.map(item => (
              <button key={item.id} onClick={() => addToCart(item)}
                className="px-3 py-1 bg-yellow-100 border border-yellow-400 rounded-full text-xs font-semibold">
                {item.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Menu Grid */}
      <div className="grid grid-cols-3 gap-3 overflow-y-auto pb-4 content-start flex-1 min-h-0">
        {filtered.map(item => {
          // FIX: use buildCartId — matches useCart's compound ID format
          const cartItem = cart.find(i => i.id === buildCartId(item.id))
          const hasSizes = !!item.sizes && item.sizes.length > 0

          return (
            <div
              key={item.id}
              onClick={hasSizes ? undefined : () => addToCart(item)}
              role={hasSizes ? undefined : "button"}
              tabIndex={hasSizes ? undefined : 0}
              onKeyDown={hasSizes ? undefined : (e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); addToCart(item) }
              }}
              className={cn(
                "relative bg-white border rounded-xl p-3 text-left",
                !hasSizes && "cursor-pointer transition-colors hover:border-primary hover:bg-primary/5 active:bg-primary/10"
              )}
            >
              {!hasSizes && cartItem && (
                <span className="absolute top-1.5 right-1.5 bg-primary text-primary-foreground text-[11px] font-bold rounded-full min-w-[20px] h-5 px-1 flex items-center justify-center">
                  ×{cartItem.quantity}
                </span>
              )}

              <div className="h-16 flex items-center justify-center bg-gray-100 rounded mb-2 text-xl">
                {item.is_veg ? "🥗" : "🍖"}
              </div>

              <div className="flex items-center gap-1 mb-1">
                <span className={cn("w-2 h-2 rounded-full flex-shrink-0",
                  item.is_veg ? "bg-green-500" : "bg-red-500")} />
                <span className="text-sm font-semibold truncate">{item.name}</span>
              </div>

              <p className="text-brand-accent font-bold text-sm mb-2">₹{item.price}</p>

              {/* Sizes — tap-whole-card doesn't apply here since a size must be chosen */}
              {hasSizes && (
                <div className="flex flex-wrap gap-1">
                  {item.sizes!.map(size => {
                    // FIX: correct ID format
                    const sizeCartItem = cart.find(i => i.id === buildCartId(item.id, size))
                    return sizeCartItem ? (
                      <div key={size.label} className="flex items-center gap-1">
                        <button onClick={() => decreaseQty(sizeCartItem.id)}
                          className="w-6 h-6 border rounded text-sm font-bold">−</button>
                        <span className="text-xs font-bold min-w-[16px] text-center">{sizeCartItem.quantity}</span>
                        <button onClick={() => addToCart(item, size)}
                          className="w-6 h-6 bg-primary text-white rounded text-sm font-bold">+</button>
                      </div>
                    ) : (
                      <button key={size.label} onClick={() => addToCart(item, size)}
                        className="px-2 py-1 text-xs bg-primary text-white rounded">
                        {size.label} ₹{size.price}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center h-40 text-gray-400">
          <Coffee className="w-10 h-10 mb-2 opacity-50" />
          <p>No items found</p>
        </div>
      )}
    </div>
  )
}
