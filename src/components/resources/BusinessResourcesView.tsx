import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { BUSINESS_RESOURCES, CATEGORY_LABELS, type ResourceCategory } from "@/data/businessResources"

const OUTLET_ID = "demo-outlet"

export default function BusinessResourcesView() {
  const [progress, setProgress] = useState<Record<string, boolean>>({})
  const [category, setCategory] = useState<ResourceCategory | "all">("all")
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("business_resource_progress")
      .select("resource_id, completed")
      .eq("outlet_id", OUTLET_ID)
    const map: Record<string, boolean> = {}
    ;(data || []).forEach(r => { map[r.resource_id] = r.completed })
    setProgress(map)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const toggleDone = async (resourceId: string) => {
    const next = !progress[resourceId]
    setProgress(prev => ({ ...prev, [resourceId]: next }))
    await supabase
      .from("business_resource_progress")
      .upsert({ outlet_id: OUTLET_ID, resource_id: resourceId, completed: next, completed_at: new Date().toISOString() }, { onConflict: "outlet_id,resource_id" })
  }

  const filtered = category === "all" ? BUSINESS_RESOURCES : BUSINESS_RESOURCES.filter(r => r.category === category)
  const doneCount = BUSINESS_RESOURCES.filter(r => progress[r.id]).length

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h2 style={s.title}>🚀 Business Setup Guide</h2>
          <p style={s.subtitle}>
            Licenses, registrations, and official links for running a food business in India — informational only, not legal advice. Always confirm on the official portal.
          </p>
        </div>
        <div style={s.progressPill}>{doneCount} / {BUSINESS_RESOURCES.length} done</div>
      </div>

      <div style={s.disclaimer}>
        ⚠️ This is a research checklist, not a substitute for a lawyer or CA. Requirements vary by state and change over time — verify current rules before applying. See <code>docs/business-documents-checklist.md</code> in the project for the full context on why templates aren't included here.
      </div>

      <div style={s.tabRow}>
        <button onClick={() => setCategory("all")} style={{ ...s.tabBtn, ...(category === "all" ? s.tabBtnActive : {}) }}>All</button>
        {(Object.keys(CATEGORY_LABELS) as ResourceCategory[]).map(c => (
          <button key={c} onClick={() => setCategory(c)} style={{ ...s.tabBtn, ...(category === c ? s.tabBtnActive : {}) }}>
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={s.empty}>Loading…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(r => {
            const isDone = !!progress[r.id]
            const isOpen = expanded === r.id
            return (
              <div key={r.id} style={{ ...s.card, borderColor: isDone ? "#bbf7d0" : "#e5e7eb", background: isDone ? "#f9fefb" : "white" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <input
                    type="checkbox"
                    checked={isDone}
                    onChange={() => toggleDone(r.id)}
                    style={{ width: 18, height: 18, marginTop: 3, cursor: "pointer", flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setExpanded(isOpen ? null : r.id)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 15, textDecoration: isDone ? "line-through" : "none", color: isDone ? "#6b7280" : "#111" }}>
                        {r.name}
                      </span>
                      <span style={s.catBadge}>{CATEGORY_LABELS[r.category]}</span>
                    </div>
                    <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>{r.description}</p>
                    <p style={{ fontSize: 12, color: "#9ca3af", margin: "4px 0 0" }}>Applies when: {r.appliesWhen}</p>

                    {isOpen && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #f3f4f6" }}>
                        {r.officialUrl ? (
                          <a href={r.officialUrl} target="_blank" rel="noreferrer" style={s.link} onClick={e => e.stopPropagation()}>
                            🔗 Official portal: {r.officialUrl}
                          </a>
                        ) : (
                          <div style={s.verifyBox}>
                            ⚠️ No single national portal for this one. {r.verifyNote}
                          </div>
                        )}
                        <p style={{ fontSize: 12, fontWeight: 700, color: "#374151", margin: "12px 0 4px" }}>Steps:</p>
                        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#374151" }}>
                          {r.steps.map((step, i) => <li key={i} style={{ marginBottom: 4 }}>{step}</li>)}
                        </ol>
                        {r.timeline && (
                          <p style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>⏱ Typical timeline: {r.timeline}</p>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setExpanded(isOpen ? null : r.id)}
                    style={s.expandBtn}
                  >{isOpen ? "▾" : "▸"}</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: "16px 16px 80px", maxWidth: 900, margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, gap: 16, flexWrap: "wrap" },
  title: { fontSize: 22, fontWeight: 800, color: "#111", margin: 0 },
  subtitle: { fontSize: 13, color: "#6b7280", marginTop: 4, maxWidth: 560 },
  progressPill: { background: "hsl(var(--primary))", color: "white", borderRadius: 20, padding: "6px 14px", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" },
  disclaimer: { background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#92400e", marginBottom: 16, lineHeight: 1.5 },
  tabRow: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 },
  tabBtn: { padding: "6px 14px", borderRadius: 20, border: "1.5px solid #e5e7eb", background: "white", color: "#374151", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  tabBtnActive: { borderColor: "hsl(var(--primary))", background: "hsl(var(--primary))", color: "white" },
  card: { border: "1.5px solid", borderRadius: 12, padding: "14px 16px" },
  catBadge: { fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "#f3f4f6", color: "#6b7280" },
  expandBtn: { background: "none", border: "none", fontSize: 16, color: "#9ca3af", cursor: "pointer", flexShrink: 0 },
  link: { display: "block", fontSize: 13, color: "#2563eb", wordBreak: "break-all" as const, textDecoration: "none", marginBottom: 4 },
  verifyBox: { background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#991b1b", lineHeight: 1.5 },
  empty: { textAlign: "center", padding: "40px 0", color: "#9ca3af" },
}
