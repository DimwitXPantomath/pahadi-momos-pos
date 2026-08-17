import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { parseDbTimestamp } from "@/lib/utils"

type Order = { id: string; total: number; created_at: string; items: any[]; payment_method: string }

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1000, margin: "0 auto" },
  title: { fontSize: 22, fontWeight: 800, color: "#111", margin: "0 0 24px" },
  tabs: { display: "flex", gap: 4, background: "#f3f4f6", borderRadius: 10, padding: 4, marginBottom: 24, width: "fit-content" },
  tab: { padding: "7px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 },
  card: { background: "white", border: "1px solid #e5e7eb", borderRadius: 12, padding: "20px 24px", marginBottom: 16 },
  cardTitle: { fontWeight: 700, fontSize: 15, margin: "0 0 16px" },
  stat: { background: "#f9f7f4", borderRadius: 10, padding: "14px 18px", textAlign: "center" as const },
  statVal: { fontSize: 24, fontWeight: 800, color: "#111" },
  statLbl: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  table: { width: "100%", borderCollapse: "collapse" as const },
  th: { textAlign: "left" as const, padding: "8px 12px", fontSize: 12, fontWeight: 600, color: "#6b7280", borderBottom: "1px solid #e5e7eb" },
  td: { padding: "8px 12px", fontSize: 13, borderBottom: "1px solid #f3f4f6", color: "#111" },
}

