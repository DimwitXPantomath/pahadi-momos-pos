import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import QRCode from "react-qr-code"
import type { POSSettings } from "@/types/pos"

type TableRow = { id: string; name: string }
const DEFAULT_TABLES: TableRow[] = [
  { id: "T1", name: "Table 1" }, { id: "T2", name: "Table 2" }, { id: "T3", name: "Table 3" },
  { id: "T4", name: "Table 4" }, { id: "T5", name: "Table 5" }, { id: "T6", name: "Table 6" },
]

type Props = {
  settings: POSSettings
  setSettings: React.Dispatch<React.SetStateAction<POSSettings>>
}

export default function Settings({ settings, setSettings }: Props) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [tables, setTables] = useState<TableRow[]>(DEFAULT_TABLES)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [qrOpenId, setQrOpenId] = useState<string | null>(null)
  const [menuLinkCopied, setMenuLinkCopied] = useState(false)
  const [menuQrOpen, setMenuQrOpen] = useState(false)

  // Branding — used by the Posters feature (and any future print asset)
  const [brandName, setBrandName] = useState("Praang")
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [primaryColor, setPrimaryColor] = useState("#1B6E5C")
  const [secondaryColor, setSecondaryColor] = useState("#E76F51")
  const [brandAddress, setBrandAddress] = useState("")
  const [brandPhone, setBrandPhone] = useState("")
  const [fssaiNumber, setFssaiNumber] = useState("")
  const [brandingSaving, setBrandingSaving] = useState(false)
  const [brandingSaved, setBrandingSaved] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  useEffect(() => {
    supabase.from("tables").select("id, name").eq("outlet_id", "demo-outlet").order("name", { ascending: true })
      .then(({ data, error }) => { if (!error && data && data.length > 0) setTables(data) })
      // Falls back to DEFAULT_TABLES on any error — same defensive pattern
      // usePOSConfig.ts already uses for this same (possibly-missing-from-
      // migrations) `tables` table.
  }, [])

  useEffect(() => {
    supabase.from("outlet_branding").select("*").eq("outlet_id", "demo-outlet").maybeSingle()
      .then(({ data }) => {
        if (!data) return
        setBrandName(data.business_name || "Praang")
        setLogoUrl(data.logo_url || null)
        setPrimaryColor(data.primary_color || "#1B6E5C")
        setSecondaryColor(data.secondary_color || "#E76F51")
        setBrandAddress(data.address || "")
        setBrandPhone(data.phone || "")
        setFssaiNumber(data.fssai_number || "")
      })
  }, [])

  const saveBranding = async () => {
    setBrandingSaving(true)
    await supabase.from("outlet_branding").upsert({
      outlet_id: "demo-outlet",
      business_name: brandName || "Praang",
      logo_url: logoUrl,
      primary_color: primaryColor,
      secondary_color: secondaryColor,
      address: brandAddress || null,
      phone: brandPhone || null,
      fssai_number: fssaiNumber || null,
      updated_at: new Date().toISOString(),
    })
    setBrandingSaving(false)
    setBrandingSaved(true)
    setTimeout(() => setBrandingSaved(false), 2000)
  }

  const handleLogoUpload = async (file: File) => {
    setUploadingLogo(true)
    const ext = file.name.split(".").pop()
    const path = `demo-outlet/logo-${Date.now()}.${ext}`
    const { error: uploadErr } = await supabase.storage.from("branding").upload(path, file, { upsert: true })
    if (uploadErr) {
      alert(`Logo upload failed: ${uploadErr.message}`)
      setUploadingLogo(false)
      return
    }
    const { data } = supabase.storage.from("branding").getPublicUrl(path)
    setLogoUrl(data.publicUrl)
    setUploadingLogo(false)
  }

  const tableUrl = (tableId: string) => `${window.location.origin}/order-online/demo-outlet?table=${tableId}`

  const copyLink = (tableId: string) => {
    navigator.clipboard.writeText(tableUrl(tableId))
    setCopiedId(tableId)
    setTimeout(() => setCopiedId(null), 1500)
  }

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

      {/* Branding — feeds the Posters feature and any future print asset.
          New table (outlet_branding), didn't exist before this. */}
      <div style={card}>
        <h3 style={cardTitle}>Branding</h3>
        <p style={cardDesc}>Your logo, name, and colors — used on hygiene/compliance posters and future print assets.</p>

        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 14 }}>
          <div style={{ width: 84, height: 84, borderRadius: 10, border: "1.5px dashed #e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden", background: "#fafafa" }}>
            {logoUrl ? <img src={logoUrl} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <span style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", padding: 4 }}>No logo</span>}
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={{ display: "inline-block", padding: "6px 12px", background: "white", border: "1.5px solid #e5e7eb", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              {uploadingLogo ? "Uploading…" : "Upload logo"}
              <input
                type="file"
                accept="image/*"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f) }}
                style={{ display: "none" }}
                disabled={uploadingLogo}
              />
            </label>
            <p style={{ fontSize: 11, color: "#9ca3af", margin: "6px 0 0" }}>PNG with transparent background works best.</p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={fieldLabel}>Business name</label>
            <input value={brandName} onChange={e => setBrandName(e.target.value)} style={fieldInput} />
          </div>
          <div>
            <label style={fieldLabel}>FSSAI number (optional)</label>
            <input value={fssaiNumber} onChange={e => setFssaiNumber(e.target.value)} style={fieldInput} placeholder="14-digit license no." />
          </div>
          <div>
            <label style={fieldLabel}>Phone (optional)</label>
            <input value={brandPhone} onChange={e => setBrandPhone(e.target.value)} style={fieldInput} />
          </div>
          <div>
            <label style={fieldLabel}>Address (optional)</label>
            <input value={brandAddress} onChange={e => setBrandAddress(e.target.value)} style={fieldInput} />
          </div>
          <div>
            <label style={fieldLabel}>Primary color</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} style={{ width: 36, height: 32, border: "1.5px solid #e5e7eb", borderRadius: 6, padding: 2, cursor: "pointer" }} />
              <input value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} style={fieldInput} />
            </div>
          </div>
          <div>
            <label style={fieldLabel}>Secondary color</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} style={{ width: 36, height: 32, border: "1.5px solid #e5e7eb", borderRadius: 6, padding: 2, cursor: "pointer" }} />
              <input value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} style={fieldInput} />
            </div>
          </div>
        </div>

        <button onClick={saveBranding} disabled={brandingSaving} style={{ padding: "8px 16px", background: brandingSaved ? "#16a34a" : "#111", color: "white", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          {brandingSaved ? "✓ Saved" : brandingSaving ? "Saving…" : "Save branding"}
        </button>
      </div>

      {/* Digital menu — outlet-level, browse-only, no cart. Different from
          the per-table ordering links below: this is for a bio-link/table-tent
          QR that just shows the menu without pushing straight into checkout. */}
      <div style={card}>
        <h3 style={cardTitle}>Digital Menu (browse-only)</h3>
        <p style={cardDesc}>
          Auto-generated from your live menu — same data as the POS and online ordering, so there's one menu to keep updated, not three.
          No cart on this page; it links through to online ordering if the customer wants to order.
        </p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px" }}>
          <p style={{ margin: 0, fontSize: 11, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {`${window.location.origin}/menu/demo-outlet`}
          </p>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button
              onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/menu/demo-outlet`); setMenuLinkCopied(true); setTimeout(() => setMenuLinkCopied(false), 1500) }}
              style={{ padding: "6px 12px", background: menuLinkCopied ? "#16a34a" : "#111", color: "white", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >{menuLinkCopied ? "✓ Copied" : "Copy link"}</button>
            <button
              onClick={() => setMenuQrOpen(v => !v)}
              style={{ padding: "6px 12px", background: "white", color: "#111", border: "1.5px solid #e5e7eb", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >{menuQrOpen ? "Hide QR" : "QR"}</button>
          </div>
        </div>
        {menuQrOpen && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 12, padding: 12, background: "#fafafa", borderRadius: 8 }}>
            <QRCode value={`${window.location.origin}/menu/demo-outlet`} size={130} />
          </div>
        )}
      </div>

      {/* Table ordering links — NFC tag / QR source, table-wise navigation */}
      <div style={card}>
        <h3 style={cardTitle}>Table Ordering Links (NFC / QR)</h3>
        <p style={cardDesc}>
          One link per table opens the online menu pre-selected for that table. Write it to a blank NFC
          sticker with a free app (e.g. "NFC Tools" on Android/iOS: Write → Add a record → URL/URI → paste
          the link) and stick one per table. Keep the QR as a fallback — not every phone has NFC on, but every
          phone has a camera.
        </p>
        {tables.map(t => (
          <div key={t.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>{t.name}</p>
                <p style={{ margin: "2px 0 0", fontSize: 11, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tableUrl(t.id)}</p>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => copyLink(t.id)}
                  style={{ padding: "6px 12px", background: copiedId === t.id ? "#16a34a" : "#111", color: "white", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >{copiedId === t.id ? "✓ Copied" : "Copy link"}</button>
                <button
                  onClick={() => setQrOpenId(qrOpenId === t.id ? null : t.id)}
                  style={{ padding: "6px 12px", background: "white", color: "#111", border: "1.5px solid #e5e7eb", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >{qrOpenId === t.id ? "Hide QR" : "QR"}</button>
              </div>
            </div>
            {qrOpenId === t.id && (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 12, padding: 12, background: "#fafafa", borderRadius: 8 }}>
                <QRCode value={tableUrl(t.id)} size={120} />
              </div>
            )}
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
const fieldLabel: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 4 }
const fieldInput: React.CSSProperties = { width: "100%", padding: "7px 10px", border: "1.5px solid #e5e7eb", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }
