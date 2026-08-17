import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"

export type POSMode = "SELF_SERVICE" | "TABLE_SERVICE"

export type POSFeatures = {
  tables: boolean
  orderEdit: boolean
  tokenSystem: boolean
  orderNotes: boolean
}

export type TableEntry = {
  id: string
  name: string
  seats: number
  status: "available" | "occupied"
}

const getOutletId = (): string => {
  try {
    const profile = JSON.parse(localStorage.getItem("praang_profile") || "{}")
    return profile?.outlet_id ?? "demo-outlet"
  } catch {
    return "demo-outlet"
  }
}

export const usePOSConfig = (initialMode: POSMode = "SELF_SERVICE") => {
  const [mode, setMode] = useState<POSMode>(initialMode)
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [orderType, setOrderType] = useState<"DINE_IN" | "TAKEAWAY" | "ON_THE_GO">("DINE_IN")
  const [orderNotes, setOrderNotes] = useState("")

  // ── Tables from Supabase, fallback to defaults ───────────────────
  const [tables, setTables] = useState<TableEntry[]>([
    { id: "T1", name: "Table 1", seats: 2, status: "available" },
    { id: "T2", name: "Table 2", seats: 4, status: "available" },
    { id: "T3", name: "Table 3", seats: 4, status: "available" },
    { id: "T4", name: "Table 4", seats: 2, status: "available" },
    { id: "T5", name: "Table 5", seats: 6, status: "available" },
    { id: "T6", name: "Table 6", seats: 4, status: "available" },
  ])

  const fetchTables = useCallback(async () => {
    const { data, error } = await supabase
      .from("tables")
      .select("*")
      .eq("outlet_id", getOutletId())
      .order("name", { ascending: true })

    if (error || !data || data.length === 0) return // keep defaults
    setTables(data)
  }, [])

  // Load settings from Supabase (posMode persisted)
  const fetchSettings = useCallback(async () => {
    const { data } = await supabase
      .from("outlet_settings")
      .select("settings")
      .eq("outlet_id", getOutletId())
      .single()

    if (data?.settings?.posMode) {
      setMode(data.settings.posMode as POSMode)
    }
  }, [])

  useEffect(() => {
    fetchTables()
    fetchSettings()
  }, [fetchTables, fetchSettings])

  // ── Update table status in Supabase ─────────────────────────────
  const updateTableStatus = async (tableId: string, status: "available" | "occupied") => {
    setTables(prev => prev.map(t => t.id === tableId ? { ...t, status } : t))
    await supabase
      .from("tables")
      .update({ status })
      .eq("id", tableId)
  }

  // ── Features derived from mode ───────────────────────────────────
  const features: POSFeatures = {
    tables: mode === "TABLE_SERVICE",
    orderEdit: mode === "TABLE_SERVICE",
    tokenSystem: mode === "SELF_SERVICE",
    orderNotes: mode === "TABLE_SERVICE",
  }

  const canPlaceOrder = (cartLength: number) => {
    if (cartLength === 0) return false
    if (mode === "TABLE_SERVICE" && !selectedTable) return false
    return true
  }

  const resetTableState = () => {
    // Mark table as available again after order collected
    if (selectedTable) updateTableStatus(selectedTable, "available")
    setSelectedTable(null)
    setOrderType("DINE_IN")
    setOrderNotes("")
  }

  return {
    mode, setMode,
    features,
    selectedTable, setSelectedTable,
    orderType, setOrderType,
    orderNotes, setOrderNotes,
    tables, setTables,
    canPlaceOrder,
    resetTableState,
    updateTableStatus,
    fetchTables,
  }
}
