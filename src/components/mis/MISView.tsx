import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"

type Order = { id: string; total: number; created_at: string; items: any[]; payment_method: string }
type CreditSale = { id: string; order_id: string; customer_name: string; customer_phone?: string; due_amount: number; paid_amount: number; status: string; created_at: string }
type ReportLog = { id: string; sent_to: string; report_type: string; sent_at: string }

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1000, margin: "0 auto" },
  title: { fontSize: 22, fontWeight: 800, color: "#111", margin: "0 0 24px" },
  tabs: { display: "flex", gap: 4, background: "#f3f4f6", borderRadius: 10, padding: 4, marginBottom: 24, width: "fit-content", flexWrap: "wrap" as const },
  tab: { padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600 },
  card: { background: "white", border: "1px solid #e5e7eb", borderRadius: 12, padding: "20px 24px", marginBottom: 16 },
  cardTitle: { fontWeight: 700, fontSize: 15, margin: "0 0 16px" },
  stat: { background: "#f9f7f4", borderRadius: 10, padding: "14px 18px", textAlign: "center" as const },
  statVal: { fontSize: 24, fontWeight: 800, color: "#111" },
  statLbl: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  table: { width: "100%", borderCollapse: "collapse" as const },
  th: { textAlign: "left" as const, padding: "8px 12px", fontSize: 12, fontWeight: 600, color: "#6b7280", borderBottom: "1px solid #e5e7eb" },
  td: { padding: "8px 12px", fontSize: 13, borderBottom: "1px solid #f3f4f6", color: "#111" },
  input: { padding: "7px 10px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 13, outline: "none", background: "white", color: "#111" },
  btn: { padding: "7px 14px", background: "#111", color: "white", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  btnGreen: { padding: "7px 14px", background: "#25d366", color: "white", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" },
}

export default function MISView() {
  const [tab, setTab] = useState<"sales" | "items" | "inventory" | "procurement" | "credit" | "expenses">("sales")
  const [orders, setOrders] = useState<Order[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [ingredients, setIngredients] = useState<any[]>([])
  const [stock, setStock] = useState<any[]>([])
  const [procItems, setProcItems] = useState<any[]>([])
  const [creditSales, setCreditSales] = useState<CreditSale[]>([])
  const [reportLogs, setReportLogs] = useState<ReportLog[]>([])
  const [expenses, setExpenses] = useState<any[]>([])
  const [dateRange, setDateRange] = useState(7)
  const [creditSearch, setCreditSearch] = useState("")
  const [creditFilter, setCreditFilter] = useState("all")
  const [waPhone, setWaPhone] = useState("")
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    const since = new Date(Date.now() - dateRange * 86400000).toISOString()
    const [{ data: o }, { data: l }, { data: i }, { data: st }, { data: pi }, { data: cs }, { data: rl }, { data: ex }] = await Promise.all([
      supabase.from("orders").select("*").gte("created_at", since).order("created_at", { ascending: false }),
      supabase.from("inventory_logs").select("*, ingredients(name, unit)").gte("created_at", since),
      supabase.from("ingredients").select("*"),
      supabase.from("inventory_stock").select("*, ingredients(name, unit)"),
      supabase.from("procurement_items").select("*, ingredients(name), procurement_requests(created_at, vendors(name))").gte("created_at", since),
      supabase.from("credit_sales").select("*").order("created_at", { ascending: false }),
      supabase.from("report_logs").select("*").order("sent_at", { ascending: false }).limit(20),
      supabase.from("expenses").select("*").gte("date", since.split("T")[0]).order("date", { ascending: false }),
    ])
    if (o) setOrders(o)
    if (l) setLogs(l)
    if (i) setIngredients(i)
    if (st) setStock(st)
    if (pi) setProcItems(pi)
    if (cs) setCreditSales(cs)
    if (rl) setReportLogs(rl)
    if (ex) setExpenses(ex)
  }, [dateRange])

  useEffect(() => { load() }, [load])

  // ── Aggregations ──────────────────────────────────────────────
  const totalRevenue = orders.filter(o => o.payment_method !== "DUE").reduce((s, o) => s + (o.total || 0), 0)
  const totalDue = creditSales.filter(c => c.status === "pending").reduce((s, c) => s + c.due_amount, 0)
  const avgOrder = orders.length ? totalRevenue / orders.length : 0

  const paymentBreakdown = orders.reduce((acc: Record<string, number>, o) => {
    const m = o.payment_method || "CASH"
    acc[m] = (acc[m] || 0) + (o.total || 0)
    return acc
  }, {})

  const dailySales = orders.reduce((acc: Record<string, { orders: number; revenue: number }>, o) => {
    const day = new Date(o.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
    if (!acc[day]) acc[day] = { orders: 0, revenue: 0 }
    acc[day].orders++
    if (o.payment_method !== "DUE") acc[day].revenue += o.total || 0
    return acc
  }, {})

  const itemSales = orders.reduce((acc: Record<string, { qty: number; revenue: number }>, o) => {
    o.items?.forEach((item: any) => {
      if (!acc[item.name]) acc[item.name] = { qty: 0, revenue: 0 }
      acc[item.name].qty += item.quantity
      acc[item.name].revenue += item.price * item.quantity
    })
    return acc
  }, {})

  const inventoryReport = ingredients.map(ing => {
    const ingLogs = logs.filter(l => l.ingredient_id === ing.id)
    const purchased = ingLogs.filter(l => l.type === "purchase").reduce((s: number, l: any) => s + l.change, 0)
    const used = Math.abs(ingLogs.filter(l => l.type === "sale").reduce((s: number, l: any) => s + l.change, 0))
    const currentStock = stock.find(s => s.ingredient_id === ing.id)?.current_quantity ?? 0
    const opening = currentStock - purchased + used
    return { name: ing.name, unit: ing.unit, opening: Math.max(0, opening), purchased, used, closing: currentStock }
  }).filter(r => r.purchased > 0 || r.used > 0 || r.closing > 0)

  const vendorSummary = procItems.reduce((acc: Record<string, { requested: number; supplied: number }>, item: any) => {
    const vname = item.procurement_requests?.vendors?.name || "Unknown"
    if (!acc[vname]) acc[vname] = { requested: 0, supplied: 0 }
    acc[vname].requested += item.requested_qty || 0
    acc[vname].supplied += item.confirmed_qty || 0
    return acc
  }, {})

  const filteredCredit = creditSales.filter(c => {
    const matchSearch = !creditSearch || c.customer_name?.toLowerCase().includes(creditSearch.toLowerCase()) || c.customer_phone?.includes(creditSearch)
    const matchFilter = creditFilter === "all" || c.status === creditFilter
    return matchSearch && matchFilter
  })

  const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0)

  const exportCSV = (rows: any[][], filename: string) => {
    const csv = rows.map(r => r.join(",")).join("\n")
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
    a.download = `${filename}-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
  }

  const sendWhatsApp = async () => {
    if (!waPhone.trim()) { alert("Enter WhatsApp number"); return }
    setSending(true)

    const todayOrders = orders.filter(o => new Date(o.created_at).toDateString() === new Date().toDateString())
    const revenue = todayOrders.reduce((s, o) => s + (o.payment_method !== "DUE" ? o.total : 0), 0)
    const due = todayOrders.filter(o => o.payment_method === "DUE").reduce((s, o) => s + o.total, 0)
    const topItems: Record<string, number> = {}
    todayOrders.forEach(o => o.items?.forEach((i: any) => { topItems[i.name] = (topItems[i.name] || 0) + i.quantity }))
    const top3 = Object.entries(topItems).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, q]) => `  • ${n}: ${q}`).join("\n")
    const todayExpenses = expenses.filter(e => e.date === new Date().toISOString().split("T")[0]).reduce((s, e) => s + e.amount, 0)

    const msg = `🌿 *Praang Daily Report*\n📅 ${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}\n\n📦 Orders: ${todayOrders.length}\n💰 Revenue: ₹${revenue.toFixed(0)}\n📒 Credit: ₹${due.toFixed(0)}\n💸 Expenses: ₹${todayExpenses.toFixed(0)}\n📊 Net: ₹${(revenue - todayExpenses).toFixed(0)}\n\n⭐ Top Items:\n${top3 || "  No orders yet"}\n\n_Sent via Praang POS_`
    const phone = waPhone.replace(/\D/g, "")
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank")

    // Log the report send
    await supabase.from("report_logs").insert({
      sent_to: phone,
      report_type: "daily_summary",
      message: msg,
      sent_at: new Date().toISOString(),
    })

    await load()
    setSending(false)
  }

  const markCreditPaid = async (id: string, amount: number) => {
    await supabase.from("credit_sales").update({ paid_amount: amount, status: "paid" }).eq("id", id)
    load()
  }

  const TABS = [
    ["sales", "📊 Sales"],
    ["items", "🍽️ Items"],
    ["inventory", "📦 Inventory"],
    ["procurement", "🛒 Procurement"],
    ["credit", "📒 Credit"],
    ["expenses", "💸 Expenses"],
  ] as const

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

      {/* WhatsApp send */}
      <div style={{ ...s.card, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>📤 Send Report</span>
          <input
            placeholder="WhatsApp number (e.g. 919876543210)"
            value={waPhone}
            onChange={e => setWaPhone(e.target.value)}
            style={{ ...s.input, flex: 1, minWidth: 200 }}
          />
          <button onClick={sendWhatsApp} disabled={sending} style={s.btnGreen}>
            {sending ? "Sending..." : "📱 WhatsApp"}
          </button>
        </div>
        {reportLogs.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", margin: "0 0 8px" }}>Recent sends:</p>
            {reportLogs.slice(0, 3).map(log => (
              <div key={log.id} style={{ fontSize: 12, color: "#6b7280", display: "flex", gap: 12, padding: "4px 0" }}>
                <span>📱 +{log.sent_to}</span>
                <span>{new Date(log.sent_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                <span style={{ color: "#9ca3af" }}>{log.report_type}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={s.tabs}>
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            ...s.tab,
            background: tab === key ? "white" : "transparent",
            color: tab === key ? "#111" : "#6b7280",
            boxShadow: tab === key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
          }}>{label}</button>
        ))}
      </div>

      {/* SALES */}
      {tab === "sales" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
            <div style={s.stat}><div style={s.statVal}>{orders.length}</div><div style={s.statLbl}>Orders</div></div>
            <div style={s.stat}><div style={s.statVal}>₹{totalRevenue.toFixed(0)}</div><div style={s.statLbl}>Revenue</div></div>
            <div style={s.stat}><div style={s.statVal}>₹{totalDue.toFixed(0)}</div><div style={s.statLbl}>Pending Credit</div></div>
            <div style={s.stat}><div style={s.statVal}>₹{avgOrder.toFixed(0)}</div><div style={s.statLbl}>Avg Order</div></div>
          </div>
          <div style={s.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ ...s.cardTitle, margin: 0 }}>Daily Sales</h3>
              <button onClick={() => exportCSV([["Date", "Orders", "Revenue"], ...Object.entries(dailySales).map(([d, v]) => [d, v.orders, v.revenue.toFixed(0)])], "daily-sales")} style={{ fontSize: 11, color: "#6b7280", background: "none", border: "1px solid #e5e7eb", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>⬇ CSV</button>
            </div>
            <table style={s.table}>
              <thead><tr><th style={s.th}>Date</th><th style={s.th}>Orders</th><th style={s.th}>Revenue</th></tr></thead>
              <tbody>
                {Object.entries(dailySales).length === 0 && <tr><td colSpan={3} style={{ ...s.td, color: "#9ca3af", textAlign: "center", padding: "20px" }}>No data</td></tr>}
                {Object.entries(dailySales).map(([day, val]) => (
                  <tr key={day}><td style={s.td}>{day}</td><td style={s.td}>{val.orders}</td><td style={{ ...s.td, fontWeight: 600, color: "#f97316" }}>₹{val.revenue.toFixed(0)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={s.card}>
            <h3 style={s.cardTitle}>Payment Breakdown</h3>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" as const }}>
              {Object.entries(paymentBreakdown).map(([method, amount]) => (
                <div key={method} style={{ ...s.stat, flex: 1, minWidth: 100 }}>
                  <div style={s.statVal}>₹{(amount as number).toFixed(0)}</div>
                  <div style={s.statLbl}>{method === "DUE" ? "📒 Credit" : method}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ITEMS */}
      {tab === "items" && (
        <div style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ ...s.cardTitle, margin: 0 }}>Item-wise Sales</h3>
            <button onClick={() => exportCSV([["Item", "Qty Sold", "Revenue"], ...Object.entries(itemSales).map(([n, v]) => [n, v.qty, v.revenue.toFixed(0)])], "item-sales")} style={{ fontSize: 11, color: "#6b7280", background: "none", border: "1px solid #e5e7eb", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>⬇ CSV</button>
          </div>
          <table style={s.table}>
            <thead><tr><th style={s.th}>Item</th><th style={s.th}>Qty Sold</th><th style={s.th}>Revenue</th></tr></thead>
            <tbody>
              {Object.entries(itemSales).sort((a, b) => b[1].qty - a[1].qty).map(([name, val]) => (
                <tr key={name}><td style={s.td}>{name}</td><td style={{ ...s.td, fontWeight: 600 }}>{val.qty}</td><td style={{ ...s.td, color: "#f97316", fontWeight: 600 }}>₹{val.revenue.toFixed(0)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* INVENTORY */}
      {tab === "inventory" && (
        <div style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ ...s.cardTitle, margin: 0 }}>Inventory Report</h3>
            <button onClick={() => exportCSV([["Ingredient", "Unit", "Opening", "Purchased", "Used", "Closing"], ...inventoryReport.map(r => [r.name, r.unit, r.opening, r.purchased, r.used, r.closing])], "inventory")} style={{ fontSize: 11, color: "#6b7280", background: "none", border: "1px solid #e5e7eb", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>⬇ CSV</button>
          </div>
          <table style={s.table}>
            <thead><tr><th style={s.th}>Ingredient</th><th style={s.th}>Unit</th><th style={s.th}>Opening</th><th style={s.th}>Purchased</th><th style={s.th}>Used</th><th style={s.th}>Closing</th></tr></thead>
            <tbody>
              {inventoryReport.length === 0 && <tr><td colSpan={6} style={{ ...s.td, color: "#9ca3af", textAlign: "center", padding: "20px" }}>No activity in this period</td></tr>}
              {inventoryReport.map(r => (
                <tr key={r.name}><td style={s.td}>{r.name}</td><td style={s.td}>{r.unit}</td><td style={s.td}>{r.opening.toFixed(2)}</td><td style={{ ...s.td, color: "#16a34a" }}>+{r.purchased.toFixed(2)}</td><td style={{ ...s.td, color: "#dc2626" }}>-{r.used.toFixed(2)}</td><td style={{ ...s.td, fontWeight: 700 }}>{r.closing.toFixed(2)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* PROCUREMENT */}
      {tab === "procurement" && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>Vendor Fulfillment</h3>
          <table style={s.table}>
            <thead><tr><th style={s.th}>Vendor</th><th style={s.th}>Requested</th><th style={s.th}>Supplied</th><th style={s.th}>Fulfillment %</th></tr></thead>
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

      {/* CREDIT SALES */}
      {tab === "credit" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 16 }}>
            <div style={s.stat}><div style={s.statVal}>{creditSales.length}</div><div style={s.statLbl}>Total Credit Sales</div></div>
            <div style={s.stat}><div style={{ ...s.statVal, color: "#dc2626" }}>₹{creditSales.filter(c => c.status === "pending").reduce((s, c) => s + c.due_amount, 0).toFixed(0)}</div><div style={s.statLbl}>Outstanding Dues</div></div>
            <div style={s.stat}><div style={{ ...s.statVal, color: "#16a34a" }}>₹{creditSales.filter(c => c.status === "paid").reduce((s, c) => s + c.due_amount, 0).toFixed(0)}</div><div style={s.statLbl}>Recovered</div></div>
          </div>
          <div style={s.card}>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" as const }}>
              <input placeholder="🔍 Search by name or phone..." value={creditSearch} onChange={e => setCreditSearch(e.target.value)} style={{ ...s.input, flex: 1 }} />
              {["all", "pending", "partial", "paid"].map(f => (
                <button key={f} onClick={() => setCreditFilter(f)} style={{ padding: "5px 12px", border: "1.5px solid", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", borderColor: creditFilter === f ? "#111" : "#e5e7eb", background: creditFilter === f ? "#111" : "white", color: creditFilter === f ? "white" : "#374151" }}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            <table style={s.table}>
              <thead><tr><th style={s.th}>Customer</th><th style={s.th}>Phone</th><th style={s.th}>Due Amount</th><th style={s.th}>Status</th><th style={s.th}>Date</th><th style={s.th}>Action</th></tr></thead>
              <tbody>
                {filteredCredit.length === 0 && <tr><td colSpan={6} style={{ ...s.td, color: "#9ca3af", textAlign: "center", padding: "20px" }}>No credit sales found</td></tr>}
                {filteredCredit.map(c => (
                  <tr key={c.id}>
                    <td style={{ ...s.td, fontWeight: 600 }}>{c.customer_name || "—"}</td>
                    <td style={s.td}>
                      {c.customer_phone ? (
                        <a href={`https://wa.me/${c.customer_phone.replace(/\D/g,"")}?text=${encodeURIComponent(`Hi ${c.customer_name}, your due amount of ₹${c.due_amount} at Praang is pending. Please settle at your earliest convenience.`)}`} target="_blank" style={{ color: "#25d366", textDecoration: "none", fontWeight: 600 }}>📱 {c.customer_phone}</a>
                      ) : "—"}
                    </td>
                    <td style={{ ...s.td, fontWeight: 700, color: "#dc2626" }}>₹{c.due_amount}</td>
                    <td style={s.td}>
                      <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: c.status === "paid" ? "#f0fdf4" : c.status === "partial" ? "#fffbeb" : "#fef2f2", color: c.status === "paid" ? "#16a34a" : c.status === "partial" ? "#d97706" : "#dc2626" }}>
                        {c.status}
                      </span>
                    </td>
                    <td style={{ ...s.td, fontSize: 12 }}>{new Date(c.created_at).toLocaleDateString("en-IN")}</td>
                    <td style={s.td}>
                      {c.status !== "paid" && (
                        <button onClick={() => markCreditPaid(c.id, c.due_amount)} style={{ ...s.btn, fontSize: 11, padding: "3px 8px", background: "#16a34a" }}>Mark Paid</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* EXPENSES */}
      {tab === "expenses" && <ExpensesTab expenses={expenses} totalExpenses={totalExpenses} totalRevenue={totalRevenue} onRefresh={load} />}
    </div>
  )
}

