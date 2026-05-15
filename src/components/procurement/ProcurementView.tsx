import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"

type Ingredient = { id: string; name: string; unit: string }
type Vendor = { id: string; name: string; phone: string }
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

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1000, margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  title: { fontSize: 22, fontWeight: 800, color: "#111", margin: 0 },
  card: { background: "white", border: "1px solid #e5e7eb", borderRadius: 12, padding: "20px 24px", marginBottom: 16 },
  cardTitle: { fontWeight: 700, fontSize: 15, margin: "0 0 16px" },
  table: { width: "100%", borderCollapse: "collapse" as const },
  th: { textAlign: "left" as const, padding: "8px 12px", fontSize: 12, fontWeight: 600, color: "#6b7280", borderBottom: "1px solid #e5e7eb" },
  td: { padding: "8px 12px", fontSize: 13, borderBottom: "1px solid #f3f4f6", color: "#111" },
  input: { padding: "6px 10px", border: "1.5px solid #e5e7eb", borderRadius: 6, fontSize: 13, width: "100%", outline: "none" },
  btn: { padding: "8px 16px", background: "#111", color: "white", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  btnSm: { padding: "4px 10px", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" },
  badge: { padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600 },
}

const statusColor: Record<string, { bg: string; color: string }> = {
  draft:     { bg: "#f3f4f6", color: "#6b7280" },
  sent:      { bg: "#eff6ff", color: "#1d4ed8" },
  responded: { bg: "#fffbeb", color: "#d97706" },
  confirmed: { bg: "#f0fdf4", color: "#16a34a" },
  completed: { bg: "#f0fdf4", color: "#16a34a" },
}

export default function ProcurementView() {
  const [tab, setTab] = useState<"requests" | "vendors" | "new">("requests")
  const [requests, setRequests] = useState<ProcurementRequest[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [selectedReq, setSelectedReq] = useState<ProcurementRequest | null>(null)
  const [reqItems, setReqItems] = useState<ProcurementItem[]>([])
  const [loading, setLoading] = useState(false)

  // New request form
  const [rows, setRows] = useState([{ ingredient_id: "", qty: "" }])
  const [reqNote, setReqNote] = useState("")
  const [reqVendor, setReqVendor] = useState("")

  // New vendor form
  const [vName, setVName] = useState("")
  const [vPhone, setVPhone] = useState("")

  const load = useCallback(async () => {
    const [{ data: r }, { data: v }, { data: i }] = await Promise.all([
      supabase.from("procurement_requests").select("*, vendors(name, phone)").order("created_at", { ascending: false }).limit(50),
      supabase.from("vendors").select("*").order("name"),
      supabase.from("ingredients").select("id, name, unit").order("name"),
    ])
    if (r) setRequests(r as any)
    if (v) setVendors(v)
    if (i) setIngredients(i)
  }, [])

  useEffect(() => { load() }, [load])

  const loadReqItems = async (req: ProcurementRequest) => {
    setSelectedReq(req)
    const { data } = await supabase
      .from("procurement_items")
      .select("*, ingredients(name, unit)")
      .eq("request_id", req.id)
    if (data) setReqItems(data as any)
  }

  const createRequest = async () => {
    const valid = rows.filter(r => r.ingredient_id && r.qty)
    if (!valid.length) { alert("Add at least one ingredient"); return }
    setLoading(true)

    const { data: req } = await supabase
      .from("procurement_requests")
      .insert({ status: "draft", note: reqNote, vendor_id: reqVendor || null })
      .select().single()

    if (!req) { setLoading(false); return }

    await supabase.from("procurement_items").insert(
      valid.map(r => ({ request_id: req.id, ingredient_id: r.ingredient_id, requested_qty: Number(r.qty) }))
    )

    setRows([{ ingredient_id: "", qty: "" }])
    setReqNote("")
    setReqVendor("")
    setLoading(false)
    setTab("requests")
    load()
  }

  const sendToVendor = async (id: string) => {
    await supabase.from("procurement_requests").update({ status: "sent" }).eq("id", id)
    load()
    if (selectedReq?.id === id) setSelectedReq(prev => prev ? { ...prev, status: "sent" } : null)
  }

  const confirmRequest = async (id: string) => {
    // Update stock for confirmed items
    const confirmed = reqItems.filter(i => i.is_available && i.confirmed_qty)
    await Promise.all(confirmed.map(async item => {
      const { data: stock } = await supabase.from("inventory_stock")
        .select("current_quantity").eq("ingredient_id", item.ingredient_id).single()
      const current = stock?.current_quantity ?? 0
      await supabase.from("inventory_stock")
        .upsert({ ingredient_id: item.ingredient_id, current_quantity: current + (item.confirmed_qty ?? 0) })
      await supabase.from("inventory_logs").insert({
        ingredient_id: item.ingredient_id,
        change: item.confirmed_qty,
        type: "purchase",
        reference_id: id,
      })
    }))
    await supabase.from("procurement_requests").update({ status: "completed" }).eq("id", id)
    load()
    setSelectedReq(null)
  }

  const updateItemResponse = async (itemId: string, field: string, value: any) => {
    await supabase.from("procurement_items").update({ [field]: value }).eq("id", itemId)
    setReqItems(prev => prev.map(i => i.id === itemId ? { ...i, [field]: value } : i))
    // Update request status to responded
    if (selectedReq) {
      await supabase.from("procurement_requests").update({ status: "responded" }).eq("id", selectedReq.id)
    }
  }

  const addVendor = async () => {
    if (!vName.trim()) return
    await supabase.from("vendors").insert({ name: vName, phone: vPhone })
    setVName(""); setVPhone("")
    load()
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h2 style={s.title}>Procurement</h2>
        <div style={{ display: "flex", gap: 8 }}>
          {(["requests", "vendors", "new"] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setSelectedReq(null) }} style={{
              ...s.btnSm,
              background: tab === t ? "#111" : "#f3f4f6",
              color: tab === t ? "white" : "#374151",
            }}>
              {t === "new" ? "+ New Request" : t === "vendors" ? "Vendors" : "All Requests"}
            </button>
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
                <tr><td colSpan={6} style={{ ...s.td, textAlign: "center", color: "#9ca3af", padding: "24px" }}>No requests yet</td></tr>
              )}
              {requests.map((r, i) => {
                const sc = statusColor[r.status] ?? statusColor.draft
                return (
                  <tr key={r.id}>
                    <td style={s.td}>{requests.length - i}</td>
                    <td style={s.td}>{(r as any).vendors?.name || "—"}</td>
                    <td style={s.td}><span style={{ ...s.badge, background: sc.bg, color: sc.color }}>{r.status}</span></td>
                    <td style={s.td}>{r.note || "—"}</td>
                    <td style={s.td}>{new Date(r.created_at).toLocaleDateString("en-IN")}</td>
                    <td style={s.td}>
                      <button onClick={() => loadReqItems(r)} style={{ ...s.btnSm, background: "#f3f4f6", color: "#111", marginRight: 6 }}>View</button>
                      {r.status === "draft" && <button onClick={() => sendToVendor(r.id)} style={{ ...s.btnSm, background: "#1d4ed8", color: "white" }}>Send</button>}
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
          <button onClick={() => setSelectedReq(null)} style={{ ...s.btnSm, background: "#f3f4f6", color: "#111", marginBottom: 16 }}>← Back</button>
          <div style={s.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: "0 0 4px" }}>Request Detail</h3>
                <span style={{ ...s.badge, background: statusColor[selectedReq.status]?.bg, color: statusColor[selectedReq.status]?.color }}>
                  {selectedReq.status}
                </span>
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
                  <th style={s.th}>Ingredient</th>
                  <th style={s.th}>Unit</th>
                  <th style={s.th}>Requested</th>
                  <th style={s.th}>Available?</th>
                  <th style={s.th}>Confirmed Qty</th>
                  <th style={s.th}>Price/Unit</th>
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
                        style={{ ...s.btnSm, background: item.is_available ? "#f0fdf4" : "#fef2f2", color: item.is_available ? "#16a34a" : "#dc2626", border: "1px solid", borderColor: item.is_available ? "#bbf7d0" : "#fecaca" }}
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

      {/* ── NEW REQUEST ── */}
      {tab === "new" && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>Create Procurement Request</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Vendor (optional)</label>
              <select value={reqVendor} onChange={e => setReqVendor(e.target.value)} style={s.input}>
                <option value="">Select vendor</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Note</label>
              <input value={reqNote} onChange={e => setReqNote(e.target.value)} placeholder="e.g. Urgent order" style={s.input} />
            </div>
          </div>

          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Ingredient</th>
                <th style={s.th}>Quantity</th>
                <th style={s.th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <td style={s.td}>
                    <select value={row.ingredient_id} onChange={e => setRows(prev => prev.map((r, j) => j === i ? { ...r, ingredient_id: e.target.value } : r))} style={s.input}>
                      <option value="">Select ingredient</option>
                      {ingredients.map(ing => <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>)}
                    </select>
                  </td>
                  <td style={s.td}>
                    <input type="number" placeholder="Qty" value={row.qty}
                      onChange={e => setRows(prev => prev.map((r, j) => j === i ? { ...r, qty: e.target.value } : r))}
                      style={{ ...s.input, width: 100 }} />
                  </td>
                  <td style={s.td}>
                    <button onClick={() => setRows(prev => prev.filter((_, j) => j !== i))} style={{ ...s.btnSm, background: "#fef2f2", color: "#dc2626" }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={() => setRows(prev => [...prev, { ingredient_id: "", qty: "" }])} style={{ ...s.btnSm, background: "#f3f4f6", color: "#111" }}>+ Add Row</button>
            <button onClick={createRequest} disabled={loading} style={{ ...s.btn, opacity: loading ? 0.6 : 1 }}>
              {loading ? "Creating..." : "Create Request"}
            </button>
          </div>
        </div>
      )}

      {/* ── VENDORS ── */}
      {tab === "vendors" && (
        <div>
          <div style={s.card}>
            <h3 style={s.cardTitle}>Add Vendor</h3>
            <div style={{ display: "flex", gap: 8 }}>
              <input placeholder="Vendor name" value={vName} onChange={e => setVName(e.target.value)} style={{ ...s.input, flex: 1 }} />
              <input placeholder="Phone" value={vPhone} onChange={e => setVPhone(e.target.value)} style={{ ...s.input, width: 160 }} />
              <button onClick={addVendor} style={s.btn}>Add</button>
            </div>
          </div>
          <div style={s.card}>
            <table style={s.table}>
              <thead><tr><th style={s.th}>Name</th><th style={s.th}>Phone</th></tr></thead>
              <tbody>
                {vendors.length === 0 && <tr><td colSpan={2} style={{ ...s.td, textAlign: "center", color: "#9ca3af", padding: "20px" }}>No vendors yet</td></tr>}
                {vendors.map(v => (
                  <tr key={v.id}><td style={s.td}>{v.name}</td><td style={s.td}>{v.phone || "—"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
