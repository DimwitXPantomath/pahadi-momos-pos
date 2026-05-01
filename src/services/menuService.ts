import { supabase } from "@/lib/supabase"
import type { MenuItem } from "@/types/pos"

// ── Menu items ────────────────────────────────────────────────────

export const fetchMenuItems = async (): Promise<MenuItem[]> => {
  const { data, error } = await supabase
    .from("menu_items")
    .select("*")
    .order("created_at", { ascending: true })

  if (error) {
    console.error("Fetch menu error:", error)
    return []
  }

  return data ?? []
}

export const addMenuItem = async (item: {
  name: string
  price: number
  category_id: string
  is_veg: boolean
  available?: boolean
}): Promise<MenuItem | null> => {
  const { data, error } = await supabase
    .from("menu_items")
    .insert({ ...item, available: item.available ?? true })
    .select()
    .single()

  if (error) {
    console.error("Add menu item error:", error)
    return null
  }

  return data
}

export const deleteMenuItem = async (id: string): Promise<boolean> => {
  const { error } = await supabase
    .from("menu_items")
    .delete()
    .eq("id", id)

  if (error) {
    console.error("Delete menu item error:", error)
    return false
  }

  return true
}

export const toggleMenuItemAvailability = async (
  id: string,
  current: boolean
): Promise<MenuItem | null> => {
  const { data, error } = await supabase
    .from("menu_items")
    .update({ available: !current })
    .eq("id", id)
    .select()
    .single()

  if (error) {
    console.error("Toggle availability error:", error)
    return null
  }

  return data
}

export const updateMenuItem = async (
  id: string,
  updates: Partial<MenuItem>
): Promise<MenuItem | null> => {
  const { data, error } = await supabase
    .from("menu_items")
    .update(updates)
    .eq("id", id)
    .select()
    .single()

  if (error) {
    console.error("Update menu item error:", error)
    return null
  }

  return data
}

// ── Categories ────────────────────────────────────────────────────

export const fetchCategories = async (): Promise<{ id: string; name: string }[]> => {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name")
    .order("created_at", { ascending: true })

  if (error) {
    console.error("Fetch categories error:", error)
    return []
  }

  return data ?? []
}

export const addCategory = async (
  name: string
): Promise<{ id: string; name: string } | null> => {
  const { data, error } = await supabase
    .from("categories")
    .insert({ name })
    .select("id, name")

  if (error) {
    console.error("Add category error:", error)
    return null
  }

  return data?.[0] ?? null
}

export const deleteCategory = async (id: string): Promise<boolean> => {
  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", id)

  if (error) {
    console.error("Delete category error:", error)
    return false
  }

  return true
}
