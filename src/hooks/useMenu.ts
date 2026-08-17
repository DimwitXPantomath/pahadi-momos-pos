import { useState, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import type { MenuItem } from "@/types/pos"
import { useConfirm } from "@/components/ConfirmDialog"

export const useMenu = () => {
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm()
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [mostOrdered, setMostOrdered] = useState<MenuItem[]>([])

  // ── Form state ───────────────────────────────────────────────────
  const [newItemName, setNewItemName] = useState("")
  const [newItemPrice, setNewItemPrice] = useState("")
  const [newItemCategory, setNewItemCategory] = useState("")
  const [newItemIsVeg, setNewItemIsVeg] = useState(true)
  // false = price typed above is exclusive of GST (existing behavior, added
  // on top at cart time). true = the typed price already includes GST.
  const [newItemTaxIncluded, setNewItemTaxIncluded] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState("")

  // ── UI state ─────────────────────────────────────────────────────
  const [activeCategory, setActiveCategory] = useState<string>("")
  const [manageCategory, setManageCategory] = useState<string | null>(null)
  const [manageTab, setManageTab] = useState<"categories" | "items">("categories")
  const [searchQuery, setSearchQuery] = useState("")
  const [vegFilter, setVegFilter] = useState<"all" | "veg" | "nonveg">("all")

  // ── Fetch menu items ─────────────────────────────────────────────
  const fetchMenu = useCallback(async () => {
    const { data, error } = await supabase
      .from("menu_items")
      .select("*")
      .order("created_at", { ascending: true })

    if (error) {
      console.error("Menu fetch error:", error)
      return
    }

    if (data) setMenuItems(data.map((i: any) => ({ ...i, available: i.available ?? true })))
  }, [])

  // ── Fetch categories ─────────────────────────────────────────────
  const fetchCategories = useCallback(async () => {
    const { data, error } = await supabase
      .from("categories")
      .select("id, name")
      .order("created_at", { ascending: true })

    if (error) {
      console.error("Categories fetch error:", error)
      return
    }

    if (data) setCategories(data)
  }, [])

  // ── Fetch most ordered ───────────────────────────────────────────
  const fetchMostOrdered = useCallback(async () => {
    const { data, error } = await supabase
      .from("order_items")
      .select("item_id, quantity")

    if (error) {
      console.error("Most ordered fetch error:", error)
      return
    }

    if (!data) return

    const counts: Record<string, number> = {}
    data.forEach(row => {
      counts[row.item_id] = (counts[row.item_id] || 0) + row.quantity
    })

    const sorted = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => menuItems.find(m => m.id === id))
      .filter(Boolean) as MenuItem[]

    setMostOrdered(sorted)
  }, [menuItems])

  // ── Add menu item ────────────────────────────────────────────────
  const addMenuItem = async () => {
    if (!newItemName || !newItemPrice || !newItemCategory) {
      alert("Fill all fields")
      return
    }

    const { data, error } = await supabase
      .from("menu_items")
      .insert({
        name: newItemName,
        price: Number(newItemPrice),
        category_id: newItemCategory,
        available: true,
        is_veg: newItemIsVeg,
        price_includes_tax: newItemTaxIncluded,
      })
      .select()
      .single()

    if (!error && data) {
      setMenuItems(prev => [...prev, data])
      setNewItemName("")
      setNewItemPrice("")
      setNewItemCategory("")
      setNewItemTaxIncluded(false)
    } else {
      console.error("Add item error:", error)
      alert("Could not add item: " + error?.message)
    }
  }

  // ── Add category ─────────────────────────────────────────────────
  const addCategory = async () => {
    const trimmed = newCategoryName.trim()
    if (!trimmed) {
      alert("Please type a category name first")
      return
    }

    const exists = categories.find(c => c.name.toLowerCase() === trimmed.toLowerCase())
    if (exists) {
      alert("This category already exists")
      return
    }

    const { data, error } = await supabase
      .from("categories")
      .insert({ name: trimmed })
      .select("id, name")

    if (error) {
      alert("Error adding category: " + error.message)
      return
    }

    if (data && data.length > 0) {
      setCategories(prev => [...prev, data[0]])
      setNewCategoryName("")
    } else {
      await fetchCategories()
      setNewCategoryName("")
    }
  }

  // ── Delete category ──────────────────────────────────────────────
  const deleteCategory = async (id: string) => {
    const cat = categories.find(c => c.id === id)
    const itemCount = menuItems.filter(i => i.category_id === id).length

    const ok = await confirm({
      title: "Delete Category",
      message: itemCount > 0
        ? `"${cat?.name}" has ${itemCount} item${itemCount > 1 ? "s" : ""}. Deleting it may affect those items. Are you sure?`
        : `Are you sure you want to delete "${cat?.name}"?`,
      confirmLabel: "Delete",
      cancelLabel: "Keep",
      danger: true,
    })

    if (!ok) return

    const { error } = await supabase
      .from("categories")
      .delete()
      .eq("id", id)

    if (error) {
      alert("Could not delete category: " + error.message)
      return
    }

    setCategories(prev => prev.filter(c => c.id !== id))
  }

  // ── Delete menu item ─────────────────────────────────────────────
  const deleteMenuItem = async (id: string) => {
    const item = menuItems.find(m => m.id === id)

    const ok = await confirm({
      title: "Delete Menu Item",
      message: `Are you sure you want to delete "${item?.name}"? This cannot be undone.`,
      confirmLabel: "Delete",
      cancelLabel: "Keep",
      danger: true,
    })

    if (!ok) return

    const { error } = await supabase
      .from("menu_items")
      .delete()
      .eq("id", id)

    if (error) {
      alert("Could not delete item: " + error.message)
      return
    }

    setMenuItems(prev => prev.filter(m => m.id !== id))
  }

  // ── Toggle availability ──────────────────────────────────────────
  const toggleAvailability = async (id: string, current: boolean) => {
    const { data, error } = await supabase
      .from("menu_items")
      .update({ available: !current })
      .eq("id", id)
      .select()
      .single()

    if (!error && data) {
      setMenuItems(prev =>
        prev.map(item => item.id === id ? data : item)
      )
    }
  }

  // ── Filtered menu for display ────────────────────────────────────
  const filteredMenu = menuItems.filter(item => {
    if (activeCategory && activeCategory !== "all" && item.category_id !== activeCategory) return false
    if (!(item.available ?? true)) return false
    if (vegFilter === "veg" && !item.is_veg) return false
    if (vegFilter === "nonveg" && item.is_veg) return false
    if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  return {
    // Confirm dialog
    confirmState,
    handleConfirm,
    handleCancel,

    // Data
    menuItems,
    setMenuItems,
    categories,
    setCategories,
    mostOrdered,
    filteredMenu,

    // Form state
    newItemName, setNewItemName,
    newItemPrice, setNewItemPrice,
    newItemCategory, setNewItemCategory,
    newItemIsVeg, setNewItemIsVeg,
    newItemTaxIncluded, setNewItemTaxIncluded,
    newCategoryName, setNewCategoryName,

    // UI state
    activeCategory, setActiveCategory,
    manageCategory, setManageCategory,
    manageTab, setManageTab,
    searchQuery, setSearchQuery,
    vegFilter, setVegFilter,

    // Actions
    fetchMenu,
    fetchCategories,
    fetchMostOrdered,
    addMenuItem,
    addCategory,
    deleteCategory,
    deleteMenuItem,
    toggleAvailability,
  }
}
