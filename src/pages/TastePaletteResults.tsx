import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useCustomerAuth } from "@/hooks/useCustomerAuth"
import { getTasteProfile, type TasteProfile } from "@/services/tasteProfileService"
import { fetchMenuItems } from "@/services/menuService"
import { matchDishes, type MatchResult } from "@/services/tasteMatchService"
import type { MenuItem } from "@/types/pos"

// Results page for Taste Palette — reads the saved profile + live
// menu, runs the matching engine, renders ranked dishes. Built to
// verify tasteMatchService.ts against real (dummy) tagged data before
// wiring this into the actual ordering flow.

const COLORS = { primary: "#1B6E5C", accent: "#E76F51", bg: "#F7F5F0", card: "#FFFFFF", border: "#E5E7EB", text: "#1F2937", muted: "#6B7280" }

export default function TastePaletteResults() {
  const navigate = useNavigate()
  const { uid, isSignedIn } = useCustomerAuth()
  const [profile, setProfile] = useState<TasteProfile | null>(null)
  const [result, setResult] = useState<MatchResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isSignedIn || !uid) { setLoading(false); return }
    ;(async () => {
      const [p, items] = await Promise.all([getTasteProfile(uid), fetchMenuItems()])
      setProfile(p)
      if (p) setResult(matchDishes(p, items))
      setLoading(false)
    })()
  }, [isSignedIn, uid])

  if (!isSignedIn) {
    return (
      <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif", padding: 24, textAlign: "center" }}>
        <p style={{ color: COLORS.muted, marginBottom: 16 }}>Answer a few taste questions first to see your matches.</p>
        <button onClick={() => navigate("/taste-palette")} style={{ padding: "10px 22px", borderRadius: 10, border: "none", background: COLORS.primary, color: "#fff", fontWeight: 600, cursor: "pointer" }}>
          Go to Taste Palette
        </button>
      </div>
    )
  }

  if (loading) return <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>Loading...</div>

  if (!profile) {
    return (
      <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif", padding: 24, textAlign: "center" }}>
        <p style={{ color: COLORS.muted, marginBottom: 16 }}>No taste profile saved yet.</p>
        <button onClick={() => navigate("/taste-palette")} style={{ padding: "10px 22px", borderRadius: 10, border: "none", background: COLORS.primary, color: "#fff", fontWeight: 600, cursor: "pointer" }}>
          Answer the questionnaire
        </button>
      </div>
    )
  }

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, fontFamily: "Inter, sans-serif", padding: "24px 16px 60px" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.text, margin: "0 0 4px" }}>Picked for you</h1>
        <p style={{ fontSize: 13, color: COLORS.muted, marginBottom: 16 }}>
          {result?.tooBroadFallback
            ? "Your taste profile is pretty open — showing newest dishes instead of a forced ranking."
            : "Ranked using your saved taste profile."}
          {result && result.excludedByAllergen > 0 && ` ${result.excludedByAllergen} dish${result.excludedByAllergen > 1 ? "es" : ""} hidden for your allergies.`}
        </p>

        {result?.matched.length === 0 && (
          <p style={{ color: COLORS.muted, fontSize: 14 }}>No dishes match your dietary type yet — check back as the menu gets tagged.</p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {result?.matched.map(({ item, badge }) => (
            <DishCard key={item.id} item={item} badge={badge} />
          ))}
        </div>

        {result && result.notYetRated.length > 0 && (
          <>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: COLORS.muted, margin: "28px 0 10px" }}>Not yet rated</h2>
            <p style={{ fontSize: 12, color: COLORS.muted, marginBottom: 10 }}>These dishes haven't been tagged for Taste Palette yet, so we can't confirm they match your preferences (including allergies).</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {result.notYetRated.map(item => <DishCard key={item.id} item={item} badge={null} muted />)}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function DishCard({ item, badge, muted }: { item: MenuItem; badge: string | null; muted?: boolean }) {
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: "14px 16px", opacity: muted ? 0.7 : 1, display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 10, height: 10, borderRadius: "50%", background: item.is_veg ? "#16a34a" : "#dc2626", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontWeight: 700, fontSize: 14, margin: 0, color: COLORS.text }}>{item.name}</p>
        <p style={{ fontSize: 12, color: COLORS.muted, margin: "2px 0 0" }}>
          ₹{item.price}
          {item.spice_level != null && ` · ${"🌶️".repeat(item.spice_level)}`}
          {item.cuisine_category && ` · ${item.cuisine_category}`}
        </p>
      </div>
      {badge && (
        <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20, background: "#E7F2EF", color: COLORS.primary, flexShrink: 0 }}>
          {badge}
        </span>
      )}
    </div>
  )
}
