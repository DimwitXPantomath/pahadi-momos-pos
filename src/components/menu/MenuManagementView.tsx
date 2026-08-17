import { useState } from "react"
import { Plus, Trash2, Tag, X, Search } from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { MenuItem } from "@/types/pos"

// Replaces the old two-tab (Categories / Items) admin form. Mirrors the
// look of the actual ordering screen (MenuGrid.tsx) instead of a plain
// settings-style form: category carousel up top, item grid below, both
// end in a dashed "+" tile that opens an add dialog rather than a
// permanently-visible sidebar form. Deliberately kept fully self-contained
// (own search/filter/category-select state) instead of reusing the
// ordering screen's searchQuery/vegFilter/activeCategory from useMenu —
// those are shared with MenuGrid on the POS tab, and typing a search term
// here shouldn't leave it applied on the actual ordering screen.

type Props = {
  menuItems: MenuItem[]
  categories: { id: string; name: string }[]
  newItemName: string
  setNewItemName: (v: string) => void
  newItemPrice: string
  setNewItemPrice: (v: string) => void
  newItemCategory: string
  setNewItemCategory: (v: string) => void
  newItemIsVeg: boolean
  setNewItemIsVeg: (v: boolean) => void
  newItemTaxIncluded: boolean
  setNewItemTaxIncluded: (v: boolean) => void
  newCategoryName: string
  setNewCategoryName: (v: string) => void
  addMenuItem: () => void | Promise<void>
  addCategory: () => void | Promise<void>
  deleteCategory: (id: string) => void | Promise<void>
  deleteMenuItem: (id: string) => void | Promise<void>
  toggleAvailability: (id: string, current: boolean) => void | Promise<void>
  setTaggingItem: (item: MenuItem) => void
}

