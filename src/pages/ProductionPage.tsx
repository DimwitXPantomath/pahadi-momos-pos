import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "stock" | "make_sub" | "make_product" | "setup" | "history"

interface SubRecipe {
  id: string
  name: string
  yield_qty?: number        // migration 001 column name
  yield_quantity?: number   // hook / alternate column name
  unit?: string             // migration 001
  yield_unit?: string       // hook / alternate
  shelf_life_hours: number
}

interface SubRecipeItem {
  id: string
  ingredient_id: string
  ingredient_name: string
  ingredient_usage_unit: string
  quantity: number        // qty needed per yield_qty of sub recipe
}

interface BatchOption {
  id: string
  sub_recipe_id: string
  label: string
  quantity: number
  sort_order: number
}

interface StockBatch {
  id: string
  sub_recipe_id: string
  sub_recipe_name: string
  shelf_life_hours: number
  quantity: number
  original_quantity: number
  unit: string
  produced_at: string
  expires_at: string
  is_spoiled: boolean
  alarm_acknowledged: boolean
}

interface RecipeRow {
  id: string
  name: string
  serves: number
  output_item_id: string | null
  output_item_name: string | null
}

interface RecipeItem {
  id: string
  ingredient_id: string | null
  sub_recipe_id: string | null
  ingredient_name: string | null
  sub_recipe_name: string | null
  usage_unit: string | null
  sr_unit: string | null
  quantity: number
}

interface Ingredient {
  id: string
  name: string
  usage_unit: string
  current_stock: number
}

interface ProductionHistoryRow {
  type: "sub_recipe" | "main_recipe"
  id: string
  name: string
  quantity: number
  unit: string
  produced_at: string
  notes: string | null
  is_spoiled?: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Normalize sub recipe fields — handles both naming conventions
function srYield(sr: SubRecipe): number {
  return sr.yield_quantity ?? sr.yield_qty ?? 1
}
function srUnit(sr: SubRecipe): string {
  return sr.yield_unit ?? sr.unit ?? "g"
}

function fmt(n: number, d = 1) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: d })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  })
}

function hoursRemaining(expiresAt: string): number {
  return (new Date(expiresAt).getTime() - Date.now()) / (1000 * 3600)
}

