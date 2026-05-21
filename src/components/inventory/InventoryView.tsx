import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"

// ─── Types ────────────────────────────────────────────────────────────────────

type ItemCategory = "ingredient" | "finished_good" | "packaging"

interface StockItem {
  id: string
  name: string
  category: ItemCategory
  unit: string
  reorder_level: number
  current_qty: number // joined from stock table
  stock_id: string | null
}

interface PurchaseLog {
  id: string
  item_name: string
  qty: number
  unit: string
  total_cost: number
  notes: string
  created_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: d })
}
function fmtCurrency(n: number) { return "₹" + fmt(n, 2) }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
  })
}

const CAT_LABELS: Record<ItemCategory, string> = {
  ingredient: "Ingredient",
  finished_good: "Finished Good",
  packaging: "Packaging",
}

const CAT_COLORS: Record<ItemCategory, { bg: string; color: string }> = {
  ingredient: { bg: "#dbeafe", color: "#1e40af" },
  finished_good: { bg: "#dcfce7", color: "#166534" },
  packaging: { bg: "#fef9c3", color: "#854d0e" },
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InventoryView() {
  const [tab, setTab] = useState<"stock" | "add_item" | "adjust" | "purchases">("stock")
  const [stockItems, setStockItems] = useState<StockItem[]>([])
  const [purchases, setPurchases] = useState<PurchaseLog[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [catFilter, setCatFilter] = useState<ItemCategory | "all">("all")
  const [searchQuery, setSearchQuery] = useState("")

  // ── Add Item form
  const [addForm, setAddForm] = useState({
    name: "",
    category: "ingredient" as ItemCategory,
    unit: "g",
    reorderLevel: "0",
    initialQty: "0",
  })
  const [addSaving, setAddSaving] = useState(false)

  // ── Adjust Stock form
  const [adjForm, setAdjForm] = useState({
    item_id: "",
    qty: "",
    type: "add" as "add" | "remove" | "set",
    notes: "",
    cost: "",
  })
  const [adjSaving, setAdjSaving] = useState(false)

  // ── Fetch stock (items joined with stock qty) ──────────────────────────────
  const fetchStock = useCallback(async () => {
    setLoading(true)
    // First get all items
    const { data: items, error: itemErr } = await supabase
      .from("items")
      .select("*")
      .order("name")

    if (itemErr) { setError(itemErr.message); setLoading(false); return }

    // Then get all stock rows
    const { data: stockRows } = await supabase
      .from("stock")
      .select("item_id, quantity, id")

    const stockMap: Record<string, { qty: number; id: string }> = {}
    stockRows?.forEach(r => { stockMap[r.item_id] = { qty: r.quantity, id: r.id } })

    const merged: StockItem[] = (items || []).map(item => ({
      id: item.id,
      name: item.name,
      category: item.category,
      unit: item.unit,
      reorder_level: item.reorder_level || 0,
      current_qty: stockMap[item.id]?.qty ?? 0,
      stock_id: stockMap[item.id]?.id ?? null,
    }))

    setStockItems(merged)
    setLoading(false)
  }, [])

  // ── Fetch purchases log ────────────────────────────────────────────────────
  const fetchPurchases = useCallback(async () => {
    const { data } = await supabase
      .from("purchase_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50)
    setPurchases(data || [])
  }, [])

  useEffect(() => {
    fetchStock()
    fetchPurchases()
  }, [fetchStock, fetchPurchases])

  // ── Derived stats ──────────────────────────────────────────────────────────
  const lowStockItems = stockItems.filter(i => i.current_qty <= i.reorder_level && i.reorder_level > 0)
  const outOfStock = stockItems.filter(i => i.current_qty === 0)
  const totalItems = stockItems.length

  const filteredStock = stockItems.filter(item => {
    const matchesCat = catFilter === "all" || item.category === catFilter
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCat && matchesSearch
  })

  // ── Add new item ───────────────────────────────────────────────────────────
  async function handleAddItem() {
    if (!addForm.name.trim()) { setError("Item name is required"); return }
    setAddSaving(true); setError("")

    const { data: newItem, error: itemErr } = await supabase
      .from("items")
      .insert({
        name: addForm.name.trim(),
        category: addForm.category,
        unit: addForm.unit,
        reorder_level: parseFloat(addForm.reorderLevel) || 0,
      })
      .select()
      .single()

    if (itemErr) { setError(itemErr.message); setAddSaving(false); return }

    // Create stock row
    const initQty = parseFloat(addForm.initialQty) || 0
    if (initQty >= 0) {
      await supabase.from("stock").insert({ item_id: newItem.id, quantity: initQty })
    }

    setSuccess("Item added to inventory!")
    setAddForm({ name: "", category: "ingredient", unit: "g", reorderLevel: "0", initialQty: "0" })
    fetchStock()
    setTimeout(() => setSuccess(""), 2500)
    setAddSaving(false)
    setTab("stock")
  }

  // ── Adjust stock ───────────────────────────────────────────────────────────
  async function handleAdjust() {
    if (!adjForm.item_id) { setError("Select an item"); return }
    const qty = parseFloat(adjForm.qty)
    if (isNaN(qty) || qty < 0) { setError("Enter a valid quantity"); return }

    setAdjSaving(true); setError("")

    const item = stockItems.find(i => i.id === adjForm.item_id)
    if (!item) { setError("Item not found"); setAdjSaving(false); return }

    let newQty = item.current_qty
    if (adjForm.type === "add") newQty = item.current_qty + qty
    else if (adjForm.type === "remove") newQty = Math.max(0, item.current_qty - qty)
    else if (adjForm.type === "set") newQty = qty

    // Upsert stock row
    if (item.stock_id) {
      await supabase.from("stock").update({ quantity: newQty, updated_at: new Date().toISOString() }).eq("id", item.stock_id)
    } else {
      await supabase.from("stock").insert({ item_id: item.id, quantity: newQty })
    }

    // Log purchase if "add"
    if (adjForm.type === "add" && parseFloat(adjForm.cost) > 0) {
      await supabase.from("purchase_logs").insert({
        item_id: item.id,
        item_name: item.name,
        qty,
        unit: item.unit,
        total_cost: parseFloat(adjForm.cost),
        notes: adjForm.notes,
      })
    }

    setSuccess("Stock updated!")
    setAdjForm({ item_id: "", qty: "", type: "add", notes: "", cost: "" })
    fetchStock()
    fetchPurchases()
    setTimeout(() => setSuccess(""), 2500)
    setAdjSaving(false)
  }

  return (
    <div style={s.page}>

      {/* ── Header ── */}
      <div style={s.header}>
        <div>
          <h2 style={s.title}>📦 Inventory</h2>
          <p style={s.subtitle}>Track stock levels across ingredients, products & packaging</p>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div style={s.statsRow}>
        {[
          { label: "Total Items", value: totalItems, icon: "📦", color: "#111" },
          { label: "Low Stock", value: lowStockItems.length, icon: "⚠️", color: lowStockItems.length > 0 ? "#d97706" : "#111" },
          { label: "Out of Stock", value: outOfStock.length, icon: "🔴", color: outOfStock.length > 0 ? "#ef4444" : "#111" },
        ].map(stat => (
          <div key={stat.label} style={s.statCard}>
            <span style={{ fontSize: 22 }}>{stat.icon}</span>
            <span style={{ fontSize: 26, fontWeight: 800, color: stat.color }}>{stat.value}</span>
            <span style={{ fontSize: 12, color: "#6b7280" }}>{stat.label}</span>
          </div>
        ))}
      </div>

      {/* ── Low Stock Alert ── */}
      {lowStockItems.length > 0 && (
        <div style={s.alertBanner}>
          <strong>⚠️ Low Stock Alert:</strong>{" "}
          {lowStockItems.map(i => `${i.name} (${fmt(i.current_qty)} ${i.unit})`).join(" · ")}
        </div>
      )}

      {/* ── Tabs ── */}
      <div style={s.tabRow}>
        {[
          { key: "stock", label: "📋 Current Stock" },
          { key: "add_item", label: "➕ Add Item" },
          { key: "adjust", label: "🔧 Adjust Stock" },
          { key: "purchases", label: "📥 Purchase Log" },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key as any); setError(""); setSuccess("") }}
            style={{
              ...s.tabBtn,
              background: tab === t.key ? "#111" : "white",
              color: tab === t.key ? "white" : "#374151",
              fontWeight: tab === t.key ? 700 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div style={s.errorBanner}>⚠️ {error}</div>}
      {success && <div style={s.successBanner}>✅ {success}</div>}

      {/* ── STOCK TAB ── */}
      {tab === "stock" && (
        <div style={s.card}>
          <div style={s.tableHeader}>
            <div style={s.filterRow}>
              {(["all", "ingredient", "finished_good", "packaging"] as const).map(cat => (
                <button
                  key={cat}
                  onClick={() => setCatFilter(cat)}
                  style={{
                    ...s.filterBtn,
                    background: catFilter === cat ? "#111" : "#f3f4f6",
                    color: catFilter === cat ? "white" : "#374151",
                  }}
                >
                  {cat === "all" ? "All" : CAT_LABELS[cat]}
                </button>
              ))}
            </div>
            <input
              style={{ ...s.input, width: 180, margin: 0 }}
              placeholder="🔍 Search…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {loading ? (
            <div style={s.emptyState}>Loading…</div>
          ) : filteredStock.length === 0 ? (
            <div style={s.emptyState}>
              No items found. <button style={s.linkBtn} onClick={() => setTab("add_item")}>Add your first item →</button>
            </div>
          ) : (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {["Item Name", "Category", "In Stock", "Reorder At", "Status", ""].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredStock.map((item, i) => {
                    const isLow = item.current_qty <= item.reorder_level && item.reorder_level > 0
                    const isOut = item.current_qty === 0
                    return (
                      <tr key={item.id} style={{ background: i % 2 === 0 ? "white" : "#f9fafb" }}>
                        <td style={{ ...s.td, fontWeight: 600 }}>{item.name}</td>
                        <td style={s.td}>
                          <span style={{
                            ...s.badge,
                            ...CAT_COLORS[item.category],
                          }}>
                            {CAT_LABELS[item.category]}
                          </span>
                        </td>
                        <td style={{ ...s.td, textAlign: "right", fontWeight: 700, fontFamily: "monospace" }}>
                          {fmt(item.current_qty, 1)} {item.unit}
                        </td>
                        <td style={{ ...s.td, textAlign: "right", color: "#6b7280" }}>
                          {item.reorder_level > 0 ? `${fmt(item.reorder_level, 1)} ${item.unit}` : "—"}
                        </td>
                        <td style={s.td}>
                          {isOut ? (
                            <span style={{ ...s.badge, background: "#fee2e2", color: "#991b1b" }}>Out of Stock</span>
                          ) : isLow ? (
                            <span style={{ ...s.badge, background: "#fef3c7", color: "#92400e" }}>Low Stock</span>
                          ) : (
                            <span style={{ ...s.badge, background: "#dcfce7", color: "#166534" }}>OK</span>
                          )}
                        </td>
                        <td style={s.td}>
                          <button
                            style={s.editBtn}
                            onClick={() => { setAdjForm(f => ({ ...f, item_id: item.id })); setTab("adjust") }}
                          >
                            🔧 Adjust
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── ADD ITEM TAB ── */}
      {tab === "add_item" && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>➕ Add New Inventory Item</h3>

          <div style={s.grid2}>
            <div style={s.field}>
              <label style={s.label}>Item Name *</label>
              <input
                style={s.input}
                placeholder="e.g. Eggs, Tiramisu Box, Lady Fingers"
                value={addForm.name}
                onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div style={s.field}>
              <label style={s.label}>Category *</label>
              <select
                style={s.input}
                value={addForm.category}
                onChange={e => setAddForm(f => ({ ...f, category: e.target.value as ItemCategory }))}
              >
                <option value="ingredient">Ingredient</option>
                <option value="finished_good">Finished Good</option>
                <option value="packaging">Packaging</option>
              </select>
            </div>
          </div>

          <div style={s.grid3}>
            <div style={s.field}>
              <label style={s.label}>Unit</label>
              <select
                style={s.input}
                value={addForm.unit}
                onChange={e => setAddForm(f => ({ ...f, unit: e.target.value }))}
              >
                <option value="g">Grams (g)</option>
                <option value="ml">Millilitres (ml)</option>
                <option value="pcs">Pieces (pcs)</option>
                <option value="kg">Kilograms (kg)</option>
                <option value="litre">Litres</option>
                <option value="box">Box</option>
                <option value="pack">Pack</option>
              </select>
            </div>
            <div style={s.field}>
              <label style={s.label}>Reorder Level</label>
              <input
                style={s.input}
                type="number"
                min="0"
                placeholder="Alert below this qty"
                value={addForm.reorderLevel}
                onChange={e => setAddForm(f => ({ ...f, reorderLevel: e.target.value }))}
              />
            </div>
            <div style={s.field}>
              <label style={s.label}>Opening Stock Qty</label>
              <input
                style={s.input}
                type="number"
                min="0"
                placeholder="Current qty in hand"
                value={addForm.initialQty}
                onChange={e => setAddForm(f => ({ ...f, initialQty: e.target.value }))}
              />
            </div>
          </div>

          <div style={s.btnRow}>
            <button
              style={{ ...s.primaryBtn, opacity: addSaving ? 0.7 : 1 }}
              onClick={handleAddItem}
              disabled={addSaving}
            >
              {addSaving ? "Adding…" : "Add to Inventory"}
            </button>
          </div>
        </div>
      )}

      {/* ── ADJUST STOCK TAB ── */}
      {tab === "adjust" && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>🔧 Adjust Stock</h3>

          <div style={s.field} >
            <label style={s.label}>Select Item *</label>
            <select
              style={{ ...s.input, marginBottom: 12 }}
              value={adjForm.item_id}
              onChange={e => setAdjForm(f => ({ ...f, item_id: e.target.value }))}
            >
              <option value="">— Select item —</option>
              {stockItems.map(i => (
                <option key={i.id} value={i.id}>
                  {i.name} (currently: {fmt(i.current_qty, 1)} {i.unit})
                </option>
              ))}
            </select>
          </div>

          <div style={s.grid3}>
            <div style={s.field}>
              <label style={s.label}>Adjustment Type</label>
              <select
                style={s.input}
                value={adjForm.type}
                onChange={e => setAdjForm(f => ({ ...f, type: e.target.value as any }))}
              >
                <option value="add">➕ Add Stock (Purchase)</option>
                <option value="remove">➖ Remove Stock (Usage/Loss)</option>
                <option value="set">🔁 Set Exact Quantity</option>
              </select>
            </div>
            <div style={s.field}>
              <label style={s.label}>Quantity</label>
              <input
                style={s.input}
                type="number"
                min="0"
                step="0.01"
                placeholder="Enter quantity"
                value={adjForm.qty}
                onChange={e => setAdjForm(f => ({ ...f, qty: e.target.value }))}
              />
            </div>
            {adjForm.type === "add" && (
              <div style={s.field}>
                <label style={s.label}>Total Cost (₹)</label>
                <input
                  style={s.input}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Optional, for log"
                  value={adjForm.cost}
                  onChange={e => setAdjForm(f => ({ ...f, cost: e.target.value }))}
                />
              </div>
            )}
          </div>

          <div style={s.field}>
            <label style={s.label}>Notes</label>
            <input
              style={{ ...s.input, marginBottom: 16 }}
              placeholder="e.g. Weekly stock purchase, Wastage during prep"
              value={adjForm.notes}
              onChange={e => setAdjForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>

          {adjForm.item_id && adjForm.qty && (
            <div style={s.previewStrip}>
              {(() => {
                const item = stockItems.find(i => i.id === adjForm.item_id)
                if (!item) return null
                const qty = parseFloat(adjForm.qty) || 0
                let newQty = item.current_qty
                if (adjForm.type === "add") newQty = item.current_qty + qty
                else if (adjForm.type === "remove") newQty = Math.max(0, item.current_qty - qty)
                else newQty = qty
                return (
                  <>
                    <span style={{ color: "#6b7280" }}>Current: <strong>{fmt(item.current_qty, 1)} {item.unit}</strong></span>
                    <span style={{ color: "#6b7280", margin: "0 12px" }}>→</span>
                    <span style={{ color: newQty >= item.reorder_level ? "#16a34a" : "#ef4444", fontWeight: 700 }}>
                      New: {fmt(newQty, 1)} {item.unit}
                    </span>
                  </>
                )
              })()}
            </div>
          )}

          <div style={s.btnRow}>
            <button
              style={{ ...s.primaryBtn, opacity: adjSaving ? 0.7 : 1 }}
              onClick={handleAdjust}
              disabled={adjSaving}
            >
              {adjSaving ? "Saving…" : "Update Stock"}
            </button>
          </div>
        </div>
      )}

      {/* ── PURCHASES TAB ── */}
      {tab === "purchases" && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>📥 Purchase Log</h3>
          {purchases.length === 0 ? (
            <div style={s.emptyState}>No purchases logged yet. Use "Adjust Stock → Add" to log purchases.</div>
          ) : (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {["Item", "Qty Added", "Total Cost", "Notes", "Date"].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((p, i) => (
                    <tr key={p.id} style={{ background: i % 2 === 0 ? "white" : "#f9fafb" }}>
                      <td style={{ ...s.td, fontWeight: 600 }}>{p.item_name}</td>
                      <td style={{ ...s.td, textAlign: "right" }}>{fmt(p.qty, 2)} {p.unit}</td>
                      <td style={{ ...s.td, textAlign: "right", fontWeight: 700 }}>
                        {p.total_cost > 0 ? fmtCurrency(p.total_cost) : "—"}
                      </td>
                      <td style={{ ...s.td, color: "#6b7280" }}>{p.notes || "—"}</td>
                      <td style={{ ...s.td, color: "#6b7280", fontSize: 12 }}>{fmtDate(p.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { padding: "16px 16px 80px", maxWidth: 1100, margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  title: { fontSize: 22, fontWeight: 800, color: "#111", margin: 0 },
  subtitle: { fontSize: 13, color: "#6b7280", marginTop: 4 },
  statsRow: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 },
  statCard: {
    background: "white",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
  },
  alertBanner: {
    background: "#fef3c7",
    border: "1px solid #fde68a",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 13,
    color: "#92400e",
    marginBottom: 16,
  },
  tabRow: { display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" },
  tabBtn: {
    height: 36,
    padding: "0 16px",
    border: "1px solid #e5e7eb",
    borderRadius: 20,
    fontSize: 13,
    cursor: "pointer",
  },
  card: {
    background: "white",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 15, fontWeight: 700, color: "#111", margin: "0 0 16px" },
  tableHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 },
  filterRow: { display: "flex", gap: 6, flexWrap: "wrap" },
  filterBtn: { height: 30, padding: "0 12px", border: "none", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer" },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 12, fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: "0.4px" },
  input: { height: 40, padding: "0 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, color: "#111", background: "#fafafa", outline: "none", width: "100%", boxSizing: "border-box" },
  previewStrip: {
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: 8,
    padding: "10px 14px",
    marginBottom: 12,
    fontSize: 14,
  },
  btnRow: { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 },
  primaryBtn: { height: 44, padding: "0 20px", background: "#111", color: "white", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { padding: "10px 12px", background: "#f3f4f6", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" },
  td: { padding: "10px 12px", borderBottom: "1px solid #f3f4f6", color: "#111", whiteSpace: "nowrap" },
  badge: { display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 12, fontWeight: 700 },
  editBtn: { background: "#f3f4f6", border: "none", borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" },
  emptyState: { textAlign: "center", padding: "40px 0", color: "#9ca3af", fontSize: 14 },
  linkBtn: { background: "none", border: "none", color: "#111", fontWeight: 700, cursor: "pointer", textDecoration: "underline", fontSize: 14 },
  errorBanner: { background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 12 },
  successBanner: { background: "#dcfce7", color: "#166534", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 12 },
}
