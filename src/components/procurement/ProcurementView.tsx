import React, { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import PurchaseSheetTab from "./PurchaseSheetTab"
import { PROCUREMENT_CATEGORIES, categoryColor } from "@/lib/procurementCategories"
import { parseDbTimestamp } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

type Ingredient    = { id: string; name: string; unit: string; category: string | null }
type Vendor        = { id: string; name: string; phone: string; category: string | null }
type ProcurementRequest = {
  id: string; status: string; created_at: string; note: string
  vendor_id: string | null; vendors?: Vendor
}
type ProcurementItem = {
  id: string; request_id: string; ingredient_id: string
  requested_qty: number; confirmed_qty: number | null
  price_per_unit: number | null; is_available: boolean | null
  ingredients?: Ingredient
}

// Receive-tab specific
type IngredientDetails = {
  id: string; name: string; unit: string
  purchase_unit: string; units_per_purchase: number
  yield_percentage: number; usage_unit: string
}
type ReceiveItem = {
  id: string; request_id: string; ingredient_id: string
  requested_qty: number; status: string | null
  received_qty: number | null; actual_cost: number | null
  received_at: string | null; carry_forward_qty: number | null
  ingredients?: IngredientDetails
}
type ReceiveRequest = {
  id: string; vendor_id: string; status: string
  created_at: string; note: string
  vendors?: { id: string; name: string }
  procurement_items?: ReceiveItem[]
}

// ─── Style constants ──────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page:     { maxWidth: 1000, margin: "0 auto" },
  header:   { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  title:    { fontSize: 22, fontWeight: 800, color: "#111", margin: 0 },
  card:     { background: "white", border: "1px solid #e5e7eb", borderRadius: 12, padding: "20px 24px", marginBottom: 16 },
  cardTitle:{ fontWeight: 700, fontSize: 15, margin: "0 0 16px" },
  table:    { width: "100%", borderCollapse: "collapse" as const },
  th:       { textAlign: "left" as const, padding: "8px 12px", fontSize: 12, fontWeight: 600, color: "#6b7280", borderBottom: "1px solid #e5e7eb" },
  td:       { padding: "8px 12px", fontSize: 13, borderBottom: "1px solid #f3f4f6", color: "#111" },
  input:    { padding: "6px 10px", border: "1.5px solid #e5e7eb", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" as const },
  btn:      { padding: "8px 16px", background: "hsl(var(--primary))", color: "white", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  btnSm:    { padding: "4px 10px", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" },
  badge:    { padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600 },
  overlay:  { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 },
  modal:    { background: "white", borderRadius: 14, padding: "28px 24px", maxWidth: 420, width: "92%", textAlign: "center" as const },
}

const statusColor: Record<string, { bg: string; color: string }> = {
  draft:              { bg: "#f3f4f6", color: "#6b7280" },
  sent:               { bg: "#eff6ff", color: "#1d4ed8" },
  responded:          { bg: "#fffbeb", color: "#d97706" },
  confirmed:          { bg: "#f0fdf4", color: "#16a34a" },
  completed:          { bg: "#f0fdf4", color: "#16a34a" },
  partially_received: { bg: "#fff7ed", color: "#ea580c" },
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProcurementView() {
  const [tab, setTab] = useState<"requests" | "vendors" | "receive" | "new" | "purchase_sheet">("requests")

  // Existing tabs state
  const [requests, setRequests]     = useState<ProcurementRequest[]>([])
  const [vendors, setVendors]       = useState<Vendor[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [selectedReq, setSelectedReq] = useState<ProcurementRequest | null>(null)
  const [reqItems, setReqItems]     = useState<ProcurementItem[]>([])
  const [loadingMain, setLoadingMain] = useState(false)

  // New request form
  const [rows, setRows]       = useState([{ ingredient_id: "", qty: "" }])
  const [reqNote, setReqNote] = useState("")
  const [reqVendor, setReqVendor] = useState("")

  // Vendor form
  const [vName, setVName] = useState("")
  const [vPhone, setVPhone] = useState("")
  const [vCategory, setVCategory] = useState("")

  // Receive tab state
  const [receiveReqs, setReceiveReqs]     = useState<ReceiveRequest[]>([])
  const [receiveInputs, setReceiveInputs] = useState<Record<string, { qty: string; paid: string }>>({})
  const [vendorFilter, setVendorFilter]   = useState("all")
  const [showCompleted, setShowCompleted] = useState(false)
  const [confirming, setConfirming]       = useState<string | null>(null)   // request id being processed
  const [confirmReqId, setConfirmReqId]   = useState<string | null>(null)   // confirm dialog
  const [receiveMsg, setReceiveMsg]       = useState("")

  // ── Load (main tabs) ────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const [{ data: r }, { data: v }, { data: i }] = await Promise.all([
      supabase.from("procurement_requests")
        .select("*, vendors(name, phone)")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("vendors").select("*").order("name"),
      supabase.from("ingredients").select("id, name, unit, category").order("name"),
    ])
    if (r) setRequests(r as any)
    if (v) setVendors(v)
    if (i) setIngredients(i)
  }, [])

  // ── Load (receive tab) ──────────────────────────────────────────────────────
  const loadReceive = useCallback(async () => {
    const { data } = await supabase
      .from("procurement_requests")
      .select(`
        *,
        vendors(id, name),
        procurement_items(
          *,
          ingredients(id, name, unit, purchase_unit, units_per_purchase, yield_percentage, usage_unit)
        )
      `)
      .in("status", ["sent", "responded", "confirmed", "completed", "partially_received"])
      .order("created_at", { ascending: true })
    if (data) setReceiveReqs(data as any)
  }, [])

  useEffect(() => { load() }, [load])

  // Pick up items queued by IngredientsPage's Reorder Alerts tab
  // ("Approve Selected → Create Procurement Order"). localStorage, not
  // React state/props, because Index.tsx unmounts this whole component
  // when the main view isn't "procurement" — any in-memory handoff
  // would be lost by the time the user actually lands here.
  useEffect(() => {
    const raw = localStorage.getItem("praang_pending_procurement_items")
    if (!raw) return
    localStorage.removeItem("praang_pending_procurement_items")
    try {
      const items = JSON.parse(raw) as { ingredient_id: string; qty: number }[]
      if (Array.isArray(items) && items.length > 0) {
        setRows(items.map(i => ({ ingredient_id: i.ingredient_id, qty: String(i.qty) })))
        setReqNote("Reorder — from low stock alert")
        setTab("new")
      }
    } catch (e) {
      console.error("Failed to parse queued procurement items:", e)
    }
  }, [])
  useEffect(() => { if (tab === "receive") loadReceive() }, [tab, loadReceive])

  // ── Existing tab helpers ────────────────────────────────────────────────────
  const loadReqItems = async (req: ProcurementRequest) => {
    setSelectedReq(req)
    const { data } = await supabase
      .from("procurement_items")
      .select("*, ingredients(name, unit)")
      .eq("request_id", req.id)
    if (data) setReqItems(data as any)
  }

  // Vendor's category, if any — drives ingredient-picker filtering below.
  const selectedVendor = vendors.find(v => v.id === reqVendor) || null
  const vendorCategory = selectedVendor?.category ?? null
  const ingredientOptions = vendorCategory
    ? ingredients.filter(i => i.category === vendorCategory)
    : ingredients

  const onSelectReqVendor = (vendorId: string) => {
    setReqVendor(vendorId)
    const v = vendors.find(x => x.id === vendorId)
    const cat = v?.category ?? null
    if (!cat) return
    // Vendor has a category — drop any already-picked ingredient that
    // doesn't belong to it rather than silently leaving a mismatched
    // row that the (now-filtered) dropdown wouldn't even offer anymore.
    setRows(prev => prev.map(r => {
      if (!r.ingredient_id) return r
      const ing = ingredients.find(i => i.id === r.ingredient_id)
      return ing && ing.category !== cat ? { ...r, ingredient_id: "" } : r
    }))
  }

  const createRequest = async () => {
    const valid = rows.filter(r => r.ingredient_id && r.qty)
    if (!valid.length) { alert("Add at least one ingredient"); return }
    setLoadingMain(true)

    if (reqVendor) {
      // Vendor explicitly picked — one request, as before. The picker was
      // already restricted to the vendor's category (if it has one), so
      // there's nothing to segregate.
      const { data: req } = await supabase
        .from("procurement_requests")
        .insert({ status: "draft", note: reqNote, vendor_id: reqVendor })
        .select().single()
      if (req) {
        await supabase.from("procurement_items").insert(
          valid.map(r => ({ request_id: req.id, ingredient_id: r.ingredient_id, requested_qty: Number(r.qty) }))
        )
      }
    } else {
      // No vendor picked — items were added freely from the full
      // ingredient list, so split into one draft request per category
      // (uncategorized items land together under "Uncategorized").
      // Each draft lands with vendor_id null; staff assign a vendor per
      // group afterward from the Requests tab.
      const groups = new Map<string, typeof valid>()
      for (const r of valid) {
        const ing = ingredients.find(i => i.id === r.ingredient_id)
        const cat = ing?.category || "Uncategorized"
        const list = groups.get(cat) || []
        list.push(r)
        groups.set(cat, list)
      }
      for (const [cat, groupRows] of groups) {
        const note = groups.size > 1
          ? (reqNote ? `${reqNote} — ${cat}` : `${cat} items`)
          : reqNote
        const { data: req } = await supabase
          .from("procurement_requests")
          .insert({ status: "draft", note, vendor_id: null })
          .select().single()
        if (req) {
          await supabase.from("procurement_items").insert(
            groupRows.map(r => ({ request_id: req.id, ingredient_id: r.ingredient_id, requested_qty: Number(r.qty) }))
          )
        }
      }
    }

    setRows([{ ingredient_id: "", qty: "" }])
    setReqNote(""); setReqVendor("")
    setLoadingMain(false); setTab("requests"); load()
  }

  const sendToVendor = async (id: string) => {
    await supabase.from("procurement_requests").update({ status: "sent" }).eq("id", id)
    load()
    if (selectedReq?.id === id) setSelectedReq(prev => prev ? { ...prev, status: "sent" } : null)
  }

  const confirmRequest = async (id: string) => {
    const confirmed = reqItems.filter(i => i.is_available && i.confirmed_qty)
    await Promise.all(confirmed.map(async item => {
      const { data: stock } = await supabase.from("inventory_stock")
        .select("current_quantity").eq("ingredient_id", item.ingredient_id).single()
      const current = stock?.current_quantity ?? 0
      await supabase.from("inventory_stock")
        .upsert({ ingredient_id: item.ingredient_id, current_quantity: current + (item.confirmed_qty ?? 0) })
      await supabase.from("inventory_logs").insert({
        ingredient_id: item.ingredient_id, change: item.confirmed_qty,
        type: "purchase", reference_id: id,
      })
    }))
    await supabase.from("procurement_requests").update({ status: "completed" }).eq("id", id)
    load(); setSelectedReq(null)
  }

  const updateItemResponse = async (itemId: string, field: string, value: any) => {
    await supabase.from("procurement_items").update({ [field]: value }).eq("id", itemId)
    setReqItems(prev => prev.map(i => i.id === itemId ? { ...i, [field]: value } : i))
    if (selectedReq) {
      await supabase.from("procurement_requests").update({ status: "responded" }).eq("id", selectedReq.id)
    }
  }

  const addVendor = async () => {
    if (!vName.trim()) return
    await supabase.from("vendors").insert({ name: vName, phone: vPhone, category: vCategory || null })
    setVName(""); setVPhone(""); setVCategory(""); load()
  }

  // ── Receive tab helpers ─────────────────────────────────────────────────────
  const flash = (msg: string) => {
    setReceiveMsg(msg)
    setTimeout(() => setReceiveMsg(""), 4000)
  }

  const validateAndConfirm = (req: ReceiveRequest) => {
    const items = req.procurement_items || []
    for (const item of items) {
      const inp = receiveInputs[item.id]
      const qty  = parseFloat(inp?.qty  || "0") || 0
      const paid = parseFloat(inp?.paid || "0") || 0
      if (qty > 0 && paid === 0) {
        flash(`Enter total paid amount for ${item.ingredients?.name || "all items"}`)
        return
      }
    }
    setConfirmReqId(req.id)
  }

  const doMarkReceived = async (reqId: string) => {
    setConfirmReqId(null)
    const req = receiveReqs.find(r => r.id === reqId)
    if (!req) return
    setConfirming(reqId)

    const items = req.procurement_items || []
    let receivedCount = 0
    let anyShortfall  = false

    for (const item of items) {
      const inp         = receiveInputs[item.id]
      const receivedQty = parseFloat(inp?.qty  || "0") || 0
      const totalPaid   = parseFloat(inp?.paid || "0") || 0
      const ing         = item.ingredients

      if (receivedQty === 0) {
        // Nothing received — carry forward entire qty
        await supabase.from("procurement_items").update({
          received_qty: 0, actual_cost: 0,
          received_at: new Date().toISOString(),
          status: "partial",
          carry_forward_qty: item.requested_qty,
        }).eq("id", item.id)
        anyShortfall = true
        continue
      }

      const unitsPerPurchase = ing?.units_per_purchase || 1
      const yieldPct         = ing?.yield_percentage   || 100
      const usable           = receivedQty * unitsPerPurchase * (yieldPct / 100)
      const costPerUsageUnit = usable > 0 && totalPaid > 0 ? totalPaid / usable : 0

      // 1. Update inventory_stock
      const { data: stock } = await supabase
        .from("inventory_stock")
        .select("current_quantity")
        .eq("ingredient_id", item.ingredient_id)
        .single()
      await supabase.from("inventory_stock").upsert({
        ingredient_id: item.ingredient_id,
        current_quantity: (stock?.current_quantity ?? 0) + usable,
      })

      // 2. Insert inventory_log
      await supabase.from("inventory_logs").insert({
        ingredient_id: item.ingredient_id,
        change:        usable,
        type:          "purchase",
        reference_id:  req.id,
        note:          `Received ${receivedQty} ${ing?.purchase_unit || "units"} from vendor`,
      })

      // 3. Insert price history
      if (totalPaid > 0) {
        await supabase.from("ingredient_price_history").insert({
          ingredient_id:      item.ingredient_id,
          vendor_id:          req.vendor_id,
          procurement_id:     req.id,
          purchase_date:      new Date().toISOString().split("T")[0],
          quantity_received:  receivedQty,
          total_cost:         totalPaid,
          cost_per_usage_unit: costPerUsageUnit,
          outlet_id:          "demo-outlet",
        })
      }

      // 4. Update ingredient cost
      if (costPerUsageUnit > 0) {
        await supabase.from("ingredients").update({
          cost_per_usage_unit:  costPerUsageUnit,
          last_purchase_cost:   costPerUsageUnit,
        }).eq("id", item.ingredient_id)
      }

      // 5. Update procurement item
      const shortfall = receivedQty < item.requested_qty
      if (shortfall) anyShortfall = true
      await supabase.from("procurement_items").update({
        received_qty:      receivedQty,
        actual_cost:       totalPaid,
        received_at:       new Date().toISOString(),
        status:            shortfall ? "partial" : "received",
        carry_forward_qty: Math.max(0, item.requested_qty - receivedQty),
      }).eq("id", item.id)

      receivedCount++
    }

    // 6. Update request status
    await supabase.from("procurement_requests").update({
      status: anyShortfall ? "partially_received" : "completed",
    }).eq("id", req.id)

    setConfirming(null)
    setReceiveInputs({})
    flash(`✅ Stock updated for ${receivedCount} ingredient${receivedCount !== 1 ? "s" : ""}`)
    await loadReceive()
  }

  // ── Receive tab derived data ─────────────────────────────────────────────────
  const allVendors = receiveReqs.reduce((acc: { id: string; name: string }[], req) => {
    const v = req.vendors
    if (v && !acc.find(x => x.id === v.id)) acc.push({ id: v.id, name: v.name })
    return acc
  }, [])

  const filteredReqs = vendorFilter === "all"
    ? receiveReqs
    : receiveReqs.filter(r => r.vendors?.id === vendorFilter)

  const pendingOrders = filteredReqs
    .filter(r => !["completed", "partially_received"].includes(r.status))
    .sort((a, b) => parseDbTimestamp(a.created_at).getTime() - parseDbTimestamp(b.created_at).getTime())

  const completedOrders = filteredReqs
    .filter(r => ["completed", "partially_received"].includes(r.status))
    .sort((a, b) => {
      const aT = Math.max(...(a.procurement_items || []).map(i => i.received_at ? new Date(i.received_at).getTime() : 0), 0)
      const bT = Math.max(...(b.procurement_items || []).map(i => i.received_at ? new Date(i.received_at).getTime() : 0), 0)
      return bT - aT
    })

  const daysAgo = (dateStr: string) => {
    const d = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
    return d === 0 ? "today" : `${d} day${d !== 1 ? "s" : ""} ago`
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      {/* Header + Tab bar */}
      <div style={s.header}>
        <h2 style={s.title}>Procurement</h2>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {([
            ["requests", "All Requests"],
            ["vendors",  "Vendors"],
            ["receive",  "📦 Receive Stock"],
            ["new",      "+ New Request"],
            ["purchase_sheet", "🧮 Purchase Sheet"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => { setTab(key); setSelectedReq(null) }}
              style={{
                ...s.btnSm,
                background: tab === key ? "hsl(var(--primary))" : "#f3f4f6",
                color:      tab === key ? "white" : "#374151",
                padding:    "6px 14px",
              }}
            >{label}</button>
          ))}
        </div>
      </div>

      {/* ── ALL REQUESTS ── */}
      {tab === "requests" && !selectedReq && (
        <div style={s.card}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>#</th>
                <th style={s.th}>Vendor</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Note</th>
                <th style={s.th}>Date</th>
                <th style={s.th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 && (
                <tr><td colSpan={6} style={{ ...s.td, textAlign: "center", color: "#9ca3af", padding: "24px" }}>
                  No requests yet
                </td></tr>
              )}
              {requests.map((r, i) => {
                const sc = statusColor[r.status] ?? statusColor.draft
                return (
                  <tr key={r.id}>
                    <td style={s.td}>{requests.length - i}</td>
                    <td style={s.td}>{(r as any).vendors?.name || "—"}</td>
                    <td style={s.td}>
                      <span style={{ ...s.badge, background: sc.bg, color: sc.color }}>{r.status}</span>
                    </td>
                    <td style={s.td}>{r.note || "—"}</td>
                    <td style={s.td}>{parseDbTimestamp(r.created_at).toLocaleDateString("en-IN")}</td>
                    <td style={s.td}>
                      <button
                        onClick={() => loadReqItems(r)}
                        style={{ ...s.btnSm, background: "#f3f4f6", color: "#111", marginRight: 6 }}
                      >View</button>
                      {r.status === "draft" && (
                        <button
                          onClick={() => sendToVendor(r.id)}
                          style={{ ...s.btnSm, background: "#1d4ed8", color: "white" }}
                        >Send</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── REQUEST DETAIL ── */}
      {tab === "requests" && selectedReq && (
        <div>
          <button
            onClick={() => setSelectedReq(null)}
            style={{ ...s.btnSm, background: "#f3f4f6", color: "#111", marginBottom: 16 }}
          >← Back</button>
          <div style={s.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: "0 0 4px" }}>Request Detail</h3>
                <span style={{
                  ...s.badge,
                  background: statusColor[selectedReq.status]?.bg,
                  color: statusColor[selectedReq.status]?.color,
                }}>{selectedReq.status}</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {selectedReq.status === "draft" && (
                  <button onClick={() => sendToVendor(selectedReq.id)} style={s.btn}>Send to Vendor</button>
                )}
                {(selectedReq.status === "responded" || selectedReq.status === "sent") && (
                  <button onClick={() => confirmRequest(selectedReq.id)} style={{ ...s.btn, background: "#16a34a" }}>
                    Confirm & Update Stock
                  </button>
                )}
              </div>
            </div>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Ingredient</th><th style={s.th}>Unit</th>
                  <th style={s.th}>Requested</th><th style={s.th}>Available?</th>
                  <th style={s.th}>Confirmed Qty</th><th style={s.th}>Price/Unit</th>
                  <th style={s.th}>Total</th>
                </tr>
              </thead>
              <tbody>
                {reqItems.map(item => (
                  <tr key={item.id}>
                    <td style={s.td}>{(item as any).ingredients?.name}</td>
                    <td style={s.td}>{(item as any).ingredients?.unit}</td>
                    <td style={s.td}>{item.requested_qty}</td>
                    <td style={s.td}>
                      <button
                        onClick={() => updateItemResponse(item.id, "is_available", !item.is_available)}
                        style={{
                          ...s.btnSm,
                          background: item.is_available ? "#f0fdf4" : "#fef2f2",
                          color: item.is_available ? "#16a34a" : "#dc2626",
                          border: "1px solid", borderColor: item.is_available ? "#bbf7d0" : "#fecaca",
                        }}
                      >{item.is_available ? "✔ Yes" : "✖ No"}</button>
                    </td>
                    <td style={s.td}>
                      <input type="number" value={item.confirmed_qty ?? ""} style={{ ...s.input, width: 80 }}
                        onChange={e => updateItemResponse(item.id, "confirmed_qty", Number(e.target.value))} />
                    </td>
                    <td style={s.td}>
                      <input type="number" value={item.price_per_unit ?? ""} style={{ ...s.input, width: 80 }}
                        onChange={e => updateItemResponse(item.id, "price_per_unit", Number(e.target.value))} />
                    </td>
                    <td style={{ ...s.td, fontWeight: 600 }}>
                      {item.confirmed_qty && item.price_per_unit
                        ? `₹${(item.confirmed_qty * item.price_per_unit).toFixed(0)}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── RECEIVE STOCK ── */}
      {tab === "receive" && (
        <div>
          {/* Flash message */}
          {receiveMsg && (
            <div style={{
              background: receiveMsg.startsWith("✅") ? "#dcfce7" : "#fee2e2",
              color:      receiveMsg.startsWith("✅") ? "#166534" : "#991b1b",
              borderRadius: 10, padding: "12px 16px", marginBottom: 16,
              fontSize: 14, fontWeight: 600,
            }}>{receiveMsg}</div>
          )}

          {/* Vendor filter */}
          <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 20, paddingBottom: 4 }}>
            {[{ id: "all", name: "All Vendors" }, ...allVendors].map(v => (
              <button
                key={v.id}
                onClick={() => setVendorFilter(v.id)}
                style={{
                  padding: "6px 16px", border: "1.5px solid", borderRadius: 20,
                  fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                  borderColor: vendorFilter === v.id ? "hsl(var(--primary))" : "#e5e7eb",
                  background:  vendorFilter === v.id ? "hsl(var(--primary))" : "white",
                  color:       vendorFilter === v.id ? "white" : "#374151",
                }}
              >{v.name}</button>
            ))}
          </div>

          {/* ── Pending orders ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>🟡 Pending Delivery</span>
            <span style={{
              background: "#fbbf24", color: "white", borderRadius: 20,
              padding: "1px 10px", fontSize: 12, fontWeight: 800,
            }}>{pendingOrders.length}</span>
          </div>

          {pendingOrders.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "36px", color: "#9ca3af",
              background: "white", borderRadius: 12, border: "1px solid #e5e7eb",
              marginBottom: 16,
            }}>
              No pending orders{vendorFilter !== "all" ? " for this vendor" : ""}
            </div>
          ) : (
            pendingOrders.map(req => {
              const items      = req.procurement_items || []
              const vendorName = req.vendors?.name || "Unknown Vendor"
              const sc         = statusColor[req.status] ?? statusColor.draft
              return (
                <div key={req.id} style={{ ...s.card, borderTop: "3px solid #fbbf24" }}>
                  {/* Card header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 15, color: "#111" }}>{vendorName}</div>
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                        Ordered {daysAgo(req.created_at)}{req.note ? ` · ${req.note}` : ""}
                      </div>
                    </div>
                    <span style={{ ...s.badge, background: sc.bg, color: sc.color, fontSize: 12 }}>
                      {req.status.toUpperCase()}
                    </span>
                  </div>

                  {/* Items table */}
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ ...s.table, marginBottom: 0 }}>
                      <thead>
                        <tr>
                          <th style={s.th}>Ingredient</th>
                          <th style={s.th}>Ordered</th>
                          <th style={s.th}>Received</th>
                          <th style={s.th}>Total Paid</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map(item => {
                          const ing      = item.ingredients
                          const inp      = receiveInputs[item.id] || { qty: "", paid: "" }
                          const qtyNum   = parseFloat(inp.qty)  || 0
                          const paidNum  = parseFloat(inp.paid) || 0
                          const uPP      = ing?.units_per_purchase || 0
                          const yPct     = ing?.yield_percentage   || 100
                          const usable   = qtyNum > 0 && uPP > 0 ? qtyNum * uPP * (yPct / 100) : 0
                          const cpu      = usable > 0 && paidNum > 0 ? paidNum / usable : null
                          const isOver   = qtyNum > 0 && qtyNum > item.requested_qty
                          const isShort  = qtyNum > 0 && qtyNum < item.requested_qty
                          const noSetup  = qtyNum > 0 && !uPP

                          return (
                            <React.Fragment key={item.id}>
                              <tr>
                                <td style={{ ...s.td, fontWeight: 600 }}>
                                  {ing?.name || "—"}
                                </td>
                                <td style={s.td}>
                                  {item.requested_qty} {ing?.purchase_unit || ""}
                                </td>
                                <td style={s.td}>
                                  <input
                                    type="number" min="0" step="0.1"
                                    placeholder={String(item.requested_qty)}
                                    value={inp.qty}
                                    onChange={e => setReceiveInputs(prev => ({
                                      ...prev,
                                      [item.id]: { ...prev[item.id], qty: e.target.value },
                                    }))}
                                    style={{
                                      ...s.input, width: 80,
                                      borderColor: isOver ? "#f97316" : isShort ? "#fecaca" : "#e5e7eb",
                                    }}
                                  />
                                </td>
                                <td style={s.td}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                    <span style={{ color: "#6b7280", fontSize: 13 }}>₹</span>
                                    <input
                                      type="number" min="0" step="0.01"
                                      placeholder="0"
                                      value={inp.paid}
                                      onChange={e => setReceiveInputs(prev => ({
                                        ...prev,
                                        [item.id]: { ...prev[item.id], paid: e.target.value },
                                      }))}
                                      style={{ ...s.input, width: 100 }}
                                    />
                                  </div>
                                </td>
                              </tr>

                              {/* Live calculation row */}
                              {(qtyNum > 0 || paidNum > 0) && (
                                <tr>
                                  <td colSpan={4} style={{ ...s.td, paddingTop: 2, paddingBottom: 10, borderBottom: "1px solid #f3f4f6" }}>
                                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 11, color: "#6b7280" }}>
                                      {qtyNum > 0 && uPP > 0 && (
                                        <span>
                                          💡 {qtyNum} {ing?.purchase_unit} = {usable.toFixed(1)} {ing?.usage_unit} usable
                                          {cpu !== null && ` · ₹${cpu.toFixed(4)}/${ing?.usage_unit}`}
                                        </span>
                                      )}
                                      {isOver && (
                                        <span style={{ color: "#f97316", fontWeight: 700 }}>
                                          ⚠️ Over-delivery — allowed
                                        </span>
                                      )}
                                      {isShort && (
                                        <span style={{ color: "#dc2626", fontWeight: 600 }}>
                                          ⚠️ {(item.requested_qty - qtyNum).toFixed(1)} {ing?.purchase_unit} short — will carry forward
                                        </span>
                                      )}
                                      {noSetup && (
                                        <span style={{ color: "#dc2626", fontWeight: 600 }}>
                                          ⚠️ Please set up ingredient (units_per_purchase) first
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mark as Received button */}
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
                    <button
                      onClick={() => validateAndConfirm(req)}
                      disabled={confirming === req.id}
                      style={{
                        ...s.btn,
                        background: confirming === req.id ? "#9ca3af" : "#16a34a",
                        opacity: confirming === req.id ? 0.7 : 1,
                      }}
                    >
                      {confirming === req.id ? "Updating Stock…" : "✓ Mark as Received"}
                    </button>
                  </div>
                </div>
              )
            })
          )}

          {/* ── Completed orders ── */}
          <div style={{ marginTop: 24 }}>
            <button
              onClick={() => setShowCompleted(c => !c)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "none", border: "none", cursor: "pointer",
                fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 12,
              }}
            >
              <span>✅ Received Orders</span>
              <span style={{
                background: "#f3f4f6", color: "#6b7280", borderRadius: 20,
                padding: "1px 10px", fontSize: 12,
              }}>{completedOrders.length}</span>
              <span style={{ fontSize: 12, color: "#9ca3af" }}>{showCompleted ? "▲ hide" : "▼ show"}</span>
            </button>

            {showCompleted && (
              completedOrders.length === 0 ? (
                <div style={{ color: "#9ca3af", fontSize: 13, padding: "16px 0" }}>No received orders yet</div>
              ) : (
                completedOrders.map(req => {
                  const items      = req.procurement_items || []
                  const vendorName = req.vendors?.name || "Unknown"
                  const totalPaid  = items.reduce((sum, i) => sum + (i.actual_cost || 0), 0)
                  const receivedAt = items.find(i => i.received_at)?.received_at
                  const partialBadge = req.status === "partially_received"

                  return (
                    <div key={req.id} style={{
                      ...s.card,
                      borderLeft: `3px solid ${partialBadge ? "#f97316" : "#16a34a"}`,
                      padding: "14px 18px",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>
                          {partialBadge ? "⚠️" : "✅"} {vendorName}
                          {receivedAt && (
                            <span style={{ fontWeight: 400, color: "#6b7280", fontSize: 12, marginLeft: 8 }}>
                              · Received {daysAgo(receivedAt)}
                            </span>
                          )}
                        </span>
                        <span style={{ fontWeight: 800, color: "#16a34a" }}>
                          Total ₹{totalPaid.toFixed(0)}
                        </span>
                      </div>
                      {items
                        .filter(i => (i.received_qty ?? 0) > 0)
                        .map(item => {
                          const ing = item.ingredients
                          const cpu = item.actual_cost && item.received_qty
                            ? (item.actual_cost / item.received_qty).toFixed(2)
                            : "—"
                          return (
                            <div key={item.id} style={{ fontSize: 12, color: "#6b7280", marginBottom: 3 }}>
                              <b style={{ color: "#374151" }}>{ing?.name}</b>: {item.received_qty} {ing?.purchase_unit}
                              {item.actual_cost ? ` · ₹${item.actual_cost.toFixed(0)}` : ""}
                              {item.actual_cost ? ` · ₹${cpu}/${ing?.purchase_unit}` : ""}
                              {(item.carry_forward_qty ?? 0) > 0 && (
                                <span style={{ color: "#f97316", marginLeft: 6 }}>
                                  ({item.carry_forward_qty} short)
                                </span>
                              )}
                            </div>
                          )
                        })}
                    </div>
                  )
                })
              )
            )}
          </div>

          {/* ── Confirm dialog ── */}
          {confirmReqId && (
            <div style={s.overlay} onClick={() => setConfirmReqId(null)}>
              <div style={s.modal} onClick={e => e.stopPropagation()}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
                <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>Mark as Received?</h3>
                <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 20 }}>
                  This will update inventory stock and record price history for all received items.
                </p>
                <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                  <button
                    style={{ height: 42, padding: "0 20px", background: "white", color: "#374151", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                    onClick={() => setConfirmReqId(null)}
                  >Cancel</button>
                  <button
                    style={{ height: 42, padding: "0 20px", background: "#16a34a", color: "white", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" }}
                    onClick={() => doMarkReceived(confirmReqId)}
                  >Yes, Update Stock</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── NEW REQUEST ── */}
      {tab === "new" && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>Create Procurement Request</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
                Vendor (optional)
              </label>
              <select value={reqVendor} onChange={e => onSelectReqVendor(e.target.value)} style={{ ...s.input, width: "100%", height: 38 }}>
                <option value="">No vendor — add items freely</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}{v.category ? ` (${v.category})` : ""}</option>)}
              </select>
              <p style={{ fontSize: 11, color: "#9ca3af", margin: "4px 0 0" }}>
                {vendorCategory
                  ? `Ingredient list below is filtered to ${vendorCategory}.`
                  : reqVendor
                    ? "This vendor has no category set — showing all ingredients."
                    : "No vendor picked — on Create, items will auto-split into one draft request per category."}
              </p>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
                Note
              </label>
              <input
                value={reqNote}
                onChange={e => setReqNote(e.target.value)}
                placeholder="e.g. Urgent order"
                style={{ ...s.input, width: "100%", height: 38 }}
              />
            </div>
          </div>

          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Ingredient</th>
                <th style={s.th}>Quantity (purchase units)</th>
                <th style={s.th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <td style={s.td}>
                    <select
                      value={row.ingredient_id}
                      onChange={e => setRows(prev => prev.map((r, j) => j === i ? { ...r, ingredient_id: e.target.value } : r))}
                      style={{ ...s.input, width: "100%" }}
                    >
                      <option value="">Select ingredient</option>
                      {ingredientOptions.map(ing => (
                        <option key={ing.id} value={ing.id}>
                          {ing.name} ({ing.unit}){!vendorCategory && ing.category ? ` — ${ing.category}` : ""}
                        </option>
                      ))}
                    </select>
                    {ingredientOptions.length === 0 && (
                      <span style={{ fontSize: 11, color: "#dc2626" }}>No ingredients tagged "{vendorCategory}" yet — set categories in Ingredients first.</span>
                    )}
                  </td>
                  <td style={s.td}>
                    <input
                      type="number" placeholder="Qty"
                      value={row.qty}
                      onChange={e => setRows(prev => prev.map((r, j) => j === i ? { ...r, qty: e.target.value } : r))}
                      style={{ ...s.input, width: 100 }}
                    />
                  </td>
                  <td style={s.td}>
                    <button
                      onClick={() => setRows(prev => prev.filter((_, j) => j !== i))}
                      style={{ ...s.btnSm, background: "#fef2f2", color: "#dc2626" }}
                    >✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              onClick={() => setRows(prev => [...prev, { ingredient_id: "", qty: "" }])}
              style={{ ...s.btnSm, background: "#f3f4f6", color: "#111" }}
            >+ Add Row</button>
            <button
              onClick={createRequest}
              disabled={loadingMain}
              style={{ ...s.btn, opacity: loadingMain ? 0.6 : 1 }}
            >{loadingMain ? "Creating..." : "Create Request"}</button>
          </div>
        </div>
      )}

      {/* ── VENDORS ── */}
      {tab === "vendors" && (
        <div>
          <div style={s.card}>
            <h3 style={s.cardTitle}>Add Vendor</h3>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                placeholder="Vendor name" value={vName}
                onChange={e => setVName(e.target.value)}
                style={{ ...s.input, flex: 1 }}
              />
              <input
                placeholder="Phone" value={vPhone}
                onChange={e => setVPhone(e.target.value)}
                style={{ ...s.input, width: 160 }}
              />
              <select
                value={vCategory}
                onChange={e => setVCategory(e.target.value)}
                style={{ ...s.input, width: 170 }}
              >
                <option value="">No category</option>
                {PROCUREMENT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button onClick={addVendor} style={s.btn}>Add</button>
            </div>
            <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 8, marginBottom: 0 }}>
              Setting a category filters the ingredient list to that category when this vendor is picked in New Request — leave unset if this vendor supplies a mix.
            </p>
          </div>
          <div style={s.card}>
            <table style={s.table}>
              <thead>
                <tr><th style={s.th}>Name</th><th style={s.th}>Category</th><th style={s.th}>Phone</th></tr>
              </thead>
              <tbody>
                {vendors.length === 0 && (
                  <tr><td colSpan={3} style={{ ...s.td, textAlign: "center", color: "#9ca3af", padding: "20px" }}>
                    No vendors yet
                  </td></tr>
                )}
                {vendors.map(v => (
                  <tr key={v.id}>
                    <td style={s.td}>{v.name}</td>
                    <td style={s.td}>
                      {v.category ? (
                        <span style={{ ...s.badge, background: categoryColor(v.category).bg, color: categoryColor(v.category).color }}>
                          {v.category}
                        </span>
                      ) : <span style={{ color: "#9ca3af", fontSize: 12 }}>Any / mixed</span>}
                    </td>
                    <td style={s.td}>{v.phone || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── PURCHASE SHEET (recipe-driven, feeds into a draft request above) ── */}
      {tab === "purchase_sheet" && (
        <PurchaseSheetTab outletId="demo-outlet" onCreated={() => { setTab("requests"); load() }} />
      )}
    </div>
  )
}
