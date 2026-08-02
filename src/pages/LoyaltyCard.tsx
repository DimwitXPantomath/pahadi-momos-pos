import { useParams } from "react-router-dom"
import { useEffect, useState } from "react"
import QRCode from "react-qr-code"
import { fetchCardByCode, fetchProgramById } from "@/services/stampCardService"
import { describeReward } from "@/types/loyalty"
import type { StampCard, StampCardProgram } from "@/types/loyalty"

// Public, no-login page a customer can bookmark or scan to check their stamp
// card. Same identity (card_code) a physical printed card also encodes, so
// whichever one they use, the count is always the same underlying row —
// see /print/loyalty-card and 009_stamp_loyalty_cards.sql's anon SELECT policy.
export default function LoyaltyCard() {
  const { code } = useParams()
  const [card, setCard] = useState<StampCard | null>(null)
  const [program, setProgram] = useState<StampCardProgram | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!code) { setLoading(false); setNotFound(true); return }
    ;(async () => {
      const c = await fetchCardByCode(code)
      if (!c) { setNotFound(true); setLoading(false); return }
      setCard(c)
      const p = await fetchProgramById(c.program_id)
      setProgram(p)
      setLoading(false)
    })()
  }, [code])

  if (loading) return (
    <div style={s.centered}>
      <p style={{ fontSize: 32 }}>⏳</p>
      <p style={{ color: "#6b7280", marginTop: 12 }}>Loading your card…</p>
    </div>
  )

  if (notFound || !card || !program) return (
    <div style={s.centered}>
      <p style={{ fontSize: 48 }}>😕</p>
      <h2>Card Not Found</h2>
      <p style={{ color: "#6b7280", textAlign: "center", maxWidth: 280 }}>This link may be wrong or the card hasn't been issued yet — ask the counter to look you up.</p>
    </div>
  )

  const isReady = card.status === "reward_ready"
  const filled = Math.min(card.stamps_count, program.stamps_required)

  return (
    <div style={s.page}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>🌿 Praang</h1>
        <p style={{ color: "#6b7280", margin: "4px 0 0", fontSize: 13 }}>{program.name}</p>
      </div>

      <div style={{ ...s.card, textAlign: "center", border: isReady ? "2px solid #16a34a" : "1px solid #e5e7eb", marginBottom: 16 }}>
        {isReady ? (
          <>
            <p style={{ fontSize: 48, margin: "0 0 8px" }}>🎉</p>
            <p style={{ fontWeight: 800, fontSize: 18, color: "#16a34a", margin: "0 0 4px" }}>Your card is full!</p>
            <p style={{ fontSize: 14, color: "#374151" }}>{describeReward(program)}</p>
            <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 8 }}>Show this screen at the counter to redeem</p>
          </>
        ) : (
          <>
            <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 4px" }}>{card.customer_name || "Your progress"}</p>
            <p style={{ fontSize: 32, fontWeight: 800, margin: "0 0 4px" }}>{card.stamps_count} / {program.stamps_required}</p>
            <p style={{ fontSize: 13, color: "#374151" }}>stamps collected</p>
          </>
        )}
      </div>

      {/* Stamp grid */}
      <div style={{ ...s.card, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, justifyItems: "center" }}>
          {Array.from({ length: program.stamps_required }).map((_, i) => (
            <div key={i} style={{
              width: 40, height: 40, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18,
              background: i < filled ? "#f0fdf4" : "#f9fafb",
              border: `2px solid ${i < filled ? "#16a34a" : "#e5e7eb"}`,
            }}>
              {i < filled ? "✓" : ""}
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...s.card, marginBottom: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 700, margin: "0 0 4px" }}>Reward</p>
        <p style={{ fontSize: 14, color: "#374151", margin: 0 }}>{describeReward(program)}</p>
      </div>

      {/* QR encodes the card_code — lets staff type/confirm the right card if they're looking you up by phone doesn't match (e.g. shared family phone) */}
      <div style={{ ...s.card, textAlign: "center" }}>
        <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>Show this to the counter each visit</p>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <QRCode value={card.card_code} size={140} />
        </div>
        <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 10, letterSpacing: 1 }}>{card.card_code}</p>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 420, margin: "0 auto", padding: "24px 16px 48px", fontFamily: "system-ui, sans-serif" },
  centered: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24, fontFamily: "system-ui, sans-serif" },
  card: { background: "white", borderRadius: 16, padding: "16px 20px", border: "1px solid #e5e7eb" },
}
