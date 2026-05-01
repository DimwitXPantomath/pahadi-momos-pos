import { useState } from "react"

export type POSMode = "SELF_SERVICE" | "TABLE_SERVICE"

export type POSFeatures = {
  tables: boolean
  orderEdit: boolean
  tokenSystem: boolean
  orderNotes: boolean
}

export type TableEntry = {
  id: string
  seats: number
  status: "available" | "occupied"
}

export const usePOSConfig = (initialMode: POSMode = "SELF_SERVICE") => {
  const [mode, setMode] = useState<POSMode>(initialMode)
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [orderType, setOrderType] = useState<"DINE_IN" | "TAKEAWAY">("DINE_IN")
  const [orderNotes, setOrderNotes] = useState("")
  const [tables, setTables] = useState<TableEntry[]>([
    { id: "T1", seats: 2, status: "available" },
    { id: "T2", seats: 4, status: "available" },
    { id: "T3", seats: 4, status: "occupied" },
    { id: "T4", seats: 2, status: "available" },
    { id: "T5", seats: 6, status: "occupied" },
    { id: "T6", seats: 4, status: "available" },
  ])

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
    setSelectedTable(null)
    setOrderType("DINE_IN")
    setOrderNotes("")
  }

  const updateTableStatus = (tableId: string, status: "available" | "occupied") => {
    setTables(prev =>
      prev.map(t => t.id === tableId ? { ...t, status } : t)
    )
  }

  return {
    mode,
    setMode,
    features,
    selectedTable,
    setSelectedTable,
    orderType,
    setOrderType,
    orderNotes,
    setOrderNotes,
    tables,
    setTables,
    canPlaceOrder,
    resetTableState,
    updateTableStatus,
  }
}