export default function MISView() {
  const [tab, setTab] = useState<"sales" | "items" | "inventory" | "procurement" | "credit">("sales")
  const [orders, setOrders] = useState<Order[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [ingredients, setIngredients] = useState<any[]>([])
  const [stock, setStock] = useState<any[]>([])
  const [procItems, setProcItems] = useState<any[]>([])
  const [creditSales, setCreditSales] = useState<any[]>([])
  const [creditSearch, setCreditSearch] = useState("")
  const [creditFilter, setCreditFilter] = useState<"all" | "pending" | "paid">("all")
  const [dateRange, setDateRange] = useState(7) // days

  const load = useCallback(async () => {
    const since = new Date(Date.now() - dateRange * 86400000).toISOString()
    const [{ data: o }, { data: l }, { data: i }, { data: st }, { data: pi }, { data: cs }] = await Promise.all([
      supabase.from("orders").select("*").gte("created_at", since).order("created_at", { ascending: false }),
      supabase.from("inventory_logs").select("*, ingredients(name, unit)").gte("created_at", since),
      supabase.from("ingredients").select("*"),
      supabase.from("inventory_stock").select("*, ingredients(name, unit)"),
      supabase.from("procurement_items").select("*, ingredients(name), procurement_requests(created_at, vendors(name))").gte("created_at", since),
      supabase.from("credit_sales").select("*").order("created_at", { ascending: false }),
    ])
    if (o) setOrders(o)
    if (l) setLogs(l)
    if (i) setIngredients(i)
    if (st) setStock(st)
    if (pi) setProcItems(pi)
    if (cs) setCreditSales(cs)
  }, [dateRange])

  useEffect(() => { load() }, [load])

  // ── Sales aggregation ─────────────────────────────────────────
  const totalRevenue = orders.reduce((s, o) => s + (o.total || 0), 0)
  const avgOrder = orders.length ? totalRevenue / orders.length : 0
  // Fixed sequence: CASH | CARD | UPI | DUE — always show all four, even if zero
  const paymentBreakdown: Record<string, number> = { CASH: 0, CARD: 0, UPI: 0, DUE: 0 }
  orders.forEach(o => {
    const method = (o.payment_method || "CASH").toUpperCase()
    if (method in paymentBreakdown) paymentBreakdown[method] += o.total || 0
    else paymentBreakdown["CASH"] += o.total || 0
  })

  // Daily sales grouped
  const dailySales = orders.reduce((acc: Record<string, { orders: number; revenue: number }>, o) => {
    const day = parseDbTimestamp(o.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
    if (!acc[day]) acc[day] = { orders: 0, revenue: 0 }
    acc[day].orders++
    acc[day].revenue += o.total || 0
    return acc
  }, {})

  // Item-wise sales
  const itemSales = orders.reduce((acc: Record<string, { qty: number; revenue: number }>, o) => {
    o.items?.forEach((item: any) => {
      if (!acc[item.name]) acc[item.name] = { qty: 0, revenue: 0 }
      acc[item.name].qty += item.quantity
      acc[item.name].revenue += item.price * item.quantity
    })
    return acc
  }, {})

  // Inventory report from logs
  const inventoryReport = ingredients.map(ing => {
    const ingLogs = logs.filter(l => l.ingredient_id === ing.id)
    const purchased = ingLogs.filter(l => l.type === "purchase").reduce((s: number, l: any) => s + l.change, 0)
    const used = Math.abs(ingLogs.filter(l => l.type === "sale").reduce((s: number, l: any) => s + l.change, 0))
    const currentStock = stock.find(s => s.ingredient_id === ing.id)?.current_quantity ?? 0
    const opening = currentStock - purchased + used
    return { name: ing.name, unit: ing.unit, opening: Math.max(0, opening), purchased, used, closing: currentStock }
  }).filter(r => r.purchased > 0 || r.used > 0 || r.closing > 0)

  // Procurement report
  const vendorSummary = procItems.reduce((acc: Record<string, { requested: number; supplied: number }>, item: any) => {
    const vname = item.procurement_requests?.vendors?.name || "Unknown"
    if (!acc[vname]) acc[vname] = { requested: 0, supplied: 0 }
    acc[vname].requested += item.requested_qty || 0
    acc[vname].supplied += item.confirmed_qty || 0
    return acc
  }, {})

  const exportCSV = (rows: any[][], filename: string) => {
    const csv = rows.map(r => r.join(",")).join("\n")
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
    a.download = `${filename}-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
  }

  return (
    <div style={s.page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ ...s.title, margin: 0 }}>MIS Reports</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "#6b7280" }}>Last</span>
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDateRange(d)} style={{
              padding: "4px 10px", border: "1.5px solid", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
              borderColor: dateRange === d ? "#111" : "#e5e7eb",
              background: dateRange === d ? "#111" : "white",
              color: dateRange === d ? "white" : "#374151",
            }}>{d}d</button>
          ))}
        </div>
      </div>

      <div style={s.tabs}>
        {([["sales", "📊 Sales"], ["items", "🍽️ Items"], ["inventory", "📦 Inventory"], ["procurement", "🛒 Procurement"], ["credit", "📒 Credit"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            ...s.tab,
            background: tab === key ? "white" : "transparent",
            color: tab === key ? "#111" : "#6b7280",
            boxShadow: tab === key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
          }}>{label}</button>
        ))}
      </div>

      {/* ── SALES REPORT ── */}
      {tab === "sales" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
            <div style={s.stat}><div style={s.statVal}>{orders.length}</div><div style={s.statLbl}>Total Orders</div></div>
            <div style={s.stat}><div style={s.statVal}>₹{totalRevenue.toFixed(0)}</div><div style={s.statLbl}>Revenue</div></div>
            <div style={s.stat}><div style={s.statVal}>₹{avgOrder.toFixed(0)}</div><div style={s.statLbl}>Avg Order</div></div>
            <div style={s.stat}>
              <div style={s.statVal}>{Object.keys(paymentBreakdown).length}</div>
              <div style={s.statLbl}>Payment methods</div>
            </div>
          </div>

          <div style={s.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ ...s.cardTitle, margin: 0 }}>Daily Sales</h3>
              <button onClick={() => exportCSV([["Date", "Orders", "Revenue"], ...Object.entries(dailySales).map(([d, v]) => [d, v.orders, v.revenue.toFixed(0)])], "daily-sales")} style={{ fontSize: 11, color: "#6b7280", background: "none", border: "1px solid #e5e7eb", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>
                ⬇ CSV
              </button>
            </div>
            <table style={s.table}>
              <thead><tr><th style={s.th}>Date</th><th style={s.th}>Orders</th><th style={s.th}>Revenue</th></tr></thead>
              <tbody>
                {Object.entries(dailySales).length === 0 && <tr><td colSpan={3} style={{ ...s.td, color: "#9ca3af", textAlign: "center", padding: "20px" }}>No data</td></tr>}
                {Object.entries(dailySales).map(([day, val]) => (
                  <tr key={day}>
                    <td style={s.td}>{day}</td>
                    <td style={s.td}>{val.orders}</td>
                    <td style={{ ...s.td, fontWeight: 600, color: "#f97316" }}>₹{val.revenue.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={s.card}>
            <h3 style={s.cardTitle}>Payment Breakdown</h3>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {(["CASH", "CARD", "UPI", "DUE"] as const).map(method => {
                const icons: Record<string, string> = { CASH: "💵", CARD: "💳", UPI: "📱", DUE: "📒" }
                const colors: Record<string, string> = { CASH: "#16a34a", CARD: "#2563eb", UPI: "#7c3aed", DUE: "#dc2626" }
                const amt = paymentBreakdown[method] || 0
                return (
                  <div key={method} style={{ ...s.stat, flex: 1, minWidth: 80, borderLeft: `3px solid ${colors[method]}`, paddingLeft: 10 }}>
                    <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>{icons[method]} {method}</div>
                    <div style={{ ...s.statVal, color: amt > 0 ? colors[method] : "#9ca3af" }}>₹{amt.toFixed(0)}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── ITEM-WISE SALES ── */}
      {tab === "items" && (
        <div style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ ...s.cardTitle, margin: 0 }}>Item-wise Sales</h3>
            <button onClick={() => exportCSV([["Item", "Qty Sold", "Revenue"], ...Object.entries(itemSales).map(([n, v]) => [n, v.qty, v.revenue.toFixed(0)])], "item-sales")} style={{ fontSize: 11, color: "#6b7280", background: "none", border: "1px solid #e5e7eb", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>
              ⬇ CSV
            </button>
          </div>
          <table style={s.table}>
            <thead><tr><th style={s.th}>Item</th><th style={s.th}>Qty Sold</th><th style={s.th}>Revenue</th></tr></thead>
            <tbody>
              {Object.entries(itemSales).length === 0 && <tr><td colSpan={3} style={{ ...s.td, color: "#9ca3af", textAlign: "center", padding: "20px" }}>No data</td></tr>}
              {Object.entries(itemSales).sort((a, b) => b[1].qty - a[1].qty).map(([name, val]) => (
                <tr key={name}>
                  <td style={s.td}>{name}</td>
                  <td style={{ ...s.td, fontWeight: 600 }}>{val.qty}</td>
                  <td style={{ ...s.td, color: "#f97316", fontWeight: 600 }}>₹{val.revenue.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── INVENTORY REPORT ── */}
      {tab === "inventory" && (
        <div style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ ...s.cardTitle, margin: 0 }}>Inventory Report</h3>
            <button onClick={() => exportCSV([["Ingredient", "Unit", "Opening", "Purchased", "Used", "Closing"], ...inventoryReport.map(r => [r.name, r.unit, r.opening, r.purchased, r.used, r.closing])], "inventory")} style={{ fontSize: 11, color: "#6b7280", background: "none", border: "1px solid #e5e7eb", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>
              ⬇ CSV
            </button>
          </div>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Ingredient</th>
                <th style={s.th}>Unit</th>
                <th style={s.th}>Opening</th>
                <th style={s.th}>Purchased</th>
                <th style={s.th}>Used</th>
                <th style={s.th}>Closing</th>
              </tr>
            </thead>
            <tbody>
              {inventoryReport.length === 0 && <tr><td colSpan={6} style={{ ...s.td, color: "#9ca3af", textAlign: "center", padding: "20px" }}>No inventory activity in this period</td></tr>}
              {inventoryReport.map(r => (
                <tr key={r.name}>
                  <td style={s.td}>{r.name}</td>
                  <td style={s.td}>{r.unit}</td>
                  <td style={s.td}>{r.opening.toFixed(2)}</td>
                  <td style={{ ...s.td, color: "#16a34a" }}>+{r.purchased.toFixed(2)}</td>
                  <td style={{ ...s.td, color: "#dc2626" }}>-{r.used.toFixed(2)}</td>
                  <td style={{ ...s.td, fontWeight: 700 }}>{r.closing.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── PROCUREMENT REPORT ── */}
      {tab === "procurement" && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>Vendor Fulfillment Report</h3>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Vendor</th>
                <th style={s.th}>Requested</th>
                <th style={s.th}>Supplied</th>
                <th style={s.th}>Fulfillment %</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(vendorSummary).length === 0 && <tr><td colSpan={4} style={{ ...s.td, color: "#9ca3af", textAlign: "center", padding: "20px" }}>No procurement data</td></tr>}
              {Object.entries(vendorSummary).map(([vendor, val]) => {
                const pct = val.requested ? Math.round(val.supplied / val.requested * 100) : 0
                return (
                  <tr key={vendor}>
                    <td style={s.td}>{vendor}</td>
                    <td style={s.td}>{val.requested}</td>
                    <td style={s.td}>{val.supplied}</td>
                    <td style={s.td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, background: "#f3f4f6", borderRadius: 4, height: 6 }}>
                          <div style={{ width: `${pct}%`, background: pct > 80 ? "#16a34a" : pct > 50 ? "#f97316" : "#dc2626", height: "100%", borderRadius: 4 }} />
                        </div>
                        <span style={{ fontWeight: 700, minWidth: 36, fontSize: 12 }}>{pct}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── CREDIT SALES ── */}
      {tab === "credit" && (() => {
        const filtered = creditSales.filter(cs => {
          const matchSearch = !creditSearch ||
            (cs.customer_name || "").toLowerCase().includes(creditSearch.toLowerCase()) ||
            (cs.customer_phone || "").includes(creditSearch)
          const matchFilter = creditFilter === "all" ||
            (creditFilter === "pending" && !cs.paid) ||
            (creditFilter === "paid" && cs.paid)
          return matchSearch && matchFilter
        })
        const totalDue = creditSales.filter(cs => !cs.paid).reduce((sum, cs) => sum + (cs.amount || 0), 0)
        const totalPaid = creditSales.filter(cs => cs.paid).reduce((sum, cs) => sum + (cs.amount || 0), 0)
        const pendingCount = creditSales.filter(cs => !cs.paid).length

        return (
          <div>
            {/* Summary stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
              <div style={s.stat}>
                <div style={{ ...s.statVal, color: "#dc2626" }}>₹{totalDue.toFixed(0)}</div>
                <div style={s.statLbl}>Total Outstanding</div>
              </div>
              <div style={s.stat}>
                <div style={{ ...s.statVal, color: "#16a34a" }}>₹{totalPaid.toFixed(0)}</div>
                <div style={s.statLbl}>Total Collected</div>
              </div>
              <div style={s.stat}>
                <div style={{ ...s.statVal, color: pendingCount > 0 ? "#f97316" : "#111" }}>{pendingCount}</div>
                <div style={s.statLbl}>Pending Bills</div>
              </div>
            </div>

            <div style={s.card}>
              {/* Search + filter row */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  type="text"
                  placeholder="🔍 Search by name or phone…"
                  value={creditSearch}
                  onChange={e => setCreditSearch(e.target.value)}
                  style={{ flex: 1, minWidth: 200, padding: "7px 12px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 13, outline: "none" }}
                />
                <div style={{ display: "flex", gap: 4 }}>
                  {(["all", "pending", "paid"] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setCreditFilter(f)}
                      style={{
                        padding: "6px 14px", border: "1.5px solid", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                        borderColor: creditFilter === f ? "#111" : "#e5e7eb",
                        background: creditFilter === f ? "#111" : "white",
                        color: creditFilter === f ? "white" : "#6b7280",
                        textTransform: "capitalize",
                      }}
                    >{f}</button>
                  ))}
                </div>
                <button
                  onClick={() => exportCSV(
                    [["Date", "Customer", "Phone", "Amount", "Status", "Order ID"],
                     ...filtered.map(cs => [
                       parseDbTimestamp(cs.created_at).toLocaleDateString("en-IN"),
                       cs.customer_name || "—",
                       cs.customer_phone || "—",
                       cs.amount?.toFixed(2) || "0",
                       cs.paid ? "Paid" : "Pending",
                       cs.order_id || "—",
                     ])],
                    "credit-sales"
                  )}
                  style={{ fontSize: 11, color: "#6b7280", background: "none", border: "1px solid #e5e7eb", borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}
                >⬇ CSV</button>
              </div>

              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Date</th>
                    <th style={s.th}>Customer</th>
                    <th style={s.th}>Phone</th>
                    <th style={s.th}>Amount</th>
                    <th style={s.th}>Status</th>
                    <th style={s.th}>Order ID</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ ...s.td, color: "#9ca3af", textAlign: "center", padding: "28px" }}>
                        {creditSales.length === 0 ? "No credit sales recorded yet" : "No results match your search"}
                      </td>
                    </tr>
                  )}
                  {filtered.map(cs => (
                    <tr key={cs.id}>
                      <td style={s.td}>{parseDbTimestamp(cs.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}</td>
                      <td style={{ ...s.td, fontWeight: 600 }}>{cs.customer_name || <span style={{ color: "#9ca3af" }}>—</span>}</td>
                      <td style={s.td}>{cs.customer_phone || <span style={{ color: "#9ca3af" }}>—</span>}</td>
                      <td style={{ ...s.td, fontWeight: 700, color: cs.paid ? "#16a34a" : "#dc2626" }}>₹{(cs.amount || 0).toFixed(0)}</td>
                      <td style={s.td}>
                        <span style={{
                          display: "inline-block",
                          padding: "2px 10px",
                          borderRadius: 20,
                          fontSize: 11,
                          fontWeight: 700,
                          background: cs.paid ? "#dcfce7" : "#fef2f2",
                          color: cs.paid ? "#15803d" : "#dc2626",
                        }}>
                          {cs.paid ? "✓ Paid" : "⏳ Pending"}
                        </span>
                      </td>
                      <td style={{ ...s.td, fontFamily: "monospace", fontSize: 11, color: "#6b7280" }}>
                        {cs.order_id ? cs.order_id.slice(0, 8) + "…" : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
