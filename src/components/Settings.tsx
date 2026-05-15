import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import type { POSSettings } from "@/types/pos"

type Props = {
  settings: POSSettings
  setSettings: React.Dispatch<React.SetStateAction<POSSettings>>
}

export default function Settings({ settings, setSettings }: Props) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Load persisted settings from Supabase on mount
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("outlet_settings")
        .select("*")
        .eq("outlet_id", "demo-outlet")
        .single()

      if (data?.settings) {
        setSettings(prev => ({ ...prev, ...data.settings }))
      }
    }
    load()
  }, [])

  const saveToSupabase = async (newSettings: POSSettings) => {
    setSaving(true)
    await supabase
      .from("outlet_settings")
      .upsert({ outlet_id: "demo-outlet", settings: newSettings })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const update = (patch: Partial<POSSettings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    saveToSupabase(next)
  }

  const updatePrinterRole = (id: string, role: string) => {
    const updated = settings.printers.map((p: any) =>
      p.id === id ? { ...p, role } : p
    )
    update({ printers: updated })
  }

  return (
    <div style={{ maxWidth: 700, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Settings</h2>
        {saving && <span style={{ fontSize: 12, color: "#6b7280" }}>Saving...</span>}
        {saved && <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}>✓ Saved</span>}
      </div>

      {/* POS Mode */}
      <div style={card}>
        <h3 style={cardTitle}>POS Mode</h3>
        <p style={cardDesc}>Switch between self-service (token-based) and table service mode</p>
        <div style={{ display: "flex", gap: 8 }}>
          {([
            { value: "SELF_SERVICE", label: "🎟️ Self-service", desc: "Token-based, quick counters" },
            { value: "TABLE_SERVICE", label: "🪑 Table service", desc: "Cafes, dine-in restaurants" },
          ] as const).map(opt => (
            <button
              key={opt.value}
              onClick={() => update({ posMode: opt.value })}
              style={{
                flex: 1, padding: "12px", borderRadius: 10, border: "2px solid",
                borderColor: settings.posMode === opt.value ? "#111" : "#e5e7eb",
                background: settings.posMode === opt.value ? "#111" : "white",
                color: settings.posMode === opt.value ? "white" : "#374151",
                cursor: "pointer", fontWeight: 600, fontSize: 13, textAlign: "left",
              }}
            >
              <div>{opt.label}</div>
              <div style={{ fontSize: 11, fontWeight: 400, marginTop: 2, opacity: 0.7 }}>{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Kitchen Display */}
      <div style={card}>
        <h3 style={cardTitle}>Kitchen Display System</h3>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={settings.kdsEnabled}
            onChange={e => update({ kdsEnabled: e.target.checked })}
            style={{ width: 16, height: 16 }}
          />
          <span style={{ fontSize: 14 }}>Enable Kitchen Display Screen</span>
        </label>
      </div>

      {/* Order Alerts */}
      <div style={card}>
        <h3 style={cardTitle}>Order Delay Alert</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <label style={{ fontSize: 14, color: "#374151" }}>Alert after</label>
          <input
            type="number"
            value={settings.delayAlertMinutes}
            onChange={e => update({ delayAlertMinutes: Number(e.target.value) })}
            style={{ width: 70, padding: "6px 10px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 14, outline: "none" }}
          />
          <label style={{ fontSize: 14, color: "#374151" }}>minutes without update</label>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginTop: 12 }}>
          <input
            type="checkbox"
            checked={settings.soundAlert}
            onChange={e => update({ soundAlert: e.target.checked })}
            style={{ width: 16, height: 16 }}
          />
          <span style={{ fontSize: 14 }}>Play sound on delay alert</span>
        </label>
      </div>

      {/* Auto sort */}
      <div style={card}>
        <h3 style={cardTitle}>Order Display</h3>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={settings.autoSortOrders}
            onChange={e => update({ autoSortOrders: e.target.checked })}
            style={{ width: 16, height: 16 }}
          />
          <span style={{ fontSize: 14 }}>Auto-sort orders by wait time (oldest first)</span>
        </label>
      </div>

      {/* Printer Setup */}
      <div style={card}>
        <h3 style={cardTitle}>Printer Setup</h3>
        {settings.printers?.map((printer: any) => (
          <div key={printer.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 14 }}>{printer.name}</span>
            <select
              value={printer.role}
              onChange={e => updatePrinterRole(printer.id, e.target.value)}
              style={{ padding: "6px 10px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 13, background: "white" }}
            >
              <option value="BILL">Bill Printer</option>
              <option value="KOT">Kitchen Printer</option>
              <option value="BOTH">Both</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}

const card: React.CSSProperties = {
  background: "white", border: "1px solid #e5e7eb",
  borderRadius: 12, padding: "18px 22px", marginBottom: 14,
}
const cardTitle: React.CSSProperties = { fontWeight: 700, fontSize: 15, margin: "0 0 4px" }
const cardDesc: React.CSSProperties = { fontSize: 13, color: "#6b7280", margin: "0 0 14px" }
