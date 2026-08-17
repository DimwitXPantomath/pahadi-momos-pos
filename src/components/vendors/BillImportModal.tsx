import { useState } from "react"
import { supabase } from "@/lib/supabase"
import { extractPdfText } from "@/lib/pdfExtract"
import { guessBillLines } from "@/lib/pdfHeuristicParse"
import { findBestMatch } from "@/lib/fuzzyMatch"

// Fully local/free — no AI API call, no Cowork/Claude session needed.
// See RecipeImportModal.tsx's header comment for why: avoids any
// per-use AI cost, and works for any staff member on their own.

type Vendor = { id: string; name: string }
type VendorShop = { id: string; vendor_id: string; shop_name: string; city: string }
type Ingredient = { id: string; name: string; unit: string }

type ReviewRow = {
  extractedName: string
  quantity: string
  unit: string
  unitPrice: string
  ingredientId: string // "" = unmatched, will be skipped
}

type Props = {
  vendors: Vendor[]
  vendorShops: VendorShop[]
  ingredients: Ingredient[]
  onClose: () => void
  onImported: () => void
}

type Step = "upload" | "extracting" | "review" | "saving"

export default function BillImportModal({ vendors, vendorShops, ingredients, onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>("upload")
  const [error, setError] = useState("")

  const [shopId, setShopId] = useState("")
  const [billDate, setBillDate] = useState("")
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [rawText, setRawText] = useState("")
  const [showRawText, setShowRawText] = useState(false)

  const shopOptions = vendorShops.map(s => ({
    ...s,
    label: `${vendors.find(v => v.id === s.vendor_id)?.name ?? "Unknown vendor"} — ${s.shop_name}${s.city ? `, ${s.city}` : ""}`,
  }))

  const handleFile = async (file: File) => {
    setError("")
    setStep("extracting")

    const pdfResult = await extractPdfText(file)
    if (!pdfResult.ok) {
      setError(pdfResult.error)
      setStep("upload")
      return
    }

    setRawText(pdfResult.markdown)

    if (pdfResult.title) {
      const guess = findBestMatch(pdfResult.title, vendors)
      if (guess) {
        const shopsForVendor = vendorShops.filter(s => s.vendor_id === guess.match.id)
        if (shopsForVendor.length === 1) setShopId(shopsForVendor[0].id)
      }
    }

    const guessed = guessBillLines(pdfResult.markdown)
    setRows(
      guessed.map(g => {
        const match = findBestMatch(g.name, ingredients)
        return {
          extractedName: g.name,
          quantity: String(g.quantity),
          unit: g.unit,
          unitPrice: g.unitPrice != null ? String(g.unitPrice) : "",
          ingredientId: match ? match.match.id : "",
        }
      })
    )

    if (guessed.length === 0) {
      setError("Couldn't automatically find any line items in this PDF — you can add rows manually below, or check the extracted text to see what came through.")
    }

    setStep("review")
  }

  const updateRow = (i: number, patch: Partial<ReviewRow>) => {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }

  const addBlankRow = () => {
    setRows(prev => [...prev, { extractedName: "(manual)", quantity: "", unit: "", unitPrice: "", ingredientId: "" }])
  }

  const removeRow = (i: number) => {
    setRows(prev => prev.filter((_, idx) => idx !== i))
  }

  const readyRows = rows.filter(r => r.ingredientId && parseFloat(r.unitPrice) >= 0)
  const skippedCount = rows.length - readyRows.length

  const handleSave = async () => {
    if (!shopId) { setError("Select which vendor/shop this bill is from."); return }
    if (readyRows.length === 0) { setError("No rows have both a matched ingredient and a price — nothing to save."); return }

    setError("")
    setStep("saving")

    for (const row of readyRows) {
      const unit = row.unit || ingredients.find(i => i.id === row.ingredientId)?.unit || "g"
      const payload = {
        shop_id: shopId,
        ingredient_id: row.ingredientId,
        brand_id: null,
        price: parseFloat(row.unitPrice),
        unit,
        min_qty: 1,
        is_available: true,
        delivery_available: false,
        delivery_time_hrs: null,
        product_url: null,
        last_updated: new Date().toISOString(),
      }

      // Update the existing (shop, ingredient, no-brand) price if one
      // exists, otherwise insert — this table has no unique constraint
      // to upsert against directly (VendorPricingView.tsx does the
      // same manual check-then-write pattern).
      const { data: existing } = await supabase
        .from("vendor_item_prices")
        .select("id")
        .eq("shop_id", shopId)
        .eq("ingredient_id", row.ingredientId)
        .is("brand_id", null)
        .maybeSingle()

      const { error: rowErr } = existing
        ? await supabase.from("vendor_item_prices").update(payload).eq("id", existing.id)
        : await supabase.from("vendor_item_prices").insert(payload)

      if (rowErr) {
        setError(`Failed on "${row.extractedName}": ${rowErr.message}`)
        setStep("review")
        return
      }
    }

    onImported()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col pos-shadow-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="font-bold text-lg text-foreground m-0">Import bill from PDF</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer text-xl leading-none">✕</button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {step === "upload" && (
            <div className="flex flex-col items-center justify-center gap-3 py-10">
              <p className="text-sm text-gray-500 text-center max-w-sm">
                Upload a text-based vendor bill/invoice PDF. This reads it right on your device — no internet
                round-trip, nothing sent anywhere. It'll guess at line items and prices; you review and fix
                anything before it updates your vendor pricing (not stock quantities).
              </p>
              <label className="bg-primary text-primary-foreground rounded-lg px-5 py-2.5 text-sm font-bold cursor-pointer">
                Choose PDF
                <input
                  type="file" accept="application/pdf" className="hidden"
                  onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
              </label>
              {error && <p className="text-destructive text-sm text-center max-w-sm">{error}</p>}
            </div>
          )}

          {step === "extracting" && (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <p className="text-sm text-gray-500">Reading the PDF…</p>
            </div>
          )}

          {(step === "review" || step === "saving") && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-semibold text-gray-700">Vendor / shop</label>
                  <select
                    value={shopId} onChange={e => setShopId(e.target.value)}
                    className="px-3 py-2 border-[1.5px] border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-ring focus:border-primary"
                  >
                    <option value="">Select…</option>
                    {shopOptions.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-semibold text-gray-700">Bill date (for reference)</label>
                  <input
                    type="text" value={billDate} onChange={e => setBillDate(e.target.value)}
                    placeholder="e.g. 2026-08-10"
                    className="px-3 py-2 border-[1.5px] border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-ring focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[13px] font-semibold text-gray-700 m-0">
                    Line items ({readyRows.length} ready{skippedCount > 0 ? `, ${skippedCount} unmatched/missing price — won't be saved` : ""})
                  </p>
                  <button onClick={addBlankRow} className="text-xs font-semibold text-primary bg-transparent border-none cursor-pointer">+ Add row</button>
                </div>
                <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                  {rows.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">No rows yet — add one manually, or check the extracted text below.</p>
                  )}
                  {rows.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="w-24 truncate text-gray-500 shrink-0" title={r.extractedName}>{r.extractedName}</span>
                      <select
                        value={r.ingredientId} onChange={e => updateRow(i, { ingredientId: e.target.value })}
                        className="flex-1 px-2 py-1.5 border border-border rounded text-sm outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="">— not matched, will skip —</option>
                        {ingredients.map(ing => <option key={ing.id} value={ing.id}>{ing.name}</option>)}
                      </select>
                      <input
                        type="number" value={r.quantity} onChange={e => updateRow(i, { quantity: e.target.value })}
                        placeholder="qty" className="w-16 px-2 py-1.5 border border-border rounded text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                      <input
                        type="text" value={r.unit} onChange={e => updateRow(i, { unit: e.target.value })}
                        placeholder="unit" className="w-14 px-2 py-1.5 border border-border rounded text-xs outline-none focus:ring-2 focus:ring-ring"
                      />
                      <input
                        type="number" value={r.unitPrice} onChange={e => updateRow(i, { unitPrice: e.target.value })}
                        placeholder="₹/unit" className="w-20 px-2 py-1.5 border border-border rounded text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                      <button onClick={() => removeRow(i)} className="text-gray-300 hover:text-destructive bg-transparent border-none cursor-pointer text-sm shrink-0">✕</button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <button
                  onClick={() => setShowRawText(v => !v)}
                  className="text-xs font-semibold text-gray-500 bg-transparent border-none cursor-pointer p-0"
                >
                  {showRawText ? "▾" : "▸"} View extracted text (to check what the guesser missed)
                </button>
                {showRawText && (
                  <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap bg-gray-50 border border-border rounded-lg p-3 text-xs text-gray-600">{rawText}</pre>
                )}
              </div>

              {error && <p className="text-destructive text-sm">{error}</p>}
            </div>
          )}
        </div>

        {(step === "review" || step === "saving") && (
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm font-semibold bg-white">Cancel</button>
            <button
              onClick={handleSave} disabled={step === "saving"}
              className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold disabled:opacity-60"
            >
              {step === "saving" ? "Saving…" : `Save prices (${readyRows.length} items)`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
