import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Vendor {
  id: string
  name: string
  type: "online" | "offline"
  phone: string
  address?: string
  pin?: string
  shops?: VendorShop[]
}

interface VendorShop {
  id: string
  vendor_id: string
  shop_name: string
  city: string
  phone: string
}

interface Brand {
  id: string
  name: string
}

interface Ingredient {
  id: string
  name: string
  unit: string
  cost_per_unit: number
}

interface VendorItemPrice {
  id: string
  shop_id: string
  ingredient_id: string
  brand_id: string | null
  price: number
  unit: string
  min_qty: number
  is_available: boolean
  delivery_available: boolean
  delivery_time_hrs: number | null
  product_url: string
  last_updated: string
  // joined
  vendor_shops?: { shop_name: string; city: string; vendors?: { name: string; type: string } }
  brands?: { name: string }
}

type Tab = "vendors" | "catalog" | "compare"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: d })
}
function fmtCurrency(n: number) { return "₹" + fmt(n, 2) }

const OUTLET_ID = "demo-outlet"

// ─── Component ────────────────────────────────────────────────────────────────

export default function VendorPricingView() {
  const [tab, setTab] = useState<Tab>("vendors")

  // ── Data ───────────────────────────────────────────────────────────────────
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [shops, setShops] = useState<VendorShop[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [prices, setPrices] = useState<VendorItemPrice[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  // ── Vendor form ────────────────────────────────────────────────────────────
  const [vForm, setVForm] = useState({ name: "", type: "offline" as "online" | "offline", phone: "", address: "", pin: "" })
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null)
  const [shopForm, setShopForm] = useState({ shop_name: "", city: "Bhopal", phone: "" })

  // ── Brand form ─────────────────────────────────────────────────────────────
  const [newBrand, setNewBrand] = useState("")

  // ── Price catalog form ─────────────────────────────────────────────────────
  const [priceForm, setPriceForm] = useState({
    shop_id: "",
    ingredient_id: "",
    brand_id: "",
    price: "",
    unit: "",
    min_qty: "1",
    is_available: true,
    delivery_available: false,
    delivery_time_hrs: "",
    product_url: "",
  })
  const [editPrice, setEditPrice] = useState<VendorItemPrice | null>(null)
  const [priceFilter, setPriceFilter] = useState({ ingredient_id: "", shop_id: "" })

  // ── Compare ────────────────────────────────────────────────────────────────
  const [compareIngredient, setCompareIngredient] = useState("")

  // ── Load ───────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    // FIXED: vendors has no outlet_id column (confirmed against live
    // schema) — this filter errored on every load, so `vd` was always
    // null and the vendor list never populated. vendors is a shared/
    // global list today, same as categories/menu_items.
    const [{ data: vd }, { data: sh }, { data: br }, { data: ing }, { data: pr }] = await Promise.all([
      supabase.from("vendors").select("*").order("name"),
      supabase.from("vendor_shops").select("*").order("shop_name"),
      supabase.from("brands").select("*").order("name"),
      supabase.from("ingredients").select("id, name, unit, cost_per_unit").order("name"),
      supabase.from("vendor_item_prices")
        .select("*, vendor_shops(shop_name, city, vendors(name, type)), brands(name)")
        .order("price", { ascending: true }),
    ])
    if (vd) setVendors(vd as Vendor[])
    if (sh) setShops(sh)
    if (br) setBrands(br)
    if (ing) setIngredients(ing)
    if (pr) setPrices(pr as VendorItemPrice[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function flash(msg: string, isError = false) {
    if (isError) { setError(msg); setTimeout(() => setError(""), 3500) }
    else { setSuccess(msg); setTimeout(() => setSuccess(""), 2500) }
  }

  // ── Vendor actions ─────────────────────────────────────────────────────────
  async function addVendor() {
    if (!vForm.name.trim()) { flash("Vendor name is required", true); return }
    if (!vForm.address.trim()) { flash("Address is required", true); return }
    if (!vForm.pin.trim()) { flash("PIN code is required", true); return }
    setSaving(true)
    const insertPayload: Record<string, string> = {
      name: vForm.name.trim(),
      type: vForm.type,
      phone: vForm.phone,
      address: vForm.address.trim(),
      pin: vForm.pin.trim(),
    }
    // Only include outlet_id if the column exists — try without it first via upsert
    const { data: inserted, error: err } = await supabase
      .from("vendors")
      .insert({ ...insertPayload, outlet_id: OUTLET_ID })
      .select()
      .single()

    if (err) {
      // If outlet_id column doesn't exist, retry without it
      if (err.message?.includes("outlet_id") || err.code === "PGRST204" || err.code === "42703") {
        const { error: err2 } = await supabase.from("vendors").insert(insertPayload)
        if (err2) { flash(err2.message, true); setSaving(false); return }
      } else {
        flash(`Failed: ${err.message}`, true)
        console.error("addVendor error:", err)
        setSaving(false)
        return
      }
    }
    console.log("Vendor created:", inserted)
    setVForm({ name: "", type: "offline", phone: "", address: "", pin: "" })
    flash("Vendor added ✓")
    load()
    setSaving(false)
  }

  async function deleteVendor(id: string) {
    if (!confirm("Delete vendor and all their shops?")) return
    await supabase.from("vendor_shops").delete().eq("vendor_id", id)
    await supabase.from("vendors").delete().eq("id", id)
    if (selectedVendor?.id === id) setSelectedVendor(null)
    load()
  }

  // ── Shop actions ───────────────────────────────────────────────────────────
  async function addShop() {
    if (!selectedVendor) return
    if (!shopForm.shop_name.trim()) { flash("Shop name is required", true); return }
    setSaving(true)
    const { error: err } = await supabase.from("vendor_shops")
      .insert({ vendor_id: selectedVendor.id, shop_name: shopForm.shop_name.trim(), city: shopForm.city, phone: shopForm.phone })
    if (err) flash(err.message, true)
    else { setShopForm({ shop_name: "", city: "Bhopal", phone: "" }); flash("Shop added"); load() }
    setSaving(false)
  }

  async function deleteShop(id: string) {
    if (!confirm("Delete this shop? Its prices will also be removed.")) return
    await supabase.from("vendor_item_prices").delete().eq("shop_id", id)
    await supabase.from("vendor_shops").delete().eq("id", id)
    load()
  }

  // ── Brand actions ──────────────────────────────────────────────────────────
  async function addBrand() {
    if (!newBrand.trim()) return
    const { error: err } = await supabase.from("brands").insert({ name: newBrand.trim() })
    if (err) flash(err.message, true)
    else { setNewBrand(""); flash("Brand added"); load() }
  }

  // ── Price actions ──────────────────────────────────────────────────────────
  function resetPriceForm() {
    setPriceForm({ shop_id: "", ingredient_id: "", brand_id: "", price: "", unit: "", min_qty: "1", is_available: true, delivery_available: false, delivery_time_hrs: "", product_url: "" })
    setEditPrice(null)
  }

  function startEditPrice(p: VendorItemPrice) {
    setEditPrice(p)
    setPriceForm({
      shop_id: p.shop_id,
      ingredient_id: p.ingredient_id,
      brand_id: p.brand_id ?? "",
      price: String(p.price),
      unit: p.unit,
      min_qty: String(p.min_qty),
      is_available: p.is_available,
      delivery_available: p.delivery_available,
      delivery_time_hrs: p.delivery_time_hrs != null ? String(p.delivery_time_hrs) : "",
      product_url: p.product_url ?? "",
    })
    setTab("catalog")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  async function savePrice() {
    if (!priceForm.shop_id) { flash("Select a shop", true); return }
    if (!priceForm.ingredient_id) { flash("Select an ingredient", true); return }
    const price = parseFloat(priceForm.price)
    if (isNaN(price) || price < 0) { flash("Enter a valid price", true); return }

    // Auto-fill unit from ingredient if blank
    const unit = priceForm.unit || ingredients.find(i => i.id === priceForm.ingredient_id)?.unit || "g"

    setSaving(true)
    const payload = {
      shop_id: priceForm.shop_id,
      ingredient_id: priceForm.ingredient_id,
      brand_id: priceForm.brand_id || null,
      price,
      unit,
      min_qty: parseFloat(priceForm.min_qty) || 1,
      is_available: priceForm.is_available,
      delivery_available: priceForm.delivery_available,
      delivery_time_hrs: priceForm.delivery_time_hrs ? parseInt(priceForm.delivery_time_hrs) : null,
      product_url: priceForm.product_url || null,
      last_updated: new Date().toISOString(),
    }

    let err
    if (editPrice) {
      ;({ error: err } = await supabase.from("vendor_item_prices").update(payload).eq("id", editPrice.id))
    } else {
      ;({ error: err } = await supabase.from("vendor_item_prices").insert(payload))
    }

    if (err) flash(err.message, true)
    else { flash(editPrice ? "Price updated" : "Price added"); resetPriceForm(); load() }
    setSaving(false)
  }

  async function deletePrice(id: string) {
    await supabase.from("vendor_item_prices").delete().eq("id", id)
    load()
  }

  // ── Computed ───────────────────────────────────────────────────────────────
  const shopsForVendor = (vendorId: string) => shops.filter(s => s.vendor_id === vendorId)

  const filteredPrices = prices.filter(p => {
    if (priceFilter.ingredient_id && p.ingredient_id !== priceFilter.ingredient_id) return false
    if (priceFilter.shop_id && p.shop_id !== priceFilter.shop_id) return false
    return true
  })

  // For compare tab: group prices by ingredient
  const compareData = compareIngredient
    ? prices.filter(p => p.ingredient_id === compareIngredient && p.is_available).sort((a, b) => a.price - b.price)
    : []

  const bestPrice = compareData[0]?.price ?? null

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>

      {/* Header */}
      <div style={s.header}>
        <div>
          <h2 style={s.title}>🏪 Vendor & Pricing</h2>
          <p style={s.subtitle}>Manage suppliers, track prices, find the best deal per ingredient</p>
        </div>
        <div style={s.stats}>
          <span style={s.statPill}>{vendors.length} vendors</span>
          <span style={s.statPill}>{shops.length} shops</span>
          <span style={s.statPill}>{prices.length} prices</span>
        </div>
      </div>

      {error && <div style={s.errorBanner}>⚠️ {error}</div>}
      {success && <div style={s.successBanner}>✅ {success}</div>}

      {/* Tabs */}
      <div style={s.tabBar}>
        {([["vendors", "🏬 Vendors"], ["catalog", "💰 Price Catalog"], ["compare", "🔍 Compare"]] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{ ...s.tabBtn, ...(tab === t ? s.tabBtnActive : {}) }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── VENDORS TAB ── */}
      {tab === "vendors" && (
        <div>
          {/* Add vendor */}
          <div style={s.card}>
            <h3 style={s.cardTitle}>➕ Add Vendor</h3>
            <div style={s.grid3}>
              <div style={s.field}>
                <label style={s.label}>Vendor Name *</label>
                <input style={s.input} placeholder="e.g. Reliance Smart" value={vForm.name}
                  onChange={e => setVForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div style={s.field}>
                <label style={s.label}>Type</label>
                <select style={s.input} value={vForm.type}
                  onChange={e => setVForm(f => ({ ...f, type: e.target.value as "online" | "offline" }))}>
                  <option value="offline">🏬 Offline (Walk-in)</option>
                  <option value="online">🌐 Online (Delivery)</option>
                </select>
              </div>
              <div style={s.field}>
                <label style={s.label}>Phone</label>
                <input style={s.input} placeholder="e.g. 9876543210" value={vForm.phone}
                  onChange={e => setVForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
            </div>
            <div style={s.grid2}>
              <div style={s.field}>
                <label style={s.label}>Address * <span style={{ color: "#dc2626" }}>required</span></label>
                <input style={s.input} placeholder="Street / area / landmark" value={vForm.address}
                  onChange={e => setVForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div style={s.field}>
                <label style={s.label}>PIN Code * <span style={{ color: "#dc2626" }}>required</span></label>
                <input style={s.input} placeholder="e.g. 462001" maxLength={6} value={vForm.pin}
                  onChange={e => setVForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, "") }))} />
              </div>
            </div>
            <div style={s.btnRow}>
              <button style={{ ...s.primaryBtn, opacity: saving ? 0.7 : 1 }}
                onClick={addVendor} disabled={saving}>
                {saving ? "Adding…" : "Add Vendor"}
              </button>
            </div>
          </div>

          {/* Vendor list */}
          {loading ? <div style={s.empty}>Loading…</div> : (
            <div>
              {vendors.map(vendor => (
                <div key={vendor.id} style={s.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{vendor.name}</span>
                        <span style={{
                          ...s.badge,
                          background: vendor.type === "online" ? "#dbeafe" : "#f3f4f6",
                          color: vendor.type === "online" ? "#1e40af" : "#374151",
                        }}>
                          {vendor.type === "online" ? "🌐 Online" : "🏬 Offline"}
                        </span>
                      </div>
                      {vendor.phone && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>📞 {vendor.phone}</div>}
                      {vendor.address && <div style={{ fontSize: 12, color: "#6b7280" }}>📍 {vendor.address}{vendor.pin ? ` — ${vendor.pin}` : ""}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        style={{ ...s.iconBtn, background: selectedVendor?.id === vendor.id ? "#111" : "#f3f4f6", color: selectedVendor?.id === vendor.id ? "white" : "#111" }}
                        onClick={() => setSelectedVendor(v => v?.id === vendor.id ? null : vendor)}
                      >
                        {selectedVendor?.id === vendor.id ? "▲ Shops" : "▼ Shops"}
                      </button>
                      <button style={{ ...s.iconBtn, background: "#fee2e2", color: "#dc2626" }}
                        onClick={() => deleteVendor(vendor.id)}>🗑️</button>
                    </div>
                  </div>

                  {/* Shops section */}
                  {selectedVendor?.id === vendor.id && (
                    <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 12 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: "#374151" }}>
                        Shops / Branches
                      </div>

                      {/* Existing shops */}
                      {shopsForVendor(vendor.id).length === 0 ? (
                        <div style={{ color: "#9ca3af", fontSize: 13, marginBottom: 12 }}>No shops yet</div>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                          {shopsForVendor(vendor.id).map(shop => (
                            <div key={shop.id} style={s.shopChip}>
                              <span style={{ fontWeight: 600 }}>{shop.shop_name}</span>
                              <span style={{ color: "#6b7280" }}>· {shop.city}</span>
                              {shop.phone && <span style={{ color: "#6b7280" }}>· {shop.phone}</span>}
                              <button onClick={() => deleteShop(shop.id)} style={s.chipDelete}>✕</button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add shop */}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <input style={{ ...s.input, flex: 1, minWidth: 120 }} placeholder="Shop name"
                          value={shopForm.shop_name} onChange={e => setShopForm(f => ({ ...f, shop_name: e.target.value }))} />
                        <input style={{ ...s.input, width: 110 }} placeholder="City"
                          value={shopForm.city} onChange={e => setShopForm(f => ({ ...f, city: e.target.value }))} />
                        <input style={{ ...s.input, width: 110 }} placeholder="Phone"
                          value={shopForm.phone} onChange={e => setShopForm(f => ({ ...f, phone: e.target.value }))} />
                        <button style={{ ...s.primaryBtn, height: 40, padding: "0 16px" }}
                          onClick={addShop} disabled={saving}>+ Add Shop</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {vendors.length === 0 && (
                <div style={s.emptyState}>No vendors yet. Add your first one above.</div>
              )}
            </div>
          )}

          {/* Brands */}
          <div style={s.card}>
            <h3 style={s.cardTitle}>🏷️ Brands</h3>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input style={{ ...s.input, flex: 1 }} placeholder="Brand name (e.g. Amul, Local Loose)"
                value={newBrand} onChange={e => setNewBrand(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addBrand()} />
              <button style={{ ...s.primaryBtn, height: 40, padding: "0 16px" }} onClick={addBrand}>Add</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {brands.map(b => (
                <span key={b.id} style={s.brandChip}>{b.name}</span>
              ))}
              {brands.length === 0 && <span style={{ color: "#9ca3af", fontSize: 13 }}>No brands yet</span>}
            </div>
          </div>
        </div>
      )}

      {/* ── PRICE CATALOG TAB ── */}
      {tab === "catalog" && (
        <div>
          {/* Add/Edit price form */}
          <div style={s.card}>
            <h3 style={s.cardTitle}>{editPrice ? "✏️ Edit Price Entry" : "➕ Add Price Entry"}</h3>

            <div style={s.grid2}>
              <div style={s.field}>
                <label style={s.label}>Shop *</label>
                <select style={s.input} value={priceForm.shop_id}
                  onChange={e => setPriceForm(f => ({ ...f, shop_id: e.target.value }))}>
                  <option value="">— Select shop —</option>
                  {vendors.map(v => (
                    <optgroup key={v.id} label={v.name}>
                      {shopsForVendor(v.id).map(sh => (
                        <option key={sh.id} value={sh.id}>{sh.shop_name} · {sh.city}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div style={s.field}>
                <label style={s.label}>Ingredient *</label>
                <select style={s.input} value={priceForm.ingredient_id}
                  onChange={e => {
                    const unit = ingredients.find(i => i.id === e.target.value)?.unit ?? ""
                    setPriceForm(f => ({ ...f, ingredient_id: e.target.value, unit }))
                  }}>
                  <option value="">— Select ingredient —</option>
                  {ingredients.map(i => (
                    <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={s.grid3}>
              <div style={s.field}>
                <label style={s.label}>Brand</label>
                <select style={s.input} value={priceForm.brand_id}
                  onChange={e => setPriceForm(f => ({ ...f, brand_id: e.target.value }))}>
                  <option value="">— No brand —</option>
                  {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div style={s.field}>
                <label style={s.label}>Price (₹) per {priceForm.unit || "unit"} *</label>
                <input style={s.input} type="number" min="0" step="0.01" placeholder="e.g. 0.06"
                  value={priceForm.price} onChange={e => setPriceForm(f => ({ ...f, price: e.target.value }))} />
              </div>
              <div style={s.field}>
                <label style={s.label}>Min Order Qty ({priceForm.unit || "unit"})</label>
                <input style={s.input} type="number" min="1" placeholder="1"
                  value={priceForm.min_qty} onChange={e => setPriceForm(f => ({ ...f, min_qty: e.target.value }))} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
              <label style={s.checkLabel}>
                <input type="checkbox" checked={priceForm.is_available}
                  onChange={e => setPriceForm(f => ({ ...f, is_available: e.target.checked }))} />
                Available
              </label>
              <label style={s.checkLabel}>
                <input type="checkbox" checked={priceForm.delivery_available}
                  onChange={e => setPriceForm(f => ({ ...f, delivery_available: e.target.checked }))} />
                Delivery Available
              </label>
              {priceForm.delivery_available && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <label style={s.label}>Delivery time (hrs)</label>
                  <input style={{ ...s.input, width: 80 }} type="number" min="0"
                    value={priceForm.delivery_time_hrs}
                    onChange={e => setPriceForm(f => ({ ...f, delivery_time_hrs: e.target.value }))} />
                </div>
              )}
            </div>

            <div style={s.field}>
              <label style={s.label}>Product URL (optional)</label>
              <input style={s.input} type="url" placeholder="https://..."
                value={priceForm.product_url} onChange={e => setPriceForm(f => ({ ...f, product_url: e.target.value }))} />
            </div>

            <div style={{ ...s.btnRow, marginTop: 14 }}>
              {editPrice && (
                <button style={s.secondaryBtn} onClick={resetPriceForm}>Cancel Edit</button>
              )}
              <button style={{ ...s.primaryBtn, opacity: saving ? 0.7 : 1 }}
                onClick={savePrice} disabled={saving}>
                {saving ? "Saving…" : editPrice ? "Update Price" : "Add Price"}
              </button>
            </div>
          </div>

          {/* Filters */}
          <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <select style={{ ...s.input, flex: 1, maxWidth: 260 }} value={priceFilter.ingredient_id}
              onChange={e => setPriceFilter(f => ({ ...f, ingredient_id: e.target.value }))}>
              <option value="">All Ingredients</option>
              {ingredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            <select style={{ ...s.input, flex: 1, maxWidth: 260 }} value={priceFilter.shop_id}
              onChange={e => setPriceFilter(f => ({ ...f, shop_id: e.target.value }))}>
              <option value="">All Shops</option>
              {shops.map(sh => <option key={sh.id} value={sh.id}>{sh.shop_name}</option>)}
            </select>
            {(priceFilter.ingredient_id || priceFilter.shop_id) && (
              <button style={s.secondaryBtn} onClick={() => setPriceFilter({ ingredient_id: "", shop_id: "" })}>
                Clear
              </button>
            )}
          </div>

          {/* Price catalog table */}
          <div style={s.card}>
            <h3 style={s.cardTitle}>Price Catalog · {filteredPrices.length} entr{filteredPrices.length === 1 ? "y" : "ies"}</h3>
            {filteredPrices.length === 0 ? (
              <div style={s.empty}>No price entries yet. Add one above.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      {["Ingredient","Shop","Brand","Price","Unit","Min Qty","Delivery","URL",""].map(h => (
                        <th key={h} style={s.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPrices.map((p, i) => {
                      const ing = ingredients.find(x => x.id === p.ingredient_id)
                      // Is this the best price for this ingredient among available entries?
                      const ingPrices = prices.filter(x => x.ingredient_id === p.ingredient_id && x.is_available)
                      const isBest = ingPrices.length > 0 && p.price === Math.min(...ingPrices.map(x => x.price)) && p.is_available
                      return (
                        <tr key={p.id} style={{ background: i % 2 === 0 ? "white" : "#f9fafb" }}>
                          <td style={{ ...s.td, fontWeight: 600 }}>
                            {ing?.name ?? "—"}
                            {isBest && <span style={s.bestBadge}>BEST</span>}
                          </td>
                          <td style={s.td}>
                            <div style={{ fontWeight: 500 }}>{p.vendor_shops?.shop_name}</div>
                            <div style={{ fontSize: 11, color: "#9ca3af" }}>{p.vendor_shops?.vendors?.name} · {p.vendor_shops?.city}</div>
                          </td>
                          <td style={s.td}>{p.brands?.name ?? <span style={{ color: "#9ca3af" }}>—</span>}</td>
                          <td style={{ ...s.td, textAlign: "right", fontWeight: 700, color: isBest ? "#16a34a" : "#111" }}>
                            {fmtCurrency(p.price)}
                          </td>
                          <td style={s.td}>{p.unit}</td>
                          <td style={{ ...s.td, textAlign: "right" }}>{fmt(p.min_qty, 0)}</td>
                          <td style={{ ...s.td, textAlign: "center" }}>
                            {p.delivery_available
                              ? <span style={{ color: "#16a34a", fontSize: 12 }}>✓ {p.delivery_time_hrs ? `${p.delivery_time_hrs}h` : ""}</span>
                              : <span style={{ color: "#9ca3af", fontSize: 12 }}>—</span>}
                          </td>
                          <td style={s.td}>
                            {p.product_url
                              ? <a href={p.product_url} target="_blank" rel="noopener noreferrer" style={{ color: "#1d4ed8", fontSize: 12 }}>Link ↗</a>
                              : <span style={{ color: "#9ca3af", fontSize: 12 }}>—</span>}
                          </td>
                          <td style={s.td}>
                            <div style={{ display: "flex", gap: 4 }}>
                              <button style={{ ...s.iconBtn, background: "#f3f4f6" }} onClick={() => startEditPrice(p)}>✏️</button>
                              <button style={{ ...s.iconBtn, background: "#fee2e2" }} onClick={() => deletePrice(p.id)}>🗑️</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── COMPARE TAB ── */}
      {tab === "compare" && (
        <div>
          <div style={s.card}>
            <h3 style={s.cardTitle}>🔍 Compare Prices</h3>
            <div style={s.field}>
              <label style={s.label}>Select Ingredient to Compare</label>
              <select style={{ ...s.input, maxWidth: 320 }} value={compareIngredient}
                onChange={e => setCompareIngredient(e.target.value)}>
                <option value="">— Pick an ingredient —</option>
                {ingredients.filter(i => prices.some(p => p.ingredient_id === i.id)).map(i => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
            </div>
          </div>

          {compareIngredient && (
            <div style={s.card}>
              {(() => {
                const ing = ingredients.find(i => i.id === compareIngredient)
                return (
                  <>
                    <h3 style={s.cardTitle}>
                      {ing?.name} — {compareData.length} vendor{compareData.length !== 1 ? "s" : ""}
                    </h3>
                    {compareData.length === 0 ? (
                      <div style={s.empty}>No available prices for this ingredient. Add some in the Price Catalog tab.</div>
                    ) : (
                      <div style={{ overflowX: "auto" }}>
                        <table style={s.table}>
                          <thead>
                            <tr>
                              <th style={s.th}>Rank</th>
                              <th style={s.th}>Vendor · Shop</th>
                              <th style={s.th}>Brand</th>
                              <th style={{ ...s.th, textAlign: "right" }}>Price / {ing?.unit}</th>
                              <th style={{ ...s.th, textAlign: "right" }}>vs Best</th>
                              <th style={s.th}>Min Qty</th>
                              <th style={s.th}>Delivery</th>
                              <th style={s.th}>URL</th>
                            </tr>
                          </thead>
                          <tbody>
                            {compareData.map((p, i) => {
                              const isBest = i === 0
                              const pct = bestPrice ? ((p.price - bestPrice) / bestPrice * 100) : 0
                              return (
                                <tr key={p.id} style={{ background: isBest ? "#f0fdf4" : i % 2 === 0 ? "white" : "#f9fafb" }}>
                                  <td style={{ ...s.td, fontWeight: 700, textAlign: "center" }}>
                                    {isBest ? "🏆" : `#${i + 1}`}
                                  </td>
                                  <td style={s.td}>
                                    <div style={{ fontWeight: 600 }}>{p.vendor_shops?.vendors?.name}</div>
                                    <div style={{ fontSize: 11, color: "#6b7280" }}>
                                      {p.vendor_shops?.shop_name} · {p.vendor_shops?.city}
                                      {p.vendor_shops?.vendors?.type === "online" ? " · 🌐" : " · 🏬"}
                                    </div>
                                  </td>
                                  <td style={s.td}>{p.brands?.name ?? "—"}</td>
                                  <td style={{ ...s.td, textAlign: "right", fontWeight: 800, fontSize: 15, color: isBest ? "#16a34a" : "#111" }}>
                                    {fmtCurrency(p.price)}
                                    {isBest && <span style={s.bestBadge}>BEST</span>}
                                  </td>
                                  <td style={{ ...s.td, textAlign: "right", color: isBest ? "#16a34a" : "#dc2626" }}>
                                    {isBest ? "—" : `+${fmt(pct, 1)}%`}
                                  </td>
                                  <td style={s.td}>{fmt(p.min_qty, 0)} {p.unit}</td>
                                  <td style={s.td}>
                                    {p.delivery_available
                                      ? <span style={{ color: "#16a34a", fontWeight: 600 }}>✓ {p.delivery_time_hrs ? `${p.delivery_time_hrs}h` : ""}</span>
                                      : <span style={{ color: "#9ca3af" }}>Pickup only</span>}
                                  </td>
                                  <td style={s.td}>
                                    {p.product_url
                                      ? <a href={p.product_url} target="_blank" rel="noopener noreferrer" style={{ color: "#1d4ed8", fontSize: 12 }}>View ↗</a>
                                      : "—"}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>

                        {/* Summary strip */}
                        <div style={s.summaryStrip}>
                          <div style={s.summaryItem}>
                            <span style={s.summaryLabel}>Best Price</span>
                            <span style={{ ...s.summaryValue, color: "#16a34a" }}>{fmtCurrency(bestPrice ?? 0)}</span>
                          </div>
                          <div style={s.summaryDivider} />
                          <div style={s.summaryItem}>
                            <span style={s.summaryLabel}>Worst Price</span>
                            <span style={{ ...s.summaryValue, color: "#dc2626" }}>
                              {fmtCurrency(compareData[compareData.length - 1]?.price ?? 0)}
                            </span>
                          </div>
                          <div style={s.summaryDivider} />
                          <div style={s.summaryItem}>
                            <span style={s.summaryLabel}>Potential Saving</span>
                            <span style={s.summaryValue}>
                              {fmtCurrency((compareData[compareData.length - 1]?.price ?? 0) - (bestPrice ?? 0))} / {ing?.unit}
                            </span>
                          </div>
                          <div style={s.summaryDivider} />
                          <div style={s.summaryItem}>
                            <span style={s.summaryLabel}>With Delivery</span>
                            <span style={s.summaryValue}>
                              {compareData.filter(p => p.delivery_available).length} vendor{compareData.filter(p => p.delivery_available).length !== 1 ? "s" : ""}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { padding: "16px 16px 80px", maxWidth: 1100, margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 },
  title: { fontSize: 22, fontWeight: 800, color: "#111", margin: 0 },
  subtitle: { fontSize: 13, color: "#6b7280", marginTop: 4 },
  stats: { display: "flex", gap: 6 },
  statPill: { background: "#111", color: "white", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 600 },
  tabBar: { display: "flex", gap: 4, marginBottom: 16, background: "#f3f4f6", borderRadius: 10, padding: 4 },
  tabBtn: { flex: 1, height: 36, border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", background: "transparent", color: "#374151" },
  tabBtnActive: { background: "white", fontWeight: 700, color: "#111", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" },
  card: { background: "white", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, marginBottom: 16 },
  cardTitle: { fontSize: 14, fontWeight: 700, color: "#111", margin: "0 0 14px" },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 },
  field: { display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 },
  label: { fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.4px" },
  input: { height: 40, padding: "0 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, color: "#111", background: "#fafafa", outline: "none", width: "100%", boxSizing: "border-box" },
  checkLabel: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 500, cursor: "pointer" },
  btnRow: { display: "flex", gap: 10, justifyContent: "flex-end" },
  primaryBtn: { height: 44, padding: "0 20px", background: "#111", color: "white", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" },
  secondaryBtn: { height: 44, padding: "0 20px", background: "white", color: "#374151", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  iconBtn: { width: 32, height: 32, border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14, flexShrink: 0 },
  badge: { display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600 },
  bestBadge: { background: "#16a34a", color: "white", borderRadius: 20, padding: "1px 6px", fontSize: 10, fontWeight: 800, marginLeft: 6 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { padding: "10px 12px", background: "#f3f4f6", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" },
  td: { padding: "10px 12px", borderBottom: "1px solid #f3f4f6", color: "#111", whiteSpace: "nowrap" },
  shopChip: { display: "inline-flex", alignItems: "center", gap: 6, background: "#f3f4f6", borderRadius: 20, padding: "4px 12px", fontSize: 12, border: "1px solid #e5e7eb" },
  chipDelete: { background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 14, padding: 0, lineHeight: 1 },
  brandChip: { background: "#ede9fe", color: "#6d28d9", borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 600 },
  summaryStrip: { display: "flex", alignItems: "center", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "12px 16px", marginTop: 12 },
  summaryItem: { display: "flex", flexDirection: "column", flex: 1, alignItems: "center" },
  summaryLabel: { fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 },
  summaryValue: { fontSize: 16, fontWeight: 800, color: "#111" },
  summaryDivider: { width: 1, height: 32, background: "#bbf7d0", margin: "0 8px" },
  errorBanner: { background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 12 },
  successBanner: { background: "#dcfce7", color: "#166534", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 12 },
  empty: { textAlign: "center", padding: "32px 20px", color: "#9ca3af", fontSize: 14 },
  emptyState: { textAlign: "center", padding: "40px 20px", color: "#9ca3af", fontSize: 14 },
}