function ExpensesTab({ expenses, totalExpenses, totalRevenue, onRefresh }: { expenses: any[]; totalExpenses: number; totalRevenue: number; onRefresh: () => void }) {
  const [category, setCategory] = useState("Rent")
  const [amount, setAmount] = useState("")
  const [description, setDescription] = useState("")
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [saving, setSaving] = useState(false)

  const CATEGORIES = ["Rent", "Salary", "Electricity", "Gas/Fuel", "Raw Materials", "Packaging", "Marketing", "Equipment", "Maintenance", "Miscellaneous"]

  const save = async () => {
    if (!amount || !description) { alert("Enter amount and description"); return }
    setSaving(true)
    const { error } = await supabase.from("expenses").insert({
      category, amount: Number(amount), description, date,
      outlet_id: "demo-outlet",
    })
    if (error) { alert("Error: " + error.message); setSaving(false); return }
    setAmount(""); setDescription("")
    setSaving(false)
    onRefresh()
  }

  const byCategory = expenses.reduce((acc: Record<string, number>, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount
    return acc
  }, {})

  const s2: Record<string, React.CSSProperties> = {
    card: { background: "white", border: "1px solid #e5e7eb", borderRadius: 12, padding: "20px 24px", marginBottom: 16 },
    input: { width: "100%", padding: "8px 10px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" as const },
    label: { fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 },
    stat: { background: "#f9f7f4", borderRadius: 10, padding: "14px", textAlign: "center" as const },
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 16 }}>
        <div style={s2.stat}><div style={{ fontSize: 22, fontWeight: 800, color: "#dc2626" }}>₹{totalExpenses.toFixed(0)}</div><div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>Total Expenses</div></div>
        <div style={s2.stat}><div style={{ fontSize: 22, fontWeight: 800, color: "#16a34a" }}>₹{totalRevenue.toFixed(0)}</div><div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>Revenue</div></div>
        <div style={s2.stat}><div style={{ fontSize: 22, fontWeight: 800, color: (totalRevenue - totalExpenses) >= 0 ? "#16a34a" : "#dc2626" }}>₹{(totalRevenue - totalExpenses).toFixed(0)}</div><div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>Net P&L</div></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 16 }}>
        <div style={s2.card}>
          <h3 style={{ fontWeight: 700, fontSize: 15, margin: "0 0 16px" }}>Log Expense</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={s2.label}>Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)} style={{ ...s2.input, background: "white" }}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={s2.label}>Amount (₹)</label>
              <input type="number" placeholder="e.g. 15000" value={amount} onChange={e => setAmount(e.target.value)} style={s2.input} />
            </div>
            <div>
              <label style={s2.label}>Description</label>
              <input placeholder="e.g. August rent payment" value={description} onChange={e => setDescription(e.target.value)} style={s2.input} />
            </div>
            <div>
              <label style={s2.label}>Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={s2.input} />
            </div>
            <button onClick={save} disabled={saving} style={{ padding: "10px", background: "#111", color: "white", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              {saving ? "Saving..." : "Log Expense"}
            </button>
          </div>
        </div>

        <div>
          {/* Category breakdown */}
          <div style={{ ...s2.card, marginBottom: 12 }}>
            <h3 style={{ fontWeight: 700, fontSize: 14, margin: "0 0 12px" }}>By Category</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
                <div key={cat} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13, minWidth: 120, color: "#374151" }}>{cat}</span>
                  <div style={{ flex: 1, background: "#f3f4f6", borderRadius: 4, height: 8 }}>
                    <div style={{ width: `${totalExpenses ? (amt / totalExpenses * 100) : 0}%`, background: "#f97316", height: "100%", borderRadius: 4 }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, minWidth: 60, textAlign: "right" }}>₹{amt.toFixed(0)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent expenses */}
          <div style={s2.card}>
            <h3 style={{ fontWeight: 700, fontSize: 14, margin: "0 0 12px" }}>Recent Expenses</h3>
            <table style={{ width: "100%", borderCollapse: "collapse" as const }}>
              <thead><tr>{["Date", "Category", "Description", "Amount"].map(h => <th key={h} style={{ textAlign: "left" as const, padding: "6px 10px", fontSize: 11, fontWeight: 600, color: "#6b7280", borderBottom: "1px solid #e5e7eb" }}>{h}</th>)}</tr></thead>
              <tbody>
                {expenses.length === 0 && <tr><td colSpan={4} style={{ padding: "16px", textAlign: "center" as const, color: "#9ca3af", fontSize: 13 }}>No expenses logged yet</td></tr>}
                {expenses.slice(0, 20).map(e => (
                  <tr key={e.id}>
                    <td style={{ padding: "7px 10px", fontSize: 12, borderBottom: "1px solid #f3f4f6" }}>{e.date}</td>
                    <td style={{ padding: "7px 10px", fontSize: 12, borderBottom: "1px solid #f3f4f6" }}>{e.category}</td>
                    <td style={{ padding: "7px 10px", fontSize: 12, borderBottom: "1px solid #f3f4f6", color: "#6b7280" }}>{e.description}</td>
                    <td style={{ padding: "7px 10px", fontSize: 13, fontWeight: 700, color: "#dc2626", borderBottom: "1px solid #f3f4f6" }}>₹{e.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
