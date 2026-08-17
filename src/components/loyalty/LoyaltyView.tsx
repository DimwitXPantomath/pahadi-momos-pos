import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { sanitizePhoneDigits, parseDbTimestamp } from "@/lib/utils"
import QRCode from "react-qr-code"
import type { StampCardProgram, StampCard, RewardType } from "@/types/loyalty"
import { describeReward } from "@/types/loyalty"
import {
  fetchStampProgram, saveStampProgram, lookupCardByPhone, issueStampCard,
  fetchRecentStampEvents, fetchStampCardStats,
} from "@/services/stampCardService"

const OUTLET_ID = "demo-outlet"

type LoyaltySettings = {
  id?: string
  outlet_id: string
  points_per_100: number
  value_per_point: number
  min_redeem: number
  is_active: boolean
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
  btn: { padding: "10px 20px", background: "hsl(var(--primary))", color: "white", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  statCard: { background: "#f9f7f4", borderRadius: 12, padding: "16px", textAlign: "center" as const },
  statVal: { fontSize: 22, fontWeight: 800, color: "#111" },
  statLbl: { fontSize: 12, color: "#6b7280", marginTop: 4 },
}

export default function LoyaltyView() {
  const [tab, setTab] = useState<"points" | "stamps">("points")

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h2 style={s.title}>Loyalty</h2>
        <p style={s.subtitle}>Points program and stamp-card program — run independently, side by side</p>
      </div>

      <div style={{ display: "flex", gap: 0, background: "#f3f4f6", borderRadius: 10, padding: 4, marginBottom: 20, width: "fit-content" }}>
        {(["points", "stamps"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13,
              background: tab === t ? "white" : "transparent",
              color: tab === t ? "hsl(var(--primary))" : "#6b7280",
              boxShadow: tab === t ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            }}
          >
            {t === "points" ? "⭐ Points" : "🎟️ Stamp Cards"}
          </button>
        ))}
      </div>

      {tab === "points" ? <PointsProgram /> : <StampCardProgramView />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Points program — unchanged from before, just extracted into its own component
// ═══════════════════════════════════════════════════════════════════════════

function PointsProgram() {
  const [loyaltySettings, setLoyaltySettings] = useState<LoyaltySettings>({
    outlet_id: OUTLET_ID,
    points_per_100: 10,
    value_per_point: 0.5,
    min_redeem: 100,
    is_active: true,
  })
  const [activity, setActivity] = useState<LoyaltyActivity[]>([])
  const [stats, setStats] = useState({ customers: 0, issued: 0, redeemed: 0 })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    const { data: settingsData } = await supabase
      .from("loyalty_settings")
      .select("*")
      .eq("outlet_id", OUTLET_ID)
      .single()

    if (settingsData) setLoyaltySettings(settingsData)

    const { data: activityData } = await supabase
      .from("loyalty_transactions")
      .select("*")
      .eq("outlet_id", OUTLET_ID)
      .order("created_at", { ascending: false })
      .limit(20)

    if (activityData) setActivity(activityData)

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
    <>
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

        <div style={{ background: "#f9f7f4", borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#374151" }}>
          💡 Customer spending ₹500 earns <strong>{Math.floor(500 / 100 * loyaltySettings.points_per_100)} points</strong> worth <strong>₹{(Math.floor(500 / 100 * loyaltySettings.points_per_100) * loyaltySettings.value_per_point).toFixed(2)}</strong>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <input
            type="checkbox"
            id="points-active"
            checked={loyaltySettings.is_active}
            onChange={e => setLoyaltySettings(prev => ({ ...prev, is_active: e.target.checked }))}
          />
          <label htmlFor="points-active" style={{ fontSize: 13, color: "#374151" }}>Program active (orders earn points at checkout)</label>
        </div>

        <button
          onClick={saveSettings}
          disabled={saving}
          style={{ ...s.btn, opacity: saving ? 0.7 : 1, background: saved ? "#16a34a" : "hsl(var(--primary))" }}
        >
          {saving ? "Saving..." : saved ? "✓ Saved!" : "Save Settings"}
        </button>
      </div>

      <div style={s.card}>
        <h3 style={s.cardTitle}>📋 Recent Activity</h3>
        {activity.length === 0 ? (
          <p style={{ color: "#9ca3af", fontSize: 14, textAlign: "center", padding: "20px 0" }}>
            No activity yet — customers will appear here after scanning and earning points
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
                    {parseDbTimestamp(row.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Stamp card program — new
// ═══════════════════════════════════════════════════════════════════════════

function StampCardProgramView() {
  const [program, setProgram] = useState<StampCardProgram | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [stats, setStats] = useState({ totalCards: 0, rewardReady: 0, redeemed: 0 })
  const [activity, setActivity] = useState<Awaited<ReturnType<typeof fetchRecentStampEvents>>>([])

  // Lookup / issue tool
  const [lookupPhone, setLookupPhone] = useState("")
  const [lookupName, setLookupName] = useState("")
  const [lookedUpCard, setLookedUpCard] = useState<StampCard | null | "not_found">(null)
  const [looking, setLooking] = useState(false)

  const load = useCallback(async () => {
    const prog = await fetchStampProgram(OUTLET_ID)
    if (prog) setProgram(prog)
    setStats(await fetchStampCardStats(OUTLET_ID))
    setActivity(await fetchRecentStampEvents(OUTLET_ID))
  }, [])

  useEffect(() => { load() }, [load])

  const updateProgram = (patch: Partial<StampCardProgram>) => {
    setProgram(prev => prev ? { ...prev, ...patch } : prev)
  }

  const save = async () => {
    if (!program) return
    setSaving(true)
    const result = await saveStampProgram({ ...program, outlet_id: OUTLET_ID })
    setSaving(false)
    if (result) {
      setProgram(result)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } else {
      alert("Could not save stamp card program")
    }
  }

  const runLookup = async () => {
    if (!program) return
    const digits = lookupPhone.replace(/\D/g, "")
    if (digits.length < 10) { alert("Enter a 10-digit phone number"); return }
    setLooking(true)
    const card = await lookupCardByPhone(program.id, digits, OUTLET_ID)
    setLookedUpCard(card ?? "not_found")
    setLooking(false)
  }

  const issueCard = async () => {
    if (!program) return
    const digits = lookupPhone.replace(/\D/g, "")
    if (digits.length < 10) { alert("Enter a 10-digit phone number"); return }
    const card = await issueStampCard({ programId: program.id, phone: digits, name: lookupName || undefined, outletId: OUTLET_ID })
    setLookedUpCard(card)
    load()
  }

  if (!program) {
    return <div style={s.card}><p style={{ color: "#9ca3af", textAlign: "center", padding: "20px 0" }}>Loading…</p></div>
  }

  return (
    <>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
        {[
          { label: "Cards issued", value: stats.totalCards, icon: "🎟️" },
          { label: "Reward ready now", value: stats.rewardReady, icon: "🎁" },
          { label: "Redeemed all-time", value: stats.redeemed, icon: "✅" },
        ].map(stat => (
          <div key={stat.label} style={s.statCard}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{stat.icon}</div>
            <div style={s.statVal}>{stat.value || "0"}</div>
            <div style={s.statLbl}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Counter QR — opens the online self-order page, not a printed card */}
      <div style={s.card}>
        <h3 style={s.cardTitle}>🔗 Order Online QR</h3>
        <p style={s.cardDesc}>Customers scan this to browse the menu and order from their phone. A stamp is added once staff mark the order paid — see Orders.</p>
        <div style={{ display: "flex", justifyContent: "center", margin: "20px 0" }}>
          <QRCode value={`${window.location.origin}/order-online/${OUTLET_ID}`} size={160} />
        </div>
        <p style={{ textAlign: "center", fontSize: 13, color: "#6b7280" }}>
          Print and place this at your counter or table
        </p>
      </div>

      {/* Program config */}
      <div style={s.card}>
        <h3 style={s.cardTitle}>⚙️ Stamp Card Settings</h3>
        <p style={s.cardDesc}>One order = one stamp. Customer gets the reward once their card is full.</p>

        <div style={{ marginBottom: 16 }}>
          <label style={s.label}>Card name (shown to customer)</label>
          <input
            value={program.name}
            onChange={e => updateProgram({ name: e.target.value })}
            style={s.input}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={s.label}>Stamps required to fill the card</label>
          <input
            type="number"
            min={1}
            value={program.stamps_required}
            onChange={e => updateProgram({ stamps_required: Math.max(1, Number(e.target.value)) })}
            style={{ ...s.input, maxWidth: 160 }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={s.label}>Reward type</label>
          <div style={{ display: "flex", gap: 8 }}>
            {([
              { v: "discount_percent", l: "% discount" },
              { v: "discount_flat", l: "₹ flat discount" },
              { v: "complimentary_item", l: "Complimentary item" },
            ] as { v: RewardType; l: string }[]).map(opt => (
              <button
                key={opt.v}
                onClick={() => updateProgram({ reward_type: opt.v })}
                style={{
                  flex: 1, padding: "8px", borderRadius: 8, border: "1.5px solid",
                  borderColor: program.reward_type === opt.v ? "hsl(var(--primary))" : "#e5e7eb",
                  background: program.reward_type === opt.v ? "hsl(var(--primary))" : "white",
                  color: program.reward_type === opt.v ? "white" : "#374151",
                  cursor: "pointer", fontWeight: 600, fontSize: 13,
                }}
              >{opt.l}</button>
            ))}
          </div>
        </div>

        {program.reward_type !== "complimentary_item" && (
          <div style={{ marginBottom: 16 }}>
            <label style={s.label}>
              {program.reward_type === "discount_percent" ? "Discount percent" : "Discount amount (₹)"}
            </label>
            <input
              type="number"
              value={program.reward_value ?? ""}
              onChange={e => updateProgram({ reward_value: Number(e.target.value) })}
              style={{ ...s.input, maxWidth: 160 }}
            />
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={s.label}>{program.reward_type === "complimentary_item" ? "What's complimentary?" : "Reward note (optional)"}</label>
          <input
            placeholder={program.reward_type === "complimentary_item" ? "e.g. Free Chicken Momo Plate" : "e.g. valid on food items only"}
            value={program.reward_description ?? ""}
            onChange={e => updateProgram({ reward_description: e.target.value })}
            style={s.input}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <input
            type="checkbox"
            id="stamp-active"
            checked={program.is_active}
            onChange={e => updateProgram({ is_active: e.target.checked })}
          />
          <label htmlFor="stamp-active" style={{ fontSize: 13, color: "#374151" }}>Program active (staff can stamp/redeem at checkout)</label>
        </div>

        <div style={{ background: "#f9f7f4", borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#374151" }}>
          💡 After {program.stamps_required} orders, customer gets: <strong>{describeReward(program)}</strong>
        </div>

        <button
          onClick={save}
          disabled={saving}
          style={{ ...s.btn, opacity: saving ? 0.7 : 1, background: saved ? "#16a34a" : "hsl(var(--primary))" }}
        >
          {saving ? "Saving..." : saved ? "✓ Saved!" : "Save Settings"}
        </button>
      </div>

      {/* Look up / issue a card */}
      <div style={s.card}>
        <h3 style={s.cardTitle}>🔍 Look up or issue a card</h3>
        <p style={s.cardDesc}>Same phone number CartPanel already collects at checkout — cards stamp automatically from there. Use this to hand a customer a physical card before their first order, or to check someone's progress.</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            type="tel"
            maxLength={10}
            placeholder="📞 Customer phone"
            value={lookupPhone}
            onChange={e => { setLookupPhone(sanitizePhoneDigits(e.target.value)); setLookedUpCard(null) }}
            style={{ ...s.input, flex: 1 }}
          />
          <input
            placeholder="👤 Name (optional)"
            value={lookupName}
            onChange={e => setLookupName(e.target.value)}
            style={{ ...s.input, flex: 1 }}
          />
          <button onClick={runLookup} disabled={looking} style={{ ...s.btn, whiteSpace: "nowrap" }}>
            {looking ? "..." : "Look up"}
          </button>
        </div>

        {lookedUpCard === "not_found" && (
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, color: "#92400e" }}>No card yet for this number.</span>
            <button onClick={issueCard} style={{ ...s.btn, padding: "6px 14px", fontSize: 12 }}>Issue new card</button>
          </div>
        )}

        {lookedUpCard && lookedUpCard !== "not_found" && (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{lookedUpCard.customer_name || lookedUpCard.customer_phone}</span>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                background: lookedUpCard.status === "reward_ready" ? "#fef3c7" : "#e0f2fe",
                color: lookedUpCard.status === "reward_ready" ? "#92400e" : "#0369a1",
              }}>
                {lookedUpCard.status === "reward_ready" ? "🎁 Reward ready" : "Active"}
              </span>
            </div>
            <p style={{ fontSize: 13, color: "#374151", margin: "0 0 10px" }}>
              {lookedUpCard.stamps_count} / {program.stamps_required} stamps
            </p>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {Array.from({ length: program.stamps_required }).map((_, i) => (
                <span key={i} style={{ fontSize: 18 }}>{i < lookedUpCard.stamps_count ? "🟢" : "⚪"}</span>
              ))}
            </div>
            <a
              href={`${window.location.origin}/loyalty-card/${lookedUpCard.card_code}`}
              target="_blank" rel="noreferrer"
              style={{ ...s.btn, background: "white", color: "#111", border: "1.5px solid #e5e7eb", fontSize: 12, padding: "7px 14px", textDecoration: "none", display: "inline-block" }}
            >🔗 View digital card</a>
          </div>
        )}
      </div>

      {/* Recent activity */}
      <div style={s.card}>
        <h3 style={s.cardTitle}>📋 Recent Activity</h3>
        {activity.length === 0 ? (
          <p style={{ color: "#9ca3af", fontSize: 14, textAlign: "center", padding: "20px 0" }}>
            No stamp activity yet — cards fill in as customers order
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Customer", "Event", "Date"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 12, fontWeight: 600, color: "#6b7280", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activity.map(row => (
                <tr key={row.id}>
                  <td style={{ padding: "8px 12px", fontSize: 13, borderBottom: "1px solid #f3f4f6" }}>{row.customer_name || row.customer_phone}</td>
                  <td style={{ padding: "8px 12px", fontSize: 13, borderBottom: "1px solid #f3f4f6" }}>
                    <span style={{
                      padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: row.event_type === "redeem" ? "#fef2f2" : row.event_type === "issue" ? "#f3f4f6" : "#f0fdf4",
                      color: row.event_type === "redeem" ? "#dc2626" : row.event_type === "issue" ? "#6b7280" : "#16a34a",
                    }}>
                      {row.event_type === "redeem" ? "🎁 Redeemed" : row.event_type === "issue" ? "🆕 Issued" : "🟢 Stamped"}
                    </span>
                  </td>
                  <td style={{ padding: "8px 12px", fontSize: 12, color: "#6b7280", borderBottom: "1px solid #f3f4f6" }}>
                    {parseDbTimestamp(row.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
