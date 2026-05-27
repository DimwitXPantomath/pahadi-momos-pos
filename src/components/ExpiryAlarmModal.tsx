import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExpiringBatch {
  id: string
  sub_recipe_name: string
  quantity: number
  unit: string
  expires_at: string
  hours_remaining: number
  shelf_life_hours: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTimeRemaining(hours: number): string {
  if (hours <= 0) return "Expired"
  if (hours < 1) return `${Math.round(hours * 60)}m remaining`
  if (hours < 24) return `${hours.toFixed(1)}h remaining`
  return `${(hours / 24).toFixed(1)}d remaining`
}

function fmt(n: number, d = 1) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: d })
}

function expiryColor(hoursRemaining: number, shelfLifeHours: number): string {
  const pct = hoursRemaining / shelfLifeHours
  if (hoursRemaining <= 0) return "#ef4444"
  if (pct < 0.2 || hoursRemaining < 2) return "#ef4444"
  if (pct < 0.4) return "#d97706"
  return "#16a34a"
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ExpiryAlarmModal({ onDismiss }: { onDismiss: () => void }) {
  const [batches, setBatches] = useState<ExpiringBatch[]>([])
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    checkExpiring()
  }, [])

  async function checkExpiring() {
    // Fetch batches that aren't spoiled, still have quantity, not yet expired-and-ignored
    const { data } = await supabase
      .from("sub_recipe_stock")
      .select(`
        id, quantity, unit, expires_at, alarm_acknowledged, snoozed_until,
        sub_recipes ( name, shelf_life_hours )
      `)
      .eq("is_spoiled", false)
      .eq("alarm_acknowledged", false)
      .gt("quantity", 0)

    if (!data) { setLoaded(true); return }

    const now = Date.now()
    const expiring: ExpiringBatch[] = []

    for (const row of data) {
      // Skip if snoozed
      if (row.snoozed_until && new Date(row.snoozed_until).getTime() > now) continue

      const sr = row.sub_recipes as { name: string; shelf_life_hours: number } | null
      if (!sr) continue

      const expiresMs = new Date(row.expires_at).getTime()
      const hoursRemaining = (expiresMs - now) / (1000 * 3600)
      const threshold = Math.max(sr.shelf_life_hours * 0.3, 2)

      // Only show if within threshold OR already expired
      if (hoursRemaining > threshold) continue

      expiring.push({
        id: row.id,
        sub_recipe_name: sr.name,
        quantity: row.quantity,
        unit: row.unit,
        expires_at: row.expires_at,
        hours_remaining: hoursRemaining,
        shelf_life_hours: sr.shelf_life_hours,
      })
    }

    setBatches(expiring)
    setLoaded(true)
  }

  async function handleChecked(id: string) {
    setCheckedIds(prev => new Set([...prev, id]))
    await supabase
      .from("sub_recipe_stock")
      .update({ alarm_acknowledged: true })
      .eq("id", id)
  }

  async function handleRemindLater() {
    setSaving(true)
    const snoozeUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString() // +1 hour
    const uncheckedIds = batches.filter(b => !checkedIds.has(b.id)).map(b => b.id)
    if (uncheckedIds.length > 0) {
      await supabase
        .from("sub_recipe_stock")
        .update({ snoozed_until: snoozeUntil })
        .in("id", uncheckedIds)
    }
    setSaving(false)
    onDismiss()
  }

  async function handleDismiss() {
    onDismiss()
  }

  // Don't render until we've checked
  if (!loaded) return null
  if (batches.length === 0) return null

  const unchecked = batches.filter(b => !checkedIds.has(b.id))

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        {/* Header */}
        <div style={s.header}>
          <span style={{ fontSize: 22 }}>⚠️</span>
          <div>
            <div style={s.title}>Expiry Alert</div>
            <div style={s.subtitle}>{unchecked.length} batch{unchecked.length !== 1 ? "es" : ""} need attention</div>
          </div>
        </div>

        {/* Batch rows */}
        <div style={s.list}>
          {batches.map(batch => {
            const checked = checkedIds.has(batch.id)
            const color = expiryColor(batch.hours_remaining, batch.shelf_life_hours)
            return (
              <div key={batch.id} style={{ ...s.row, opacity: checked ? 0.4 : 1 }}>
                <div style={s.rowLeft}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: checked ? "#9ca3af" : "#111" }}>
                    {batch.sub_recipe_name}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                    {fmt(batch.quantity)} {batch.unit} in stock
                  </div>
                </div>
                <div style={{ ...s.timeTag, color, borderColor: color }}>
                  {fmtTimeRemaining(batch.hours_remaining)}
                </div>
                {!checked && (
                  <button style={s.checkBtn} onClick={() => handleChecked(batch.id)}>
                    ✓ Checked
                  </button>
                )}
                {checked && (
                  <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 700 }}>Done</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={s.footer}>
          {unchecked.length > 0 ? (
            <>
              <button
                style={{ ...s.snoozeBtn, opacity: saving ? 0.7 : 1 }}
                onClick={handleRemindLater}
                disabled={saving}
              >
                🔔 Remind me in 1h
              </button>
              <button style={s.dismissBtn} onClick={handleDismiss}>
                Dismiss
              </button>
            </>
          ) : (
            <button style={s.primaryBtn} onClick={handleDismiss}>
              All done ✓
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    zIndex: 999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modal: {
    background: "white",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 420,
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: "1px solid #f3f4f6",
  },
  title: { fontSize: 16, fontWeight: 800, color: "#111" },
  subtitle: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  list: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    background: "#fafafa",
    borderRadius: 8,
    border: "1px solid #f3f4f6",
    transition: "opacity 0.2s",
  },
  rowLeft: { flex: 1, minWidth: 0 },
  timeTag: {
    fontSize: 12,
    fontWeight: 700,
    border: "1px solid",
    borderRadius: 20,
    padding: "2px 8px",
    whiteSpace: "nowrap",
  },
  checkBtn: {
    background: "#111",
    color: "white",
    border: "none",
    borderRadius: 6,
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  footer: {
    display: "flex",
    gap: 10,
    justifyContent: "flex-end",
    paddingTop: 12,
    borderTop: "1px solid #f3f4f6",
  },
  snoozeBtn: {
    height: 40,
    padding: "0 16px",
    background: "#fef3c7",
    color: "#92400e",
    border: "1px solid #fde68a",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  dismissBtn: {
    height: 40,
    padding: "0 16px",
    background: "#f3f4f6",
    color: "#374151",
    border: "none",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  primaryBtn: {
    height: 40,
    padding: "0 20px",
    background: "#111",
    color: "white",
    border: "none",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
}
