import { Link } from "react-router-dom"
import { POSTER_TEMPLATES } from "@/data/posterTemplates"

export default function PostersView() {
  return (
    <div style={s.page}>
      <div style={s.header}>
        <h2 style={s.title}>🖼️ Hygiene & Compliance Posters</h2>
        <p style={s.subtitle}>
          Branded with your logo, name, and colors (set these in Settings → Branding). Click a poster to preview
          and print — each opens in a new tab ready for your printer.
        </p>
      </div>

      <div style={s.disclaimer}>
        ⚠️ This is common good-practice guidance, written for clarity — not a verbatim copy of FSSAI's legal
        Food Safety Display Board text. Confirm exact mandated wording against your license type if that matters for you.
      </div>

      <div style={s.grid}>
        {POSTER_TEMPLATES.map(p => (
          <Link key={p.id} to={`/print/poster/${p.id}`} target="_blank" rel="noreferrer" style={s.card}>
            <div style={s.iconWrap}>{p.icon}</div>
            <h3 style={s.cardTitle}>{p.title}</h3>
            <p style={s.cardSubtitle}>{p.subtitle}</p>
            <span style={s.previewBtn}>Preview & Print →</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: "16px 16px 80px", maxWidth: 900, margin: "0 auto" },
  header: { marginBottom: 12 },
  title: { fontSize: 22, fontWeight: 800, color: "#111", margin: 0 },
  subtitle: { fontSize: 13, color: "#6b7280", marginTop: 4, maxWidth: 600 },
  disclaimer: { background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#92400e", marginBottom: 20, lineHeight: 1.5 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 },
  card: { display: "block", background: "white", border: "1.5px solid #e5e7eb", borderRadius: 14, padding: "20px 18px", textDecoration: "none", color: "inherit", transition: "border-color 0.15s" },
  iconWrap: { fontSize: 32, marginBottom: 10 },
  cardTitle: { fontSize: 15, fontWeight: 800, margin: 0, color: "#111" },
  cardSubtitle: { fontSize: 12, color: "#9ca3af", margin: "4px 0 14px" },
  previewBtn: { fontSize: 12, fontWeight: 700, color: "#2563eb" },
}
