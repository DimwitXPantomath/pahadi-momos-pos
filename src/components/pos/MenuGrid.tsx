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

export default function MenuGrid({
  menuItems,
  categories,
  mostOrdered,
  cart,
  activeCategory,
  setActiveCategory,
  searchQuery,
  setSearchQuery,
  vegFilter,
  setVegFilter,
  addToCart,
  increaseQty,
  decreaseQty,
  toggleAvailability,
}: Props) {

  // 🔍 FILTER LOGIC (from v2)
  const filtered = menuItems.filter(item => {
    if (activeCategory && activeCategory !== "all" && item.category_id !== activeCategory) return false
    if (!item.available) return false
    if (vegFilter === "veg" && !item.is_veg) return false
    if (vegFilter === "nonveg" && item.is_veg) return false
    if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  return (
    <div className="flex flex-col h-full">

      {/* 🔍 Search + Veg Filter */}
      <div className="flex gap-2 mb-3">
        <input
          placeholder="Search menu..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="flex-1 px-3 py-2 border rounded-lg text-sm"
        />

        {(["all", "veg", "nonveg"] as const).map(f => (
          <button
            key={f}
            onClick={() => setVegFilter(f)}
            className={cn(
              "px-3 py-2 rounded-lg text-xs font-semibold border",
              vegFilter === f
                ? f === "veg"
                  ? "bg-green-600 text-white"
                  : f === "nonveg"
                  ? "bg-red-600 text-white"
                  : "bg-black text-white"
                : "bg-white"
            )}
          >
            {f === "all" ? "All" : f === "veg" ? "🟢 Veg" : "🔴 Non-veg"}
          </button>
        ))}
      </div>

      {/* 📂 Category Tabs */}
      <div className="flex gap-2 mb-3 overflow-x-auto">
        <button
          onClick={() => setActiveCategory("all")}
          className={cn(
            "px-4 py-2 rounded-xl text-sm font-semibold",
            activeCategory === "all" ? "bg-indigo-600 text-white" : "bg-white border"
          )}
        >
          All
        </button>

        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={cn(
              "flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap",
              activeCategory === cat.id
                ? "bg-indigo-600 text-white"
                : "bg-white border"
            )}
          >
            {categoryIcons[cat.name]}
            {cat.name}
          </button>
        ))}
      </div>

      {/* ⭐ Most Ordered */}
      {mostOrdered.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-bold text-gray-500 mb-1">⭐ Most Ordered</p>
          <div className="flex gap-2 flex-wrap">
            {mostOrdered.map(item => (
              <button
                key={item.id}
                onClick={() => addToCart(item)}
                className="px-3 py-1 bg-yellow-100 border border-yellow-400 rounded-full text-xs font-semibold"
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 🧾 Menu Grid */}
      <div className="grid grid-cols-3 gap-3 overflow-y-auto">

        {filtered.map(item => {
          const cartItem = cart.find(i => i.id === item.id)

          return (
            <div
              key={item.id}
              className="bg-white border rounded-xl p-3"
            >
              {/* Image */}
              <div className="h-16 flex items-center justify-center bg-gray-100 rounded mb-2 text-xl">
                {item.is_veg ? "🥗" : "🍖"}
              </div>

              {/* Name */}
              <div className="flex items-center gap-1 mb-1">
                <span className={cn(
                  "w-2 h-2 rounded-full",
                  item.is_veg ? "bg-green-500" : "bg-red-500"
                )} />
                <span className="text-sm font-semibold truncate">{item.name}</span>
              </div>

              {/* Price */}
              <p className="text-orange-500 font-bold text-sm mb-2">
                ₹{item.price}
              </p>

              {/* Sizes or Add */}
              {item.sizes?.length ? (
                <div className="flex flex-wrap gap-1">
                  {item.sizes.map(size => {
                    const sizeId = `${item.id}|${size.label}|base`
                    const sizeCart = cart.find(i => i.id === sizeId)

                    return sizeCart ? (
                      <div key={size.label} className="flex items-center gap-1">
                        <button onClick={() => decreaseQty(sizeCart.id)} className="px-2 border rounded">-</button>
                        <span className="text-xs font-bold">{sizeCart.quantity}</span>
                        <button onClick={() => addToCart(item, size)} className="px-2 bg-black text-white rounded">+</button>
                      </div>
                    ) : (
                      <button
                        key={size.label}
                        onClick={() => addToCart(item, size)}
                        className="px-2 py-1 text-xs bg-black text-white rounded"
                      >
                        {size.label}
                      </button>
                    )
                  })}
                </div>
              ) : cartItem ? (
                <div className="flex items-center gap-2">
                  <button onClick={() => decreaseQty(cartItem.id)} className="px-2 border rounded">-</button>
                  <span className="text-sm font-bold">{cartItem.quantity}</span>
                  <button onClick={() => increaseQty(cartItem.id)} className="px-2 bg-black text-white rounded">+</button>
                </div>
              ) : (
                <button
                  onClick={() => addToCart(item)}
                  className="w-full bg-black text-white py-1 rounded text-sm"
                >
                  Add
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Empty */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center h-40 text-gray-400">
          <Coffee className="w-10 h-10 mb-2 opacity-50" />
          <p>No items found</p>
        </div>
      )}
    </div>
  )
}