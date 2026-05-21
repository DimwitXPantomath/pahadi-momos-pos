import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import QRCode from "react-qr-code"

const OUTLET_ID = "demo-outlet"

type LoyaltySettings = {
  id?: string
  outlet_id: string
  points_per_100: number
  value_per_point: number
  min_redeem: number
}

type LoyaltyActivity = {
  id: string
  customer_phone: string
  type: "earned" | "redeemed"
  points: number
  order_id?: string
  created_at: string
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 800, margin: "0 auto" },
  header: { marginBottom: 24 },
  title: { fontSize: 22, fontWeight: 800, color: "#111", margin: 0 },
  subtitle: { color: "#6b7280", fontSize: 14, margin: "4px 0 0" },
  card: { background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: "20px 24px", marginBottom: 16 },
  cardTitle: { fontWeight: 700, fontSize: 15, margin: "0 0 6px" },
  cardDesc: { fontSize: 13, color: "#6b7280", margin: "0 0 16px" },
  label: { fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 },
  input: { width: "100%", padding: "10px 12px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 14, outline: "none", color: "#111", boxSizing: "border-box" as const },
  btn: { padding: "10px 20px", background: "#111", color: "white", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  statCard: { background: "#f9f7f4", borderRadius: 12, padding: "16px", textAlign: "center" as const },
  statVal: { fontSize: 22, fontWeight: 800, color: "#111" },
  statLbl: { fontSize: 12, color: "#6b7280", marginTop: 4 },
}

export default function LoyaltyView() {
  const [loyaltySettings, setLoyaltySettings] = useState<LoyaltySettings>({
    outlet_id: OUTLET_ID,
    points_per_100: 10,
    value_per_point: 0.5,
    min_redeem: 100,
  })
  const [activeTab, setActiveTab] = useState<"overview" | "customers" | "settings">("overview")
  const [activity, setActivity] = useState<LoyaltyActivity[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [customerSearch, setCustomerSearch] = useState("")
  const [stats, setStats] = useState({ customers: 0, issued: 0, redeemed: 0 })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    // Load settings
    const { data: settingsData } = await supabase
      .from("loyalty_settings")
      .select("*")
      .eq("outlet_id", OUTLET_ID)
      .single()

    if (settingsData) setLoyaltySettings(settingsData)

    // Load activity
    const { data: activityData } = await supabase
      .from("loyalty_transactions")
      .select("*")
      .eq("outlet_id", OUTLET_ID)
      .order("created_at", { ascending: false })
      .limit(20)

    if (activityData) setActivity(activityData)

    // Load customer analytics
    const { data: custData } = await supabase
      .from("loyalty_transactions")
      .select("customer_phone, customer_name, type, points, created_at")
      .eq("outlet_id", OUTLET_ID)
      .order("created_at", { ascending: false })

    if (custData) {
      // Group by phone
      const map: Record<string, any> = {}
      custData.forEach(r => {
        if (!map[r.customer_phone]) {
          map[r.customer_phone] = {
            phone: r.customer_phone,
            name: r.customer_name || "",
            visits: 0, totalPoints: 0, lastVisit: r.created_at,
            firstVisit: r.created_at,
          }
        }
        if (r.type === "earned") {
          map[r.customer_phone].visits++
          map[r.customer_phone].totalPoints += r.points
        }
        if (r.created_at > map[r.customer_phone].lastVisit) map[r.customer_phone].lastVisit = r.created_at
      })
      setCustomers(Object.values(map).sort((a, b) => b.totalPoints - a.totalPoints))
    }

    // Load stats
    const { data: statsData } = await supabase
      .from("loyalty_transactions")
      .select("type, points, customer_phone")
      .eq("outlet_id", OUTLET_ID)

    if (statsData) {
      const customers = new Set(statsData.map(r => r.customer_phone)).size
      const issued = statsData.filter(r => r.type === "earned").reduce((s, r) => s + r.points, 0)
      const redeemed = statsData.filter(r => r.type === "redeemed").reduce((s, r) => s + r.points, 0)
      setStats({ customers, issued, redeemed })
    }
  }, [])

  useEffect(() => { load() }, [load])

  const saveSettings = async () => {
    setSaving(true)
    const { error } = await supabase
      .from("loyalty_settings")
      .upsert({ ...loyaltySettings, outlet_id: OUTLET_ID })

    setSaving(false)
    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } else {
      alert("Could not save: " + error.message)
    }
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h2 style={s.title}>Loyalty Points</h2>
        <p style={s.subtitle}>Manage your customer loyalty program</p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, background: "#f3f4f6", borderRadius: 10, padding: 4, marginBottom: 20, width: "fit-content" }}>
        {([["overview", "📊 Overview"], ["customers", "👥 Customers"], ["settings", "⚙️ Settings"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} style={{ padding: "7px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, background: activeTab === key ? "white" : "transparent", color: activeTab === key ? "#111" : "#6b7280", boxShadow: activeTab === key ? "0 1px 4px rgba(0,0,0,0.08)" : "none" }}>{label}</button>
        ))}
      </div>

      {activeTab === "overview" && <>

      {/* QR Code */}
      <div style={s.card}>
        <h3 style={s.cardTitle}>🔗 Customer Loyalty QR</h3>
        <p style={s.cardDesc}>Customers scan this to join your loyalty program and check their points</p>
        <div style={{ display: "flex", justifyContent: "center", margin: "20px 0" }}>
          <QRCode value={`${window.location.origin}/loyalty/${OUTLET_ID}`} size={160} />
        </div>
        <p style={{ textAlign: "center", fontSize: 13, color: "#6b7280" }}>
          Print and place this at your counter
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
        {[
          { label: "Total customers", value: stats.customers, icon: "👥" },
          { label: "Points issued", value: stats.issued.toLocaleString(), icon: "⭐" },
          { label: "Points redeemed", value: stats.redeemed.toLocaleString(), icon: "🎁" },
        ].map(stat => (
          <div key={stat.label} style={s.statCard}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{stat.icon}</div>
            <div style={s.statVal}>{stat.value || "0"}</div>
            <div style={s.statLbl}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Settings */}
      <div style={s.card}>
        <h3 style={s.cardTitle}>⚙️ Points Settings</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div>
            <label style={s.label}>Points per ₹100 spent</label>
            <input
              type="number"
              value={loyaltySettings.points_per_100}
              onChange={e => setLoyaltySettings(prev => ({ ...prev, points_per_100: Number(e.target.value) }))}
              style={s.input}
            />
          </div>
          <div>
            <label style={s.label}>₹ value per point</label>
            <input
              type="number"
              step={0.1}
              value={loyaltySettings.value_per_point}
              onChange={e => setLoyaltySettings(prev => ({ ...prev, value_per_point: Number(e.target.value) }))}
              style={s.input}
            />
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={s.label}>Minimum points to redeem</label>
          <input
            type="number"
            value={loyaltySettings.min_redeem}
            onChange={e => setLoyaltySettings(prev => ({ ...prev, min_redeem: Number(e.target.value) }))}
            style={{ ...s.input, maxWidth: 200 }}
          />
        </div>

        {/* Live preview */}
        <div style={{ background: "#f9f7f4", borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#374151" }}>
          💡 Customer spending ₹500 earns <strong>{Math.floor(500 / 100 * loyaltySettings.points_per_100)} points</strong> worth <strong>₹{(Math.floor(500 / 100 * loyaltySettings.points_per_100) * loyaltySettings.value_per_point).toFixed(2)}</strong>
        </div>

        <button
          onClick={saveSettings}
          disabled={saving}
          style={{ ...s.btn, opacity: saving ? 0.7 : 1, background: saved ? "#16a34a" : "#111" }}
        >
          {saving ? "Saving..." : saved ? "✓ Saved!" : "Save Settings"}
        </button>
      </div>

      {/* Recent activity */}
      <div style={s.card}>
        <h3 style={s.cardTitle}>📋 Recent Activity</h3>
        {activity.length === 0 ? (
          <p style={{ color: "#9ca3af", fontSize: 14, textAlign: "center", padding: "20px 0" }}>
            No activity yet
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Customer", "Type", "Points", "Date"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 12, fontWeight: 600, color: "#6b7280", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activity.map(row => (
                <tr key={row.id}>
                  <td style={{ padding: "8px 12px", fontSize: 13, borderBottom: "1px solid #f3f4f6" }}>{row.customer_phone}</td>
                  <td style={{ padding: "8px 12px", fontSize: 13, borderBottom: "1px solid #f3f4f6" }}>
                    <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: row.type === "earned" ? "#f0fdf4" : "#fef2f2", color: row.type === "earned" ? "#16a34a" : "#dc2626" }}>
                      {row.type === "earned" ? "⭐ Earned" : "🎁 Redeemed"}
                    </span>
                  </td>
                  <td style={{ padding: "8px 12px", fontSize: 13, fontWeight: 600, borderBottom: "1px solid #f3f4f6", color: row.type === "earned" ? "#16a34a" : "#dc2626" }}>
                    {row.type === "earned" ? "+" : "-"}{row.points}
                  </td>
                  <td style={{ padding: "8px 12px", fontSize: 12, color: "#6b7280", borderBottom: "1px solid #f3f4f6" }}>
                    {new Date(row.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      </>}

      {/* CUSTOMERS TAB */}
      {activeTab === "customers" && (
        <div>
          <div style={{ ...s.card, marginBottom: 16 }}>
            <input placeholder="🔍 Search by phone or name..." value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 13, outline: "none" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 16 }}>
            <div style={s.statCard}><div style={{ fontSize: 22, fontWeight: 800, color: "#111" }}>{customers.length}</div><div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>Total Customers</div></div>
            <div style={s.statCard}><div style={{ fontSize: 22, fontWeight: 800, color: "#111" }}>{customers.filter(c => { const d = new Date(c.lastVisit); const now = new Date(); return (now.getTime() - d.getTime()) < 7 * 86400000 }).length}</div><div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>Active (last 7d)</div></div>
            <div style={s.statCard}><div style={{ fontSize: 22, fontWeight: 800, color: "#111" }}>{customers.filter(c => c.visits >= 5).length}</div><div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>Regular (5+ visits)</div></div>
          </div>
          <div style={s.card}>
            <table style={{ width: "100%", borderCollapse: "collapse" as const }}>
              <thead>
                <tr>{["Customer", "Phone", "Visits", "Points", "Last Visit", "Segment"].map(h => <th key={h} style={{ textAlign: "left" as const, padding: "8px 12px", fontSize: 12, fontWeight: 600, color: "#6b7280", borderBottom: "1px solid #e5e7eb" }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {customers.filter(c => !customerSearch || c.phone.includes(customerSearch) || c.name?.toLowerCase().includes(customerSearch.toLowerCase())).map((c, i) => {
                  const daysSinceVisit = Math.floor((Date.now() - new Date(c.lastVisit).getTime()) / 86400000)
                  const segment = c.visits >= 10 ? "🔥 VIP" : c.visits >= 5 ? "⭐ Regular" : c.visits >= 2 ? "👍 Occasional" : "🆕 New"
                  const segColor = c.visits >= 10 ? "#dc2626" : c.visits >= 5 ? "#d97706" : c.visits >= 2 ? "#16a34a" : "#6b7280"
                  return (
                    <tr key={c.phone} style={{ background: i % 2 === 0 ? "white" : "#f9fafb" }}>
                      <td style={{ padding: "8px 12px", fontSize: 13, fontWeight: 600, borderBottom: "1px solid #f3f4f6" }}>{c.name || "—"}</td>
                      <td style={{ padding: "8px 12px", fontSize: 13, borderBottom: "1px solid #f3f4f6" }}>
                        <a href={`https://wa.me/${c.phone.replace(/\D/g,"")}?text=${encodeURIComponent(`Hi ${c.name || ""}! You have ${c.totalPoints} loyalty points at Praang. Visit us again!`)}`} target="_blank" style={{ color: "#25d366", textDecoration: "none" }}>📱 {c.phone}</a>
                      </td>
                      <td style={{ padding: "8px 12px", fontSize: 13, fontWeight: 700, borderBottom: "1px solid #f3f4f6" }}>{c.visits}</td>
                      <td style={{ padding: "8px 12px", fontSize: 13, color: "#f97316", fontWeight: 700, borderBottom: "1px solid #f3f4f6" }}>⭐ {c.totalPoints}</td>
                      <td style={{ padding: "8px 12px", fontSize: 12, color: "#6b7280", borderBottom: "1px solid #f3f4f6" }}>{daysSinceVisit === 0 ? "Today" : `${daysSinceVisit}d ago`}</td>
                      <td style={{ padding: "8px 12px", fontSize: 12, fontWeight: 600, color: segColor, borderBottom: "1px solid #f3f4f6" }}>{segment}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SETTINGS TAB */}
      {activeTab === "settings" && (
        <div>
          {/* existing settings content */}
          <div style={s.card}>
            <h3 style={s.cardTitle}>⚙️ Points Settings</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div><label style={s.label}>Points per ₹100 spent</label><input type="number" value={loyaltySettings.points_per_100} onChange={e => setLoyaltySettings(prev => ({ ...prev, points_per_100: Number(e.target.value) }))} style={s.input} /></div>
              <div><label style={s.label}>₹ value per point</label><input type="number" step={0.1} value={loyaltySettings.value_per_point} onChange={e => setLoyaltySettings(prev => ({ ...prev, value_per_point: Number(e.target.value) }))} style={s.input} /></div>
            </div>
            <div style={{ marginBottom: 16 }}><label style={s.label}>Minimum points to redeem</label><input type="number" value={loyaltySettings.min_redeem} onChange={e => setLoyaltySettings(prev => ({ ...prev, min_redeem: Number(e.target.value) }))} style={{ ...s.input, maxWidth: 200 }} /></div>
            <div style={{ background: "#f9f7f4", borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 13 }}>
              💡 Customer spending ₹500 earns <strong>{Math.floor(500 / 100 * loyaltySettings.points_per_100)} points</strong> worth <strong>₹{(Math.floor(500 / 100 * loyaltySettings.points_per_100) * loyaltySettings.value_per_point).toFixed(2)}</strong>
            </div>
            <button onClick={saveSettings} disabled={saving} style={{ ...s.btn, opacity: saving ? 0.7 : 1, background: saved ? "#16a34a" : "#111" }}>{saving ? "Saving..." : saved ? "✓ Saved!" : "Save Settings"}</button>
          </div>
        </div>
      )}
    </div>
  )
}
