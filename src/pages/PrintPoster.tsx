import { useParams } from "react-router-dom"
import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { POSTER_TEMPLATES } from "@/data/posterTemplates"

// Public print page, same pattern as PrintBill.tsx / PrintKOT.tsx —
// no auth required (a poster is printed at a shared counter, not by
// a logged-in session necessarily), fetches branding by outlet_id and
// fires window.print() once branding + template are both ready.

type Branding = {
  business_name: string
  logo_url: string | null
  primary_color: string
  secondary_color: string
  address: string | null
  phone: string | null
  fssai_number: string | null
}

const DEFAULT_BRANDING: Branding = {
  business_name: "Praang",
  logo_url: null,
  primary_color: "#2D6A4F",
  secondary_color: "#F4A261",
  address: null,
  phone: null,
  fssai_number: null,
}

export default function PrintPoster() {
  const { posterId } = useParams()
  const [branding, setBranding] = useState<Branding | null>(null)

  const template = POSTER_TEMPLATES.find(p => p.id === posterId)

  useEffect(() => {
    supabase.from("outlet_branding").select("*").eq("outlet_id", "demo-outlet").maybeSingle()
      .then(({ data }) => setBranding(data ? { ...DEFAULT_BRANDING, ...data } : DEFAULT_BRANDING))
  }, [])

  useEffect(() => {
    if (!branding || !template) return
    const timer = setTimeout(() => window.print(), 500)
    return () => clearTimeout(timer)
  }, [branding, template])

  if (!template) return <p style={{ padding: 40, textAlign: "center" }}>Poster not found.</p>
  if (!branding) return <p style={{ padding: 40, textAlign: "center" }}>Loading…</p>

  return (
    <div style={{ width: "210mm", minHeight: "297mm", margin: "0 auto", padding: "18mm", fontFamily: "system-ui, sans-serif", boxSizing: "border-box", background: "white" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, borderBottom: `4px solid ${branding.primary_color}`, paddingBottom: 16, marginBottom: 24 }}>
        {branding.logo_url && <img src={branding.logo_url} alt="Logo" style={{ height: 56, width: 56, objectFit: "contain" }} />}
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: branding.primary_color }}>{branding.business_name}</h1>
          {(branding.address || branding.phone) && (
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "#6b7280" }}>
              {[branding.address, branding.phone].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </div>

      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: 40 }}>{template.icon}</div>
        <h2 style={{ fontSize: 30, fontWeight: 900, margin: "6px 0 4px", color: "#111" }}>{template.title}</h2>
        <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>{template.subtitle}</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {template.sections.map((section, i) => (
          <div key={i}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: branding.secondary_color, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: 0.5 }}>
              {section.heading}
            </h3>
            <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
              {section.items.map((item, j) => (
                <li key={j} style={{ fontSize: 14, lineHeight: 1.5, color: "#1f2937" }}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {branding.fssai_number && (
        <p style={{ marginTop: 32, textAlign: "center", fontSize: 10, color: "#9ca3af" }}>
          FSSAI Lic. No. {branding.fssai_number}
        </p>
      )}

      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          body { margin: 0; }
        }
      `}</style>
    </div>
  )
}
