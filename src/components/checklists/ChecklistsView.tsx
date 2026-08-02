import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/AuthContext"

const OUTLET_ID = "demo-outlet"

type Category = "cleaning" | "pest_control" | "temperature" | "handwashing" | "custom"

const CATEGORY_LABELS: Record<Category, string> = {
  cleaning: "🧹 Cleaning",
  pest_control: "🐜 Pest Control",
  temperature: "🌡️ Temperature",
  handwashing: "🧼 Handwashing",
  custom: "📋 Custom",
}

type Template = {
  id: string
  name: string
  category: Category
  frequency: "daily" | "weekly" | "monthly"
  is_active: boolean
  sort_order: number
}

type TemplateItem = {
  id: string
  template_id: string
  label: string
  value_type: "check" | "number" | "text"
  unit: string | null
  sort_order: number
}

type LogEntry = { checked: boolean; value: string | null }
type HistoryLog = {
  id: string
  log_date: string
  completed_by: string | null
  notes: string | null
  entries: LogEntry[]
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function ChecklistsView() {
  const { profile } = useAuth()
  const [templates, setTemplates] = useState<Template[]>([])
  const [category, setCategory] = useState<Category | "all">("all")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [items, setItems] = useState<TemplateItem[]>([])
  const [entries, setEntries] = useState<Record<string, { checked: boolean; value: string }>>({})
  const [completedBy, setCompletedBy] = useState("")
  const [notes, setNotes] = useState("")
  const [existingLogId, setExistingLogId] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryLog[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("checklist_templates")
        .select("*")
        .eq("outlet_id", OUTLET_ID)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
      setTemplates(data || [])
      setLoading(false)
      if (data && data.length > 0) setSelectedId(data[0].id)
    })()
  }, [])

  const loadTemplate = useCallback(async (templateId: string) => {
    setShowHistory(false)
    setCompletedBy(profile?.full_name || "")
    setNotes("")

    const { data: itemRows } = await supabase
      .from("checklist_template_items")
      .select("*")
      .eq("template_id", templateId)
      .order("sort_order", { ascending: true })
    setItems(itemRows || [])

    const { data: logRow } = await supabase
      .from("checklist_logs")
      .select("*")
      .eq("template_id", templateId)
      .eq("log_date", todayISO())
      .maybeSingle()

    if (logRow) {
      setExistingLogId(logRow.id)
      setCompletedBy(logRow.completed_by || profile?.full_name || "")
      setNotes(logRow.notes || "")
      const { data: entryRows } = await supabase
        .from("checklist_log_entries")
        .select("*")
        .eq("log_id", logRow.id)
      const map: Record<string, { checked: boolean; value: string }> = {}
      ;(entryRows || []).forEach(e => {
        map[e.template_item_id] = { checked: !!e.checked, value: e.value ?? "" }
      })
      setEntries(map)
    } else {
      setExistingLogId(null)
      setEntries({})
    }
  }, [profile?.full_name])

  useEffect(() => {
    if (selectedId) loadTemplate(selectedId)
  }, [selectedId, loadTemplate])

  const loadHistory = async (templateId: string) => {
    const { data } = await supabase
      .from("checklist_logs")
      .select("id, log_date, completed_by, notes, entries:checklist_log_entries(checked, value)")
      .eq("template_id", templateId)
      .order("log_date", { ascending: false })
      .limit(14)
    setHistory((data as any) || [])
    setShowHistory(true)
  }

  const setEntry = (itemId: string, patch: Partial<{ checked: boolean; value: string }>) => {
    setEntries(prev => ({ ...prev, [itemId]: { checked: false, value: "", ...prev[itemId], ...patch } }))
  }

  const saveLog = async () => {
    if (!selectedId) return
    setSaving(true)

    const { data: logRow, error: logErr } = await supabase
      .from("checklist_logs")
      .upsert(
        { id: existingLogId ?? undefined, template_id: selectedId, outlet_id: OUTLET_ID, log_date: todayISO(), completed_by: completedBy || null, notes: notes || null, updated_at: new Date().toISOString() },
        { onConflict: "template_id,log_date" }
      )
      .select()
      .single()

    if (logErr || !logRow) { setSaving(false); return }
    setExistingLogId(logRow.id)

    const rows = items.map(item => ({
      log_id: logRow.id,
      template_item_id: item.id,
      checked: entries[item.id]?.checked ?? false,
      value: entries[item.id]?.value || null,
      checked_at: new Date().toISOString(),
    }))
    if (rows.length > 0) {
      await supabase.from("checklist_log_entries").upsert(rows, { onConflict: "log_id,template_item_id" })
    }

    setSaving(false)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1800)
  }

  const filteredTemplates = category === "all" ? templates : templates.filter(t => t.category === category)
  const selected = templates.find(t => t.id === selectedId)
  const checkedCount = items.filter(i => entries[i.id]?.checked).length
  const checkItemCount = items.filter(i => i.value_type === "check").length

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h2 style={s.title}>✅ Daily Checklists & Logs</h2>
          <p style={s.subtitle}>Preset hygiene and compliance templates — fill them each day, history is kept automatically as your audit trail.</p>
        </div>
      </div>

      <div style={s.tabRow}>
        <button onClick={() => setCategory("all")} style={{ ...s.tabBtn, ...(category === "all" ? s.tabBtnActive : {}) }}>All</button>
        {(Object.keys(CATEGORY_LABELS) as Category[]).map(c => (
          <button key={c} onClick={() => setCategory(c)} style={{ ...s.tabBtn, ...(category === c ? s.tabBtnActive : {}) }}>
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={s.empty}>Loading…</div>
      ) : (
        <div style={s.layout}>
          <div style={s.list}>
            {filteredTemplates.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                style={{ ...s.listItem, ...(selectedId === t.id ? s.listItemActive : {}) }}
              >
                <span style={{ fontWeight: 700, fontSize: 13 }}>{t.name}</span>
                <span style={s.freqBadge}>{t.frequency}</span>
              </button>
            ))}
          </div>

          <div style={s.detail}>
            {!selected ? (
              <div style={s.empty}>Select a checklist.</div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{selected.name}</h3>
                    <p style={{ margin: "2px 0 0", fontSize: 12, color: "#9ca3af" }}>
                      {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}
                      {checkItemCount > 0 && ` · ${checkedCount}/${checkItemCount} checked`}
                      {existingLogId && " · already filled today (editing)"}
                    </p>
                  </div>
                  <button onClick={() => loadHistory(selected.id)} style={s.historyBtn}>🕘 History</button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
                  {items.map(item => (
                    <div key={item.id} style={s.itemRow}>
                      {item.value_type === "check" && (
                        <label style={s.checkLabel}>
                          <input
                            type="checkbox"
                            checked={!!entries[item.id]?.checked}
                            onChange={e => setEntry(item.id, { checked: e.target.checked })}
                            style={{ width: 18, height: 18, cursor: "pointer" }}
                          />
                          <span>{item.label}</span>
                        </label>
                      )}
                      {item.value_type === "number" && (
                        <div style={s.valueRow}>
                          <span style={{ fontSize: 13 }}>{item.label}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <input
                              type="number"
                              step="0.1"
                              value={entries[item.id]?.value ?? ""}
                              onChange={e => setEntry(item.id, { value: e.target.value, checked: e.target.value !== "" })}
                              style={s.numInput}
                              placeholder="—"
                            />
                            {item.unit && <span style={{ fontSize: 12, color: "#6b7280" }}>{item.unit}</span>}
                          </div>
                        </div>
                      )}
                      {item.value_type === "text" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <span style={{ fontSize: 13 }}>{item.label}</span>
                          <input
                            type="text"
                            value={entries[item.id]?.value ?? ""}
                            onChange={e => setEntry(item.id, { value: e.target.value, checked: e.target.value.trim() !== "" })}
                            style={s.textInput}
                            placeholder="Optional notes…"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                  <input
                    type="text"
                    value={completedBy}
                    onChange={e => setCompletedBy(e.target.value)}
                    placeholder="Completed by (name)"
                    style={{ ...s.textInput, maxWidth: 220 }}
                  />
                  <input
                    type="text"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    style={{ ...s.textInput, flex: 1, minWidth: 180 }}
                  />
                </div>

                <button onClick={saveLog} disabled={saving} style={{ ...s.saveBtn, opacity: saving ? 0.6 : 1 }}>
                  {savedFlash ? "✓ Saved" : saving ? "Saving…" : existingLogId ? "Update today's log" : "Save today's log"}
                </button>

                {showHistory && (
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #f3f4f6" }}>
                    <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Last {history.length} entries</p>
                    {history.length === 0 ? (
                      <p style={{ fontSize: 12, color: "#9ca3af" }}>No history yet.</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {history.map(h => {
                          const done = h.entries.filter(e => e.checked).length
                          return (
                            <div key={h.id} style={s.historyRow}>
                              <span style={{ fontWeight: 600 }}>{new Date(h.log_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                              <span style={{ color: "#6b7280" }}>{h.completed_by || "—"}</span>
                              <span style={{ color: "#6b7280" }}>{done}/{h.entries.length} logged</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: "16px 16px 80px", maxWidth: 1000, margin: "0 auto" },
  header: { marginBottom: 12 },
  title: { fontSize: 22, fontWeight: 800, color: "#111", margin: 0 },
  subtitle: { fontSize: 13, color: "#6b7280", marginTop: 4, maxWidth: 560 },
  tabRow: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 },
  tabBtn: { padding: "6px 14px", borderRadius: 20, border: "1.5px solid #e5e7eb", background: "white", color: "#374151", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  tabBtnActive: { borderColor: "#111", background: "#111", color: "white" },
  layout: { display: "flex", gap: 16, flexWrap: "wrap" as const },
  list: { display: "flex", flexDirection: "column" as const, gap: 6, minWidth: 200, flex: "0 0 220px" },
  listItem: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e5e7eb", background: "white", cursor: "pointer", textAlign: "left" as const },
  listItemActive: { borderColor: "#111", background: "#111", color: "white" },
  freqBadge: { fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, opacity: 0.6 },
  detail: { flex: "1 1 400px", background: "white", border: "1px solid #e5e7eb", borderRadius: 12, padding: "18px 20px", minWidth: 280 },
  itemRow: { borderBottom: "1px solid #f3f4f6", paddingBottom: 8 },
  checkLabel: { display: "flex", alignItems: "center", gap: 10, fontSize: 13, cursor: "pointer" },
  valueRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 },
  numInput: { width: 80, padding: "6px 8px", border: "1.5px solid #e5e7eb", borderRadius: 6, fontSize: 13, outline: "none" },
  textInput: { padding: "8px 10px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" as const },
  saveBtn: { marginTop: 16, padding: "10px 20px", background: "#111", color: "white", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" },
  historyBtn: { padding: "6px 12px", background: "white", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" },
  historyRow: { display: "flex", justifyContent: "space-between", fontSize: 12, padding: "6px 10px", background: "#fafafa", borderRadius: 6 },
  empty: { textAlign: "center", padding: "40px 0", color: "#9ca3af" },
}
