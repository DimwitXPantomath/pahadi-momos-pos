import { useState, useEffect, useCallback, useMemo } from "react"
import { supabase } from "@/lib/supabase"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Expense {
  id: string
  category: string
  description: string
  amount: number
  expense_date: string
  paid_by: string
  created_at: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: "Salary",       label: "👤 Salary / Wages",    color: "#7c3aed" },
  { value: "Rent",         label: "🏠 Rent",              color: "#2563eb" },
  { value: "Electricity",  label: "⚡ Electricity",       color: "#d97706" },
  { value: "Raw Material", label: "🥩 Raw Material",      color: "#16a34a" },
  { value: "Packaging",    label: "📦 Packaging",         color: "#0891b2" },
  { value: "Marketing",    label: "📣 Marketing",         color: "#db2777" },
  { value: "Equipment",    label: "🔧 Equipment / Repair",color: "#64748b" },
  { value: "Transport",    label: "🚚 Transport",         color: "#f97316" },
  { value: "Other",        label: "📋 Other",             color: "#6b7280" },
]

const PAID_BY = ["cash", "upi", "bank transfer"]

const OUTLET_ID = "demo-outlet"

function fmtCurrency(n: number) {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 })
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ExpensesView() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  // Form state
  const [form, setForm] = useState({
    category: "Salary",
    description: "",
    amount: "",
    expense_date: new Date().toISOString().split("T")[0],
    paid_by: "cash",
  })

  // Filters
  const [filterCat, setFilterCat] = useState("all")
  const [filterMonth, setFilterMonth] = useState(
    new Date().toISOString().slice(0, 7)   // "YYYY-MM"
  )

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    const from = filterMonth ? `${filterMonth}-01` : "2000-01-01"
    const to   = filterMonth
      ? new Date(parseInt(filterMonth.slice(0, 4)), parseInt(filterMonth.slice(5, 7)), 0)
          .toISOString().split("T")[0]
      : "2099-12-31"

    const { data, error: err } = await supabase
      .from("expenses")
      .select("*")
      .eq("outlet_id", OUTLET_ID)
      .gte("expense_date", from)
      .lte("expense_date", to)
      .order("expense_date", { ascending: false })

    if (err) setError(err.message)
    else setExpenses(data || [])
    setLoading(false)
  }, [filterMonth])

  useEffect(() => { load() }, [load])

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.category)     { setError("Select a category"); return }
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0) {
      setError("Enter a valid amount"); return
    }
    setSaving(true); setError("")
    const { error: err } = await supabase.from("expenses").insert({
      outlet_id: OUTLET_ID,
      category: form.category,
      description: form.description.trim() || null,
      amount: parseFloat(form.amount),
      expense_date: form.expense_date,
      paid_by: form.paid_by,
    })
    if (err) { setError(err.message); setSaving(false); return }
    setSuccess("Expense recorded ✓")
    setForm(f => ({ ...f, description: "", amount: "" }))
    setTimeout(() => setSuccess(""), 2500)
    load()
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this expense?")) return
    await supabase.from("expenses").delete().eq("id", id)
    load()
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() =>
    filterCat === "all" ? expenses : expenses.filter(e => e.category === filterCat),
    [expenses, filterCat]
  )

  const totalMonth = expenses.reduce((s, e) => s + e.amount, 0)
  const totalFiltered = filtered.reduce((s, e) => s + e.amount, 0)

  const byCategory = useMemo(() => {
    const m: Record<string, number> = {}
    expenses.forEach(e => { m[e.category] = (m[e.category] || 0) + e.amount })
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [expenses])

  const monthLabel = filterMonth
    ? new Date(filterMonth + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" })
    : "All time"

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>

      {/* Header */}
      <div style={s.header}>
        <div>
          <h2 style={s.title}>💸 Expenses</h2>
          <p style={s.subtitle}>Track every business expense for accurate P&L calculation</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="month"
            value={filterMonth}
            onChange={e => setFilterMonth(e.target.value)}
            style={{ ...s.input, width: 150 }}
          />
        </div>
      </div>

      {error   && <div style={s.errorBanner}>⚠️ {error}</div>}
      {success && <div style={s.successBanner}>{success}</div>}

      {/* Summary row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
        <div style={s.statCard}>
          <div style={s.statVal}>{fmtCurrency(totalMonth)}</div>
          <div style={s.statLbl}>Total · {monthLabel}</div>
        </div>
        {byCategory.slice(0, 3).map(([cat, amt]) => {
          const catInfo = CATEGORIES.find(c => c.value === cat)
          return (
            <div key={cat} style={{ ...s.statCard, borderLeft: `3px solid ${catInfo?.color || "#6b7280"}` }}>
              <div style={{ ...s.statVal, fontSize: 16 }}>{fmtCurrency(amt)}</div>
              <div style={s.statLbl}>{cat}</div>
            </div>
          )
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 20, alignItems: "start" }}>

        {/* ── ADD FORM ── */}
        <div style={s.card}>
          <h3 style={s.cardTitle}>➕ Add Expense</h3>

          <div style={s.field}>
            <label style={s.label}>Category *</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {CATEGORIES.map(cat => (
                <button
                  key={cat.value}
                  onClick={() => setForm(f => ({ ...f, category: cat.value }))}
                  style={{
                    padding: "7px 8px",
                    borderRadius: 8,
                    border: "1.5px solid",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "left",
                    borderColor: form.category === cat.value ? cat.color : "#e5e7eb",
                    background: form.category === cat.value ? cat.color + "18" : "white",
                    color: form.category === cat.value ? cat.color : "#374151",
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div style={s.field}>
            <label style={s.label}>Amount (₹) *</label>
            <input
              style={s.input}
              type="number"
              min="1"
              step="0.01"
              placeholder="e.g. 15000"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
            />
          </div>

          <div style={s.field}>
            <label style={s.label}>Description</label>
            <input
              style={s.input}
              placeholder="e.g. August salary – 3 staff"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={s.field}>
              <label style={s.label}>Date *</label>
              <input
                style={s.input}
                type="date"
                value={form.expense_date}
                onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))}
              />
            </div>
            <div style={s.field}>
              <label style={s.label}>Paid via</label>
              <select
                style={s.input}
                value={form.paid_by}
                onChange={e => setForm(f => ({ ...f, paid_by: e.target.value }))}
              >
                {PAID_BY.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
          </div>

          <button
            style={{ ...s.primaryBtn, width: "100%", marginTop: 6, opacity: saving ? 0.7 : 1 }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Record Expense"}
          </button>
        </div>

        {/* ── LIST ── */}
        <div>
          {/* Category filter */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            <button
              onClick={() => setFilterCat("all")}
              style={{ ...s.filterBtn, background: filterCat === "all" ? "#111" : "#f3f4f6", color: filterCat === "all" ? "white" : "#374151" }}
            >All ({expenses.length})</button>
            {byCategory.map(([cat, amt]) => {
              const catInfo = CATEGORIES.find(c => c.value === cat)
              return (
                <button
                  key={cat}
                  onClick={() => setFilterCat(cat)}
                  style={{ ...s.filterBtn, background: filterCat === cat ? (catInfo?.color || "#111") : "#f3f4f6", color: filterCat === cat ? "white" : "#374151" }}
                >
                  {cat} · {fmtCurrency(amt)}
                </button>
              )
            })}
          </div>

          {loading ? (
            <div style={s.empty}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={s.empty}>No expenses recorded for this period.</div>
          ) : (
            <div style={s.card}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>
                  {filtered.length} expense{filtered.length !== 1 ? "s" : ""}
                  {filterCat !== "all" ? ` · ${filterCat}` : ""}
                </span>
                <span style={{ fontWeight: 800, color: "#dc2626" }}>{fmtCurrency(totalFiltered)}</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      {["Date", "Category", "Description", "Paid via", "Amount", ""].map(h => (
                        <th key={h} style={s.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((exp, i) => {
                      const catInfo = CATEGORIES.find(c => c.value === exp.category)
                      return (
                        <tr key={exp.id} style={{ background: i % 2 === 0 ? "white" : "#f9fafb" }}>
                          <td style={s.td}>{fmtDate(exp.expense_date)}</td>
                          <td style={s.td}>
                            <span style={{
                              background: (catInfo?.color || "#6b7280") + "18",
                              color: catInfo?.color || "#6b7280",
                              borderRadius: 20,
                              padding: "2px 10px",
                              fontSize: 11,
                              fontWeight: 700,
                            }}>
                              {exp.category}
                            </span>
                          </td>
                          <td style={{ ...s.td, color: "#6b7280" }}>{exp.description || "—"}</td>
                          <td style={s.td}>{exp.paid_by}</td>
                          <td style={{ ...s.td, textAlign: "right", fontWeight: 700, color: "#dc2626" }}>
                            {fmtCurrency(exp.amount)}
                          </td>
                          <td style={s.td}>
                            <button
                              style={{ background: "#fee2e2", border: "none", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 12 }}
                              onClick={() => handleDelete(exp.id)}
                            >🗑️</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "#fef2f2" }}>
                      <td colSpan={4} style={{ ...s.td, fontWeight: 700 }}>Total{filterCat !== "all" ? ` · ${filterCat}` : ""}</td>
                      <td style={{ ...s.td, textAlign: "right", fontWeight: 800, fontSize: 15, color: "#dc2626" }}>
                        {fmtCurrency(totalFiltered)}
                      </td>
                      <td style={s.td} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page:         { padding: "16px 16px 80px", maxWidth: 1100, margin: "0 auto" },
  header:       { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 },
  title:        { fontSize: 22, fontWeight: 800, color: "#111", margin: 0 },
  subtitle:     { fontSize: 13, color: "#6b7280", marginTop: 4 },
  card:         { background: "white", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, marginBottom: 16 },
  cardTitle:    { fontSize: 14, fontWeight: 700, color: "#111", margin: "0 0 14px" },
  field:        { display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 },
  label:        { fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.4px" },
  input:        { height: 40, padding: "0 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, color: "#111", background: "#fafafa", outline: "none", width: "100%", boxSizing: "border-box" },
  primaryBtn:   { height: 44, padding: "0 20px", background: "#111", color: "white", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" },
  filterBtn:    { padding: "5px 12px", borderRadius: 20, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  statCard:     { background: "white", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 16px" },
  statVal:      { fontSize: 20, fontWeight: 800, color: "#111" },
  statLbl:      { fontSize: 12, color: "#6b7280", marginTop: 2 },
  table:        { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th:           { padding: "10px 12px", background: "#f3f4f6", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" },
  td:           { padding: "10px 12px", borderBottom: "1px solid #f3f4f6", color: "#111", whiteSpace: "nowrap" },
  empty:        { textAlign: "center", padding: "40px 20px", color: "#9ca3af", fontSize: 14 },
  errorBanner:  { background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 12 },
  successBanner:{ background: "#dcfce7", color: "#166534", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 12 },
}