function expiryLabel(hrs: number, shelfLife: number): { label: string; color: string; bg: string } {
  if (hrs <= 0) return { label: "Expired", color: "#991b1b", bg: "#fee2e2" }
  const pct = hrs / shelfLife
  if (pct < 0.2 || hrs < 2) return {
    label: hrs < 1 ? `${Math.round(hrs * 60)}m left` : `${hrs.toFixed(1)}h left`,
    color: "#991b1b", bg: "#fee2e2",
  }
  if (pct < 0.4) return {
    label: `${hrs.toFixed(1)}h left`,
    color: "#92400e", bg: "#fef3c7",
  }
  if (hrs < 24) return { label: `${hrs.toFixed(1)}h left`, color: "#166534", bg: "#dcfce7" }
  return { label: `${(hrs / 24).toFixed(1)}d left`, color: "#166534", bg: "#dcfce7" }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProductionPage() {
  const [tab, setTab] = useState<Tab>("stock")

  // ── Shared data
  const [subRecipes, setSubRecipes]     = useState<SubRecipe[]>([])
  const [batchOptions, setBatchOptions] = useState<BatchOption[]>([])
  const [stockBatches, setStockBatches] = useState<StockBatch[]>([])
  const [ingredients, setIngredients]   = useState<Ingredient[]>([])
  const [recipes, setRecipes]           = useState<RecipeRow[]>([])
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState("")
  const [success, setSuccess]           = useState("")

  // ── Make Sub Recipe tab
  const [makeSub, setMakeSub] = useState({
    sub_recipe_id: "",
    batch_option_id: "",
    notes: "",
  })
  const [subItems, setSubItems]     = useState<SubRecipeItem[]>([])
  const [makingSubSaving, setMakingSubSaving] = useState(false)
  const [subPreview, setSubPreview] = useState<{ name: string; deduct: number; unit: string; available: number; ok: boolean }[]>([])

  // ── Make Product tab
  const [makeProd, setMakeProd] = useState({
    recipe_id: "",
    servings: "1",
    notes: "",
  })
  const [recipeItems, setRecipeItems] = useState<RecipeItem[]>([])
  const [prodSaving, setProdSaving]   = useState(false)
  const [prodPreview, setProdPreview] = useState<{
    name: string; type: "ingredient" | "sub_recipe"; deduct: number; unit: string; available: number; ok: boolean
  }[]>([])

  // ── Setup tab
  const [setupSR, setSetupSR]     = useState("")
  const [newOpt, setNewOpt]       = useState({ label: "", quantity: "" })
  const [optSaving, setOptSaving] = useState(false)

  // ── History
  const [history, setHistory] = useState<ProductionHistoryRow[]>([])

  // ─────────────────────────────────────────────────────────────────────────────
  // DATA FETCHING
  // ─────────────────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true)

    const [srRes, boRes, stockRes, ingRes, recRes, invRes] = await Promise.all([
      supabase.from("sub_recipes").select("*").order("name"),
      supabase.from("sub_recipe_batch_options").select("*").order("sort_order"),
      supabase.from("sub_recipe_stock")
        .select(`id, sub_recipe_id, quantity, original_quantity, unit, produced_at, expires_at, is_spoiled, alarm_acknowledged,
          sub_recipes ( name, shelf_life_hours )`)
        .order("produced_at", { ascending: false }),
      // NOTE: current_stock is NOT selected from ingredients here — that
      // column is legacy (see inventoryService.ts's updateStock comment).
      // inventory_stock.current_quantity is the real, order-placement-
      // deducted number; ingredients.current_stock would silently drift
      // from it the moment any order got sold. Fetched separately below
      // and merged, same pattern as ProcurementView.tsx/purchaseSheetService.ts.
      supabase.from("ingredients").select("id, name, usage_unit").order("name"),
      supabase.from("recipes")
        .select(`id, name, serves, output_item_id, items ( name )`)
        .order("name"),
      supabase.from("inventory_stock").select("ingredient_id, current_quantity"),
    ])

    setSubRecipes((srRes.data || []) as SubRecipe[])
    setBatchOptions((boRes.data || []) as BatchOption[])

    const mapped: StockBatch[] = (stockRes.data || []).map((r: any) => ({
      id: r.id,
      sub_recipe_id: r.sub_recipe_id,
      sub_recipe_name: r.sub_recipes?.name ?? "—",
      shelf_life_hours: r.sub_recipes?.shelf_life_hours ?? 24,
      quantity: r.quantity,
      original_quantity: r.original_quantity,
      unit: r.unit,
      produced_at: r.produced_at,
      expires_at: r.expires_at,
      is_spoiled: r.is_spoiled,
      alarm_acknowledged: r.alarm_acknowledged,
    }))
    setStockBatches(mapped)
    const stockMap = new Map((invRes.data || []).map((s: any) => [s.ingredient_id, s.current_quantity || 0]))
    setIngredients(((ingRes.data || []) as Omit<Ingredient, "current_stock">[]).map(i => ({
      ...i, current_stock: stockMap.get(i.id) || 0,
    })))
    setRecipes((recRes.data || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      serves: r.serves,
      output_item_id: r.output_item_id,
      output_item_name: r.items?.name ?? null,
    })))

    setLoading(false)
  }, [])

  const fetchHistory = useCallback(async () => {
    const [srStock, prodBatch] = await Promise.all([
      supabase.from("sub_recipe_stock")
        .select(`id, quantity, original_quantity, unit, produced_at, notes, is_spoiled, sub_recipes ( name )`)
        .order("produced_at", { ascending: false })
        .limit(30),
      supabase.from("production_batches")
        .select(`id, servings, produced_at, notes, recipes ( name )`)
        .order("produced_at", { ascending: false })
        .limit(30),
    ])

    const rows: ProductionHistoryRow[] = []
    for (const r of (srStock.data || [])) {
      rows.push({
        type: "sub_recipe",
        id: r.id,
        name: (r.sub_recipes as any)?.name ?? "—",
        quantity: r.original_quantity || r.quantity,
        unit: r.unit,
        produced_at: r.produced_at,
        notes: r.notes,
        is_spoiled: r.is_spoiled,
      })
    }
    for (const r of (prodBatch.data || [])) {
      rows.push({
        type: "main_recipe",
        id: r.id,
        name: (r.recipes as any)?.name ?? "—",
        quantity: r.servings,
        unit: "servings",
        produced_at: r.produced_at,
        notes: r.notes,
      })
    }
    rows.sort((a, b) => new Date(b.produced_at).getTime() - new Date(a.produced_at).getTime())
    setHistory(rows)
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  useEffect(() => {
    if (tab === "history") fetchHistory()
  }, [tab, fetchHistory])

  // ─────────────────────────────────────────────────────────────────────────────
  // MAKE SUB RECIPE — ingredient preview
  // ─────────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!makeSub.sub_recipe_id || !makeSub.batch_option_id) {
      setSubItems([])
      setSubPreview([])
      return
    }
    fetchSubPreview(makeSub.sub_recipe_id, makeSub.batch_option_id)
  }, [makeSub.sub_recipe_id, makeSub.batch_option_id])

  async function fetchSubPreview(srId: string, boId: string) {
    const sr = subRecipes.find(r => r.id === srId)
    const bo = batchOptions.find(o => o.id === boId)
    if (!sr || !bo) return

    const { data: items } = await supabase
      .from("sub_recipe_items")
      .select(`id, ingredient_id, quantity, ingredients ( name, usage_unit, current_stock )`)
      .eq("sub_recipe_id", srId)

    const ratio = bo.quantity / srYield(sr)
    const mapped: SubRecipeItem[] = (items || []).map((i: any) => ({
      id: i.id,
      ingredient_id: i.ingredient_id,
      ingredient_name: i.ingredients?.name ?? "—",
      ingredient_usage_unit: i.ingredients?.usage_unit ?? "g",
      quantity: i.quantity,
    }))
    setSubItems(mapped)

    const preview = mapped.map(item => {
      const deduct = item.quantity * ratio
      const ing = ingredients.find(ig => ig.id === item.ingredient_id)
      const available = ing?.current_stock ?? 0
      return {
        name: item.ingredient_name,
        deduct,
        unit: item.ingredient_usage_unit,
        available,
        ok: available >= deduct,
      }
    })
    setSubPreview(preview)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MAKE SUB RECIPE — confirm
  // ─────────────────────────────────────────────────────────────────────────────

  async function handleMakeSubRecipe() {
    if (!makeSub.sub_recipe_id || !makeSub.batch_option_id) {
      setError("Select a sub recipe and batch option")
      return
    }
    const canProceed = subPreview.every(p => p.ok)
    if (!canProceed) {
      setError("Not enough stock for some ingredients")
      return
    }

    const sr = subRecipes.find(r => r.id === makeSub.sub_recipe_id)!
    const bo = batchOptions.find(o => o.id === makeSub.batch_option_id)!
    const ratio = bo.quantity / srYield(sr)

    setMakingSubSaving(true)
    setError("")

    // 1. Deduct ingredients
    for (const item of subItems) {
      const deduct = item.quantity * ratio
      const ing = ingredients.find(ig => ig.id === item.ingredient_id)
      if (!ing) continue
      const newStock = Math.max(0, ing.current_stock - deduct)
      const { error: updErr } = await supabase
        .from("inventory_stock")
        .upsert({ ingredient_id: item.ingredient_id, current_quantity: newStock, updated_at: new Date().toISOString() }, { onConflict: "ingredient_id" })
      if (updErr) { setError(updErr.message); setMakingSubSaving(false); return }
    }

    // 2. Add to sub_recipe_stock
    const now = new Date()
    const expiresAt = new Date(now.getTime() + sr.shelf_life_hours * 3600 * 1000).toISOString()
    const { error: stockErr } = await supabase
      .from("sub_recipe_stock")
      .insert({
        sub_recipe_id: makeSub.sub_recipe_id,
        batch_option_id: makeSub.batch_option_id,
        quantity: bo.quantity,
        original_quantity: bo.quantity,
        unit: srUnit(sr),
        produced_at: now.toISOString(),
        expires_at: expiresAt,
        notes: makeSub.notes || null,
      })
    if (stockErr) { setError(stockErr.message); setMakingSubSaving(false); return }

    flash(`✅ Made ${bo.label} of ${sr.name}`)
    setMakeSub({ sub_recipe_id: "", batch_option_id: "", notes: "" })
    setSubPreview([])
    fetchAll()
    setMakingSubSaving(false)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MAKE PRODUCT — recipe item preview
  // ─────────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!makeProd.recipe_id) { setRecipeItems([]); setProdPreview([]); return }
    fetchProdPreview(makeProd.recipe_id, parseFloat(makeProd.servings) || 1)
  }, [makeProd.recipe_id, makeProd.servings])

  async function fetchProdPreview(recipeId: string, servings: number) {
    const recipe = recipes.find(r => r.id === recipeId)
    if (!recipe) return

    const { data: items } = await supabase
      .from("recipe_items")
      .select(`
        id, quantity, ingredient_id, sub_recipe_id,
        ingredients ( name, usage_unit, current_stock ),
        sub_recipes ( name, unit )
      `)
      .eq("recipe_id", recipeId)

    const ratio = servings / recipe.serves
    const mapped: RecipeItem[] = (items || []).map((i: any) => ({
      id: i.id,
      ingredient_id: i.ingredient_id,
      sub_recipe_id: i.sub_recipe_id,
      ingredient_name: i.ingredients?.name ?? null,
      sub_recipe_name: i.sub_recipes?.name ?? null,
      usage_unit: i.ingredients?.usage_unit ?? null,
      sr_unit: i.sub_recipes?.unit ?? null,
      quantity: i.quantity,
    }))
    setRecipeItems(mapped)

    // Build preview
    const preview: typeof prodPreview = []
    for (const item of mapped) {
      const needed = item.quantity * ratio
      if (item.ingredient_id) {
        const ing = ingredients.find(ig => ig.id === item.ingredient_id)
        preview.push({
          name: item.ingredient_name ?? "—",
          type: "ingredient",
          deduct: needed,
          unit: item.usage_unit ?? "g",
          available: ing?.current_stock ?? 0,
          ok: (ing?.current_stock ?? 0) >= needed,
        })
      } else if (item.sub_recipe_id) {
        // Sum available stock for this sub recipe (non-spoiled, non-expired)
        const now = Date.now()
        const available = stockBatches
          .filter(b =>
            b.sub_recipe_id === item.sub_recipe_id &&
            !b.is_spoiled &&
            b.quantity > 0 &&
            new Date(b.expires_at).getTime() > now
          )
          .reduce((sum, b) => sum + b.quantity, 0)
        preview.push({
          name: item.sub_recipe_name ?? "—",
          type: "sub_recipe",
          deduct: needed,
          unit: item.sr_unit ?? "g",
          available,
          ok: available >= needed,
        })
      }
    }
    setProdPreview(preview)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MAKE PRODUCT — confirm (FIFO sub recipe deduction)
  // ─────────────────────────────────────────────────────────────────────────────

  async function handleMakeProduct() {
    if (!makeProd.recipe_id) { setError("Select a recipe"); return }
    const servings = parseFloat(makeProd.servings) || 0
    if (servings <= 0) { setError("Enter valid servings"); return }
    if (prodPreview.some(p => !p.ok)) { setError("Insufficient stock"); return }

    const recipe = recipes.find(r => r.id === makeProd.recipe_id)!
    const ratio = servings / recipe.serves

    setProdSaving(true)
    setError("")

    // 1. Deduct direct ingredients
    for (const item of recipeItems.filter(i => i.ingredient_id)) {
      const needed = item.quantity * ratio
      const ing = ingredients.find(ig => ig.id === item.ingredient_id)
      if (!ing) continue
      const { error: updErr } = await supabase
        .from("inventory_stock")
        .upsert({ ingredient_id: item.ingredient_id, current_quantity: Math.max(0, ing.current_stock - needed), updated_at: new Date().toISOString() }, { onConflict: "ingredient_id" })
      if (updErr) { setError(updErr.message); setProdSaving(false); return }
    }

    // 2. Deduct sub recipe stock FIFO (oldest first)
    for (const item of recipeItems.filter(i => i.sub_recipe_id)) {
      let remaining = item.quantity * ratio
      const now = Date.now()
      const available = stockBatches
        .filter(b =>
          b.sub_recipe_id === item.sub_recipe_id &&
          !b.is_spoiled &&
          b.quantity > 0 &&
          new Date(b.expires_at).getTime() > now
        )
        .sort((a, b) => new Date(a.produced_at).getTime() - new Date(b.produced_at).getTime())

      for (const batch of available) {
        if (remaining <= 0) break
        const take = Math.min(remaining, batch.quantity)
        remaining -= take
        const { error: updErr } = await supabase
          .from("sub_recipe_stock")
          .update({ quantity: batch.quantity - take })
          .eq("id", batch.id)
        if (updErr) { setError(updErr.message); setProdSaving(false); return }
      }
    }

    // 3. Log production batch
    await supabase.from("production_batches").insert({
      recipe_id: makeProd.recipe_id,
      servings,
      notes: makeProd.notes || null,
    })

    // 4. Add finished good to stock if linked
    if (recipe.output_item_id) {
      const { data: existingStock } = await supabase
        .from("stock")
        .select("id, quantity")
        .eq("item_id", recipe.output_item_id)
        .single()

      if (existingStock) {
        await supabase.from("stock")
          .update({ quantity: existingStock.quantity + servings })
          .eq("id", existingStock.id)
      } else {
        await supabase.from("stock")
          .insert({ item_id: recipe.output_item_id, quantity: servings })
      }
    }

    flash(`✅ Logged ${servings} × ${recipe.name}`)
    setMakeProd({ recipe_id: "", servings: "1", notes: "" })
    setProdPreview([])
    fetchAll()
    setProdSaving(false)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MARK SPOILED
  // ─────────────────────────────────────────────────────────────────────────────

  async function handleMarkSpoiled(batch: StockBatch) {
    const { error: updErr } = await supabase
      .from("sub_recipe_stock")
      .update({
        is_spoiled: true,
        spoiled_qty: batch.quantity,
        spoiled_at: new Date().toISOString(),
        quantity: 0,
      })
      .eq("id", batch.id)
    if (updErr) { setError(updErr.message); return }
    flash(`Marked ${batch.sub_recipe_name} batch as spoiled`)
    fetchAll()
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SETUP — batch options CRUD
  // ─────────────────────────────────────────────────────────────────────────────

  async function handleAddOption() {
    if (!setupSR || !newOpt.label.trim() || !newOpt.quantity) {
      setError("Fill all fields"); return
    }
    setOptSaving(true)
    const { error: insErr } = await supabase.from("sub_recipe_batch_options").insert({
      sub_recipe_id: setupSR,
      label: newOpt.label.trim(),
      quantity: parseFloat(newOpt.quantity),
      sort_order: batchOptions.filter(o => o.sub_recipe_id === setupSR).length,
    })
    if (insErr) { setError(insErr.message); setOptSaving(false); return }
    setNewOpt({ label: "", quantity: "" })
    flash("Batch option added")
    fetchAll()
    setOptSaving(false)
  }

  async function handleDeleteOption(id: string) {
    await supabase.from("sub_recipe_batch_options").delete().eq("id", id)
    fetchAll()
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  function flash(msg: string) {
    setSuccess(msg)
    setTimeout(() => setSuccess(""), 3000)
  }

  function switchTab(t: Tab) {
    setTab(t)
    setError("")
    setSuccess("")
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  // Derived stock stats
  const now = Date.now()
  const activeBatches = stockBatches.filter(b => !b.is_spoiled && b.quantity > 0 && new Date(b.expires_at).getTime() > now)
  const expiredBatches = stockBatches.filter(b => !b.is_spoiled && b.quantity > 0 && new Date(b.expires_at).getTime() <= now)
  const spoiledBatches = stockBatches.filter(b => b.is_spoiled)
  const selectedSROptions = batchOptions.filter(o => o.sub_recipe_id === makeSub.sub_recipe_id)

  return (
    <div style={s.page}>

      {/* ── Header ── */}
      <div style={s.header}>
        <div>
          <h2 style={s.title}>🍳 Production</h2>
          <p style={s.subtitle}>Sub recipe stock, batch prep & product assembly</p>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={s.tabRow}>
        {[
          { key: "stock",       label: "📋 Sub Recipe Stock" },
          { key: "make_sub",    label: "🥣 Make Sub Recipe" },
          { key: "make_product",label: "🍽️ Make Product" },
          { key: "setup",       label: "⚙️ Batch Setup" },
          { key: "history",     label: "📜 History" },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key as Tab)}
            style={{
              ...s.tabBtn,
              background: tab === t.key ? "hsl(var(--primary))" : "white",
              color: tab === t.key ? "white" : "#374151",
              fontWeight: tab === t.key ? 700 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div style={s.errorBanner}>⚠️ {error}</div>}
      {success && <div style={s.successBanner}>{success}</div>}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: STOCK
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === "stock" && (
        <div>
          {/* Stats */}
          <div style={s.statsRow}>
            {[
              { label: "Active Batches",  value: activeBatches.length,  icon: "✅", color: "#16a34a" },
              { label: "Expiring / Expired", value: expiredBatches.length, icon: "⚠️", color: expiredBatches.length > 0 ? "#d97706" : "#111" },
              { label: "Spoiled",          value: spoiledBatches.length, icon: "🗑️", color: spoiledBatches.length > 0 ? "#ef4444" : "#111" },
            ].map(stat => (
              <div key={stat.label} style={s.statCard}>
                <span style={{ fontSize: 20 }}>{stat.icon}</span>
                <span style={{ fontSize: 24, fontWeight: 800, color: stat.color }}>{stat.value}</span>
                <span style={{ fontSize: 11, color: "#6b7280" }}>{stat.label}</span>
              </div>
            ))}
          </div>

          {loading ? (
            <div style={s.emptyState}>Loading…</div>
          ) : activeBatches.length === 0 && expiredBatches.length === 0 ? (
            <div style={s.emptyState}>
              No stock yet.{" "}
              <button style={s.linkBtn} onClick={() => switchTab("make_sub")}>Make your first batch →</button>
            </div>
          ) : (
            <div style={s.card}>
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      {["Sub Recipe", "Qty in Stock", "Produced", "Expires", "Status", ""].map(h => (
                        <th key={h} style={s.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...activeBatches, ...expiredBatches].map((batch, i) => {
                      const hrs = hoursRemaining(batch.expires_at)
                      const exp = expiryLabel(hrs, batch.shelf_life_hours)
                      return (
                        <tr key={batch.id} style={{ background: i % 2 === 0 ? "white" : "#f9fafb" }}>
                          <td style={{ ...s.td, fontWeight: 600 }}>{batch.sub_recipe_name}</td>
                          <td style={{ ...s.td, textAlign: "right", fontFamily: "monospace" }}>
                            <span style={{ fontWeight: 700 }}>{fmt(batch.quantity)}</span>
                            <span style={{ color: "#9ca3af" }}>/{fmt(batch.original_quantity)} {batch.unit}</span>
                          </td>
                          <td style={{ ...s.td, fontSize: 12, color: "#6b7280" }}>{fmtDate(batch.produced_at)}</td>
                          <td style={{ ...s.td, fontSize: 12, color: "#6b7280" }}>{fmtDate(batch.expires_at)}</td>
                          <td style={s.td}>
                            <span style={{ ...s.badge, background: exp.bg, color: exp.color }}>{exp.label}</span>
                          </td>
                          <td style={s.td}>
                            <button
                              style={{ ...s.spoilBtn }}
                              onClick={() => handleMarkSpoiled(batch)}
                            >
                              🗑️ Spoil
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {spoiledBatches.length > 0 && (
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: "pointer", fontSize: 13, color: "#6b7280", userSelect: "none", padding: "8px 0" }}>
                🗑️ {spoiledBatches.length} spoiled batch{spoiledBatches.length !== 1 ? "es" : ""} (click to expand)
              </summary>
              <div style={{ ...s.card, marginTop: 8 }}>
                <div style={s.tableWrap}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        {["Sub Recipe", "Original Qty", "Spoiled", "Expires"].map(h => (
                          <th key={h} style={s.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {spoiledBatches.map((b, i) => (
                        <tr key={b.id} style={{ background: i % 2 === 0 ? "white" : "#f9fafb", opacity: 0.7 }}>
                          <td style={{ ...s.td, color: "#6b7280" }}>{b.sub_recipe_name}</td>
                          <td style={{ ...s.td, textAlign: "right" }}>{fmt(b.original_quantity)} {b.unit}</td>
                          <td style={{ ...s.td, color: "#ef4444" }}>Spoiled</td>
                          <td style={{ ...s.td, fontSize: 12, color: "#6b7280" }}>{fmtDate(b.expires_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: MAKE SUB RECIPE
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === "make_sub" && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>🥣 Make Sub Recipe</h3>

          <div style={s.grid2}>
            <div style={s.field}>
              <label style={s.label}>Sub Recipe *</label>
              <select
                style={s.input}
                value={makeSub.sub_recipe_id}
                onChange={e => setMakeSub(f => ({ ...f, sub_recipe_id: e.target.value, batch_option_id: "" }))}
              >
                <option value="">— Select sub recipe —</option>
                {subRecipes.map(sr => (
                  <option key={sr.id} value={sr.id}>{sr.name}</option>
                ))}
              </select>
            </div>
            <div style={s.field}>
              <label style={s.label}>Batch Size *</label>
              <select
                style={{ ...s.input, opacity: makeSub.sub_recipe_id ? 1 : 0.5 }}
                value={makeSub.batch_option_id}
                onChange={e => setMakeSub(f => ({ ...f, batch_option_id: e.target.value }))}
                disabled={!makeSub.sub_recipe_id}
              >
                <option value="">— Select batch size —</option>
                {selectedSROptions.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.label} ({fmt(o.quantity, 0)} {srUnit(subRecipes.find(r => r.id === makeSub.sub_recipe_id)!)})
                  </option>
                ))}
              </select>
              {makeSub.sub_recipe_id && selectedSROptions.length === 0 && (
                <span style={{ fontSize: 11, color: "#d97706" }}>
                  No batch options set.{" "}
                  <button style={{ ...s.linkBtn, fontSize: 11 }} onClick={() => switchTab("setup")}>
                    Add in Setup →
                  </button>
                </span>
              )}
            </div>
          </div>

          <div style={s.field}>
            <label style={s.label}>Notes (optional)</label>
            <input
              style={{ ...s.input, marginBottom: 16 }}
              placeholder="e.g. Made for evening service"
              value={makeSub.notes}
              onChange={e => setMakeSub(f => ({ ...f, notes: e.target.value }))}
            />
          </div>

          {/* Ingredient deduction preview */}
          {subPreview.length > 0 && (
            <div style={s.previewBox}>
              <div style={s.previewTitle}>📦 Ingredient Deduction Preview</div>
              {subPreview.map((p, i) => (
                <div key={i} style={s.previewRow}>
                  <span style={{ flex: 1, fontWeight: 600 }}>{p.name}</span>
                  <span style={{ fontFamily: "monospace", color: p.ok ? "#374151" : "#ef4444" }}>
                    -{fmt(p.deduct)} {p.unit}
                  </span>
                  <span style={{ fontSize: 12, color: "#9ca3af", marginLeft: 8 }}>
                    (have {fmt(p.available)} {p.unit})
                  </span>
                  <span style={{ marginLeft: 8, fontSize: 14 }}>{p.ok ? "✅" : "❌"}</span>
                </div>
              ))}
              {!subPreview.every(p => p.ok) && (
                <div style={{ fontSize: 12, color: "#ef4444", marginTop: 8, fontWeight: 600 }}>
                  ⚠️ Insufficient stock — cannot proceed
                </div>
              )}
            </div>
          )}

          <div style={s.btnRow}>
            <button
              style={{
                ...s.primaryBtn,
                opacity: (makingSubSaving || !makeSub.sub_recipe_id || !makeSub.batch_option_id || (subPreview.length > 0 && !subPreview.every(p => p.ok))) ? 0.5 : 1,
              }}
              onClick={handleMakeSubRecipe}
              disabled={makingSubSaving || !makeSub.sub_recipe_id || !makeSub.batch_option_id}
            >
              {makingSubSaving ? "Processing…" : "✓ Confirm Production"}
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: MAKE PRODUCT
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === "make_product" && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>🍽️ Make Product</h3>

          <div style={s.grid2}>
            <div style={s.field}>
              <label style={s.label}>Recipe *</label>
              <select
                style={s.input}
                value={makeProd.recipe_id}
                onChange={e => setMakeProd(f => ({ ...f, recipe_id: e.target.value }))}
              >
                <option value="">— Select recipe —</option>
                {recipes.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name} {r.output_item_name ? `→ ${r.output_item_name}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div style={s.field}>
              <label style={s.label}>Servings / Portions *</label>
              <input
                style={s.input}
                type="number"
                min="0.5"
                step="0.5"
                value={makeProd.servings}
                onChange={e => setMakeProd(f => ({ ...f, servings: e.target.value }))}
              />
              {makeProd.recipe_id && (
                <span style={{ fontSize: 11, color: "#9ca3af" }}>
                  Base recipe: {recipes.find(r => r.id === makeProd.recipe_id)?.serves} serving(s)
                </span>
              )}
            </div>
          </div>

          <div style={s.field}>
            <label style={s.label}>Notes (optional)</label>
            <input
              style={{ ...s.input, marginBottom: 16 }}
              placeholder="e.g. Batch for Sunday lunch service"
              value={makeProd.notes}
              onChange={e => setMakeProd(f => ({ ...f, notes: e.target.value }))}
            />
          </div>

          {/* Deduction preview */}
          {prodPreview.length > 0 && (
            <div style={s.previewBox}>
              <div style={s.previewTitle}>📦 What gets consumed</div>
              {prodPreview.map((p, i) => (
                <div key={i} style={s.previewRow}>
                  <span style={{
                    ...s.badge,
                    background: p.type === "sub_recipe" ? "#ede9fe" : "#dbeafe",
                    color: p.type === "sub_recipe" ? "#6d28d9" : "#1e40af",
                    marginRight: 8,
                    fontSize: 10,
                  }}>
                    {p.type === "sub_recipe" ? "SUB RECIPE" : "INGREDIENT"}
                  </span>
                  <span style={{ flex: 1, fontWeight: 600 }}>{p.name}</span>
                  <span style={{ fontFamily: "monospace", color: p.ok ? "#374151" : "#ef4444" }}>
                    -{fmt(p.deduct)} {p.unit}
                  </span>
                  <span style={{ fontSize: 12, color: "#9ca3af", marginLeft: 8 }}>
                    (have {fmt(p.available)} {p.unit})
                  </span>
                  <span style={{ marginLeft: 8, fontSize: 14 }}>{p.ok ? "✅" : "❌"}</span>
                </div>
              ))}

              {recipes.find(r => r.id === makeProd.recipe_id)?.output_item_name && (
                <div style={{ ...s.previewRow, borderTop: "1px solid #e5e7eb", marginTop: 8, paddingTop: 8 }}>
                  <span style={{ ...s.badge, background: "#dcfce7", color: "#166534", marginRight: 8, fontSize: 10 }}>OUTPUT</span>
                  <span style={{ flex: 1, fontWeight: 600 }}>
                    {recipes.find(r => r.id === makeProd.recipe_id)?.output_item_name}
                  </span>
                  <span style={{ fontFamily: "monospace", color: "#16a34a", fontWeight: 700 }}>
                    +{makeProd.servings} servings
                  </span>
                </div>
              )}

              {prodPreview.some(p => !p.ok) && (
                <div style={{ fontSize: 12, color: "#ef4444", marginTop: 8, fontWeight: 600 }}>
                  ⚠️ Insufficient stock — cannot proceed
                </div>
              )}
            </div>
          )}

          <div style={s.btnRow}>
            <button
              style={{
                ...s.primaryBtn,
                opacity: (prodSaving || !makeProd.recipe_id || prodPreview.some(p => !p.ok)) ? 0.5 : 1,
              }}
              onClick={handleMakeProduct}
              disabled={prodSaving || !makeProd.recipe_id}
            >
              {prodSaving ? "Processing…" : "✓ Confirm Production"}
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: SETUP (Batch Options)
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === "setup" && (
        <div>
          <div style={s.card}>
            <h3 style={s.cardTitle}>⚙️ Batch Options Setup</h3>
            <p style={{ fontSize: 13, color: "#6b7280", marginTop: -8, marginBottom: 16 }}>
              Define the quantity options that appear in the "Make Sub Recipe" dropdown for each sub recipe.
            </p>

            <div style={s.grid2}>
              <div style={s.field}>
                <label style={s.label}>Sub Recipe</label>
                <select
                  style={s.input}
                  value={setupSR}
                  onChange={e => setSetupSR(e.target.value)}
                >
                  <option value="">— Select sub recipe —</option>
                  {subRecipes.map(sr => (
                    <option key={sr.id} value={sr.id}>
                      {sr.name} (yield: {fmt(srYield(sr), 0)} {srUnit(sr)}, shelf life: {sr.shelf_life_hours}h)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {setupSR && (
              <>
                {/* Existing options */}
                {batchOptions.filter(o => o.sub_recipe_id === setupSR).length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", textTransform: "uppercase", marginBottom: 8 }}>
                      Current Options
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {batchOptions
                        .filter(o => o.sub_recipe_id === setupSR)
                        .map(opt => {
                          const sr = subRecipes.find(r => r.id === setupSR)
                          return (
                            <div key={opt.id} style={s.optRow}>
                              <span style={{ fontWeight: 600 }}>{opt.label}</span>
                              <span style={{ fontFamily: "monospace", color: "#374151" }}>
                                {fmt(opt.quantity, 0)} {sr?.unit}
                              </span>
                              <button
                                style={s.deleteBtn}
                                onClick={() => handleDeleteOption(opt.id)}
                              >
                                ✕
                              </button>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                )}

                {/* Add new option */}
                <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", textTransform: "uppercase", marginBottom: 8 }}>
                  Add New Option
                </div>
                <div style={s.grid2}>
                  <div style={s.field}>
                    <label style={s.label}>Label</label>
                    <input
                      style={s.input}
                      placeholder="e.g. Small Batch, Standard, Catering"
                      value={newOpt.label}
                      onChange={e => setNewOpt(f => ({ ...f, label: e.target.value }))}
                    />
                  </div>
                  <div style={s.field}>
                    <label style={s.label}>
                      Quantity ({subRecipes.find(r => r.id === setupSR)?.unit})
                    </label>
                    <input
                      style={s.input}
                      type="number"
                      min="1"
                      placeholder="e.g. 500"
                      value={newOpt.quantity}
                      onChange={e => setNewOpt(f => ({ ...f, quantity: e.target.value }))}
                    />
                  </div>
                </div>
                <div style={s.btnRow}>
                  <button
                    style={{ ...s.primaryBtn, opacity: optSaving ? 0.7 : 1 }}
                    onClick={handleAddOption}
                    disabled={optSaving}
                  >
                    {optSaving ? "Saving…" : "Add Option"}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Shelf life edit hint */}
          <div style={{ ...s.card, background: "#f9fafb" }}>
            <div style={{ fontSize: 13, color: "#6b7280" }}>
              <strong style={{ color: "#374151" }}>💡 Shelf life</strong> is set per sub recipe.
              To edit shelf life hours, go to <strong>Sub Recipes</strong> and edit the recipe — the shelf life field is there.
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: HISTORY
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === "history" && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>📜 Production History</h3>
          {history.length === 0 ? (
            <div style={s.emptyState}>No production logged yet.</div>
          ) : (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {["Type", "Name", "Qty", "Produced At", "Notes"].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((row, i) => (
                    <tr key={row.id + row.type} style={{ background: i % 2 === 0 ? "white" : "#f9fafb" }}>
                      <td style={s.td}>
                        <span style={{
                          ...s.badge,
                          background: row.type === "sub_recipe" ? "#ede9fe" : "#dcfce7",
                          color: row.type === "sub_recipe" ? "#6d28d9" : "#166534",
                        }}>
                          {row.type === "sub_recipe" ? "🥣 Sub Recipe" : "🍽️ Product"}
                        </span>
                        {row.is_spoiled && (
                          <span style={{ ...s.badge, background: "#fee2e2", color: "#991b1b", marginLeft: 4 }}>Spoiled</span>
                        )}
                      </td>
                      <td style={{ ...s.td, fontWeight: 600 }}>{row.name}</td>
                      <td style={{ ...s.td, fontFamily: "monospace", textAlign: "right" }}>
                        {fmt(row.quantity)} {row.unit}
                      </td>
                      <td style={{ ...s.td, fontSize: 12, color: "#6b7280" }}>{fmtDate(row.produced_at)}</td>
                      <td style={{ ...s.td, color: "#6b7280" }}>{row.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
  header: { marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 800, color: "#111", margin: 0 },
  subtitle: { fontSize: 13, color: "#6b7280", marginTop: 4 },
  tabRow: { display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" },
  tabBtn: { height: 36, padding: "0 14px", border: "1px solid #e5e7eb", borderRadius: 20, fontSize: 13, cursor: "pointer" },
  statsRow: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 },
  statCard: { background: "white", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 },
  card: { background: "white", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, marginBottom: 16 },
  cardTitle: { fontSize: 15, fontWeight: 700, color: "#111", margin: "0 0 16px" },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 12, fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: "0.4px" },
  input: { height: 40, padding: "0 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, color: "#111", background: "#fafafa", width: "100%", boxSizing: "border-box", outline: "none" },
  previewBox: { background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 14, marginBottom: 16 },
  previewTitle: { fontSize: 12, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 10 },
  previewRow: { display: "flex", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f3f4f6", flexWrap: "wrap", gap: 4 },
  btnRow: { display: "flex", justifyContent: "flex-end", marginTop: 8 },
  primaryBtn: { height: 44, padding: "0 20px", background: "hsl(var(--primary))", color: "white", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { padding: "10px 12px", background: "#f3f4f6", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" },
  td: { padding: "10px 12px", borderBottom: "1px solid #f3f4f6", color: "#111" },
  badge: { display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" },
  spoilBtn: { background: "#fee2e2", color: "#991b1b", border: "none", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" },
  emptyState: { textAlign: "center", padding: "40px 0", color: "#9ca3af", fontSize: 14 },
  linkBtn: { background: "none", border: "none", color: "#111", fontWeight: 700, cursor: "pointer", textDecoration: "underline", fontSize: 14 },
  errorBanner: { background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 12 },
  successBanner: { background: "#dcfce7", color: "#166534", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 12 },
  optRow: { display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" },
  deleteBtn: { background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 14, fontWeight: 700, marginLeft: "auto" },
}