export default function MenuManagementView({
  menuItems, categories,
  newItemName, setNewItemName,
  newItemPrice, setNewItemPrice,
  newItemCategory, setNewItemCategory,
  newItemIsVeg, setNewItemIsVeg,
  newItemTaxIncluded, setNewItemTaxIncluded,
  newCategoryName, setNewCategoryName,
  addMenuItem, addCategory, deleteCategory, deleteMenuItem, toggleAvailability,
  setTaggingItem,
}: Props) {
  const [activeCat, setActiveCat] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [vegFilter, setVegFilter] = useState<"all" | "veg" | "nonveg">("all")
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [showAddItem, setShowAddItem] = useState(false)

  const filtered = menuItems.filter(item => {
    if (activeCat && item.category_id !== activeCat) return false
    if (vegFilter === "veg" && !item.is_veg) return false
    if (vegFilter === "nonveg" && item.is_veg) return false
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  function openAddItem() {
    // Prefill with whichever category chip is active, if any — saves a step
    // for the common case of "add another item to the category I'm looking at."
    setNewItemCategory(activeCat ?? categories[0]?.id ?? "")
    setShowAddItem(true)
  }

  async function handleAddCategory() {
    await addCategory()
    setShowAddCategory(false)
  }

  async function handleAddItem() {
    await addMenuItem()
    setShowAddItem(false)
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-5">
        <h2 className="text-xl font-extrabold text-gray-900">Menu Management</h2>
        <p className="text-sm text-gray-500 mt-0.5">Manage your categories and menu items</p>
      </div>

      {/* Category carousel */}
      <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveCat(null)}
          className={cn("px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap flex-shrink-0",
            activeCat === null ? "bg-primary text-white" : "bg-white border border-gray-200")}
        >
          All ({menuItems.length})
        </button>
        {categories.map(cat => (
          <div key={cat.id} className="relative flex-shrink-0 group">
            <button
              onClick={() => setActiveCat(cat.id)}
              className={cn("pl-4 pr-7 py-2 rounded-xl text-sm font-semibold whitespace-nowrap",
                activeCat === cat.id ? "bg-primary text-white" : "bg-white border border-gray-200")}
            >
              {cat.name} ({menuItems.filter(i => i.category_id === cat.id).length})
            </button>
            <button
              onClick={e => { e.stopPropagation(); deleteCategory(cat.id) }}
              title={`Delete ${cat.name}`}
              className={cn("absolute top-1/2 right-1.5 -translate-y-1/2 w-4 h-4 rounded-full flex items-center justify-center",
                activeCat === cat.id ? "text-white/70 hover:text-white" : "text-gray-400 hover:text-red-600")}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <button
          onClick={() => setShowAddCategory(true)}
          className="flex-shrink-0 px-3 py-2 rounded-xl text-sm font-semibold whitespace-nowrap border-2 border-dashed border-gray-300 text-gray-500 hover:border-primary hover:text-primary flex items-center gap-1"
        >
          <Plus className="w-4 h-4" /> Category
        </button>
      </div>

      {/* Search + veg filter */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            placeholder="Search items..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-primary"
          />
        </div>
        {(["all", "veg", "nonveg"] as const).map(f => (
          <button key={f} onClick={() => setVegFilter(f)}
            className={cn("px-3 py-2 rounded-lg text-xs font-semibold border flex-shrink-0",
              vegFilter === f
                ? f === "veg" ? "bg-green-600 text-white border-green-600"
                : f === "nonveg" ? "bg-red-600 text-white border-red-600"
                : "bg-primary text-white border-primary"
                : "bg-white border-gray-200"
            )}>
            {f === "all" ? "All" : f === "veg" ? "🟢 Veg" : "🔴 Non-veg"}
          </button>
        ))}
      </div>

      {/* Item grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {filtered.map(item => {
          const tagged = !!(item.dietary_type && item.spice_level != null)
          return (
            <div key={item.id} className="relative bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
              {!( item.available ?? true) && (
                <span className="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-100">
                  Out of stock
                </span>
              )}

              <div className="h-14 flex items-center justify-center bg-gray-100 rounded-lg mb-2 text-xl">
                {item.is_veg ? "🥗" : "🍖"}
              </div>

              <div className="flex items-center gap-1 mb-0.5">
                <span className={cn("w-2 h-2 rounded-full flex-shrink-0", item.is_veg ? "bg-green-500" : "bg-red-500")} />
                <span className="text-sm font-semibold truncate">{item.name}</span>
              </div>
              <p className="text-brand-accent font-bold text-sm mb-2">
                ₹{item.price}{item.price_includes_tax && <span className="text-[10px] font-medium text-gray-400"> incl. tax</span>}
              </p>

              <div className="flex items-center gap-1 pt-2 border-t border-gray-100">
                <button
                  onClick={() => toggleAvailability(item.id, item.available ?? true)}
                  title={(item.available ?? true) ? "Mark out of stock" : "Mark available"}
                  className={cn("flex-1 text-[11px] font-semibold py-1.5 rounded-md border",
                    (item.available ?? true) ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-500 border-gray-200")}
                >
                  {(item.available ?? true) ? "Available" : "Unavailable"}
                </button>
                <button
                  onClick={() => setTaggingItem(item)}
                  title={tagged ? "Edit Taste Palette tags" : "Add Taste Palette tags"}
                  className={cn("w-7 h-7 flex items-center justify-center rounded-md border flex-shrink-0",
                    tagged ? "bg-primary/10 text-primary border-primary/30" : "bg-amber-50 text-amber-600 border-amber-200")}
                >
                  <Tag className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => deleteMenuItem(item.id)}
                  title="Delete item"
                  className="w-7 h-7 flex items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-600 flex-shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )
        })}

        {/* Add item tile */}
        <button
          onClick={openAddItem}
          className="min-h-[148px] rounded-xl border-2 border-dashed border-gray-300 text-gray-400 hover:border-primary hover:text-primary flex flex-col items-center justify-center gap-1 transition-colors"
        >
          <Plus className="w-6 h-6" />
          <span className="text-xs font-semibold">Add Item</span>
        </button>
      </div>

      {filtered.length === 0 && menuItems.length > 0 && (
        <p className="text-center text-gray-400 text-sm py-8">No items match this filter</p>
      )}
      {categories.length === 0 && (
        <p className="text-center text-gray-400 text-sm py-8">No categories yet — add one to get started</p>
      )}

      {/* Add Category dialog */}
      <Dialog open={showAddCategory} onOpenChange={setShowAddCategory}>
        <DialogContent className="w-full max-w-sm p-5">
          <h3 className="font-bold text-base mb-3">Add Category</h3>
          <input
            autoFocus
            placeholder="e.g. Steam Momos, Drinks..."
            value={newCategoryName}
            onChange={e => setNewCategoryName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAddCategory()}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-primary mb-3"
          />
          <div className="flex gap-2">
            <button onClick={() => setShowAddCategory(false)} className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600">
              Cancel
            </button>
            <button onClick={handleAddCategory} disabled={!newCategoryName.trim()}
              className="flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-bold disabled:opacity-40">
              Add
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Item dialog */}
      <Dialog open={showAddItem} onOpenChange={setShowAddItem}>
        <DialogContent className="w-full max-w-sm p-5 max-h-[85vh] overflow-y-auto">
          <h3 className="font-bold text-base mb-3">Add Item</h3>

          <label className="text-xs font-semibold block mb-1.5">Item Name *</label>
          <input
            autoFocus
            placeholder="e.g. Steam Chicken Momos"
            value={newItemName}
            onChange={e => setNewItemName(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-primary mb-3"
          />

          <label className="text-xs font-semibold block mb-1.5">Price (₹) *</label>
          <input
            type="number"
            placeholder="120"
            value={newItemPrice}
            onChange={e => setNewItemPrice(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-primary mb-3"
          />

          <label className="text-xs font-semibold block mb-1.5">Category *</label>
          <select
            value={newItemCategory}
            onChange={e => setNewItemCategory(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-primary mb-3 bg-white"
          >
            <option value="">Select a category</option>
            {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
          </select>

          <label className="text-xs font-semibold block mb-1.5">Type</label>
          <div className="flex gap-2 mb-3">
            {([true, false] as const).map(isVeg => (
              <button key={String(isVeg)} type="button" onClick={() => setNewItemIsVeg(isVeg)}
                className={cn("flex-1 py-2 rounded-lg border-[1.5px] text-sm font-semibold",
                  newItemIsVeg === isVeg
                    ? isVeg ? "bg-green-50 border-green-500 text-green-600" : "bg-red-50 border-red-500 text-red-600"
                    : "border-gray-200 text-gray-600")}
              >
                {isVeg ? "🟢 Veg" : "🔴 Non-veg"}
              </button>
            ))}
          </div>

          <label className="text-xs font-semibold block mb-1.5">Price entered above is</label>
          <div className="flex gap-2 mb-1.5">
            {([false, true] as const).map(included => (
              <button key={String(included)} type="button" onClick={() => setNewItemTaxIncluded(included)}
                className={cn("flex-1 py-2 rounded-lg border-[1.5px] text-xs font-semibold",
                  newItemTaxIncluded === included ? "bg-primary border-primary text-white" : "border-gray-200 text-gray-600")}
              >
                {included ? "Tax included" : "Tax excluded"}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mb-4">
            {newItemTaxIncluded ? "GST is backed out of this price in the cart breakdown." : "GST is added on top of this price in the cart breakdown."}
          </p>

          <div className="flex gap-2">
            <button onClick={() => setShowAddItem(false)} className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600">
              Cancel
            </button>
            <button onClick={handleAddItem} disabled={!newItemName || !newItemPrice || !newItemCategory}
              className="flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-bold disabled:opacity-40">
              Add to Menu
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
