import { supabase } from "@/lib/supabase"
import { OrderStatus } from "@/types/pos"
import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import type { MenuItem, Order, POSSettings, OrderItem, Ingredient, SubRecipe, Recipe, RecipeItem } from "@/types/pos"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import QRCode from "react-qr-code"
import Settings from "@/components/Settings"
import Layout from "@/components/Layout"
import MenuGrid from "@/components/pos/MenuGrid"
import CartPanel from "@/components/pos/CartPanel"
import TableSelector from "@/components/pos/TableSelector"
import OrderBoard from "@/components/pos/OrderBoard"
import { useAuth } from "@/contexts/AuthContext"
import { useCart } from "@/hooks/useCart"
import { useOrders } from "@/hooks/useOrders"
import { useMenu } from "@/hooks/useMenu"
import { usePOSConfig } from "@/hooks/usePOSConfig"
import { printReceipt } from "@/utils/printReceipt"
import { printKOT } from "@/utils/printKOT"
import { expandRecipe, updateStock } from "@/services/inventoryService"

const OUTLET_ID = "demo-outlet"

type View =
  | "menu"
  | "orders"
  | "history"
  | "recipes"
  | "procurement"
  | "analytics"
  | "menu_manage"
  | "settings"
  | "ingredients"
  | "subrecipes"
  | "reports"
  | "loyalty"

type PaymentMethod = "CASH" | "CARD" | "UPI"

export default function Index() {
  const [view, setView] = useState<View>("menu")
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const { profile, user } = useAuth()

  // ── Hooks ──────────────────────────────────────────────────────
  const {
    cart, setCart, paymentMethod, setPaymentMethod,
    subtotal, gst, grandTotal,
    addToCart, increaseQty, decreaseQty, clearCart, splitItemsByStation,
  } = useCart()

  const {
    orders, setOrders, isPlacingOrder, setIsPlacingOrder,
    qrOrderId, setQrOrderId, alertedOrdersRef,
    placedOrders, preparingOrders, readyOrders, collectedOrders,
    fetchOrders, subscribeToOrders,
    startPreparing, markReady, collectOrder, updatePayment,
    getOrderTime, getOrderColor,
  } = useOrders()

  const {
    menuItems, setMenuItems, categories, setCategories,
    mostOrdered, filteredMenu,
    newItemName, setNewItemName, newItemPrice, setNewItemPrice,
    newItemCategory, setNewItemCategory, newItemIsVeg, setNewItemIsVeg,
    newCategoryName, setNewCategoryName,
    activeCategory, setActiveCategory,
    manageCategory, setManageCategory,
    manageTab, setManageTab,
    searchQuery, setSearchQuery,
    vegFilter, setVegFilter,
    fetchMenu, fetchCategories, fetchMostOrdered,
    addMenuItem, addCategory, deleteCategory, deleteMenuItem, toggleAvailability,
  } = useMenu()

  const {
    mode: posMode, setMode: setPosMode,
    features, selectedTable, setSelectedTable,
    orderType, setOrderType, orderNotes, setOrderNotes,
    tables, resetTableState,
  } = usePOSConfig()

  // ── Settings (kept local for now) ─────────────────────────────
  const [settings, setSettings] = useState<POSSettings>({
    kdsEnabled: true,
    delayAlertMinutes: 10,
    soundAlert: true,
    autoSortOrders: true,
    customerDisplayEnabled: false,
    posMode: "SELF_SERVICE",
    printers: [{ id: "main", name: "Main Printer", role: "BOTH" }],
  })

  // Sync posMode from settings toggle
  useEffect(() => {
    setPosMode(settings.posMode as "SELF_SERVICE" | "TABLE_SERVICE")
  }, [settings.posMode, setPosMode])

  // ── Legacy state (complex features not yet extracted) ──────────
  const [sizeSelectorItem, setSizeSelectorItem] = useState<MenuItem | null>(null)
  const [selectedAddons, setSelectedAddons] = useState<{ name: string; price: number }[]>([])
  const [selectedSize, setSelectedSize] = useState<{ label: string; price: number } | null>(null)
  const addons = sizeSelectorItem?.addons ?? []
  const [, setTick] = useState(0)
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [newIngredientName, setNewIngredientName] = useState("")
  const [newIngredientUnit, setNewIngredientUnit] = useState("")
  const [subRecipes, setSubRecipes] = useState<SubRecipe[]>([])
  const [newSubRecipe, setNewSubRecipe] = useState("")
  const [selectedSubRecipe, setSelectedSubRecipe] = useState<SubRecipe | null>(null)
  const [selectedIngredient, setSelectedIngredient] = useState("")
  const [quantity, setQuantity] = useState("")
  const [subRecipeItems, setSubRecipeItems] = useState<any[]>([])
  const [yieldPercent, setYieldPercent] = useState("100")
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null)
  const [recipeItems, setRecipeItems] = useState<RecipeItem[]>([])
  const [selectedMenuItem, setSelectedMenuItem] = useState("")
  const [selectedSubRecipeForRecipe, setSelectedSubRecipeForRecipe] = useState("")
  const [selectedIngredientForRecipe, setSelectedIngredientForRecipe] = useState("")
  const [recipeQty, setRecipeQty] = useState("")
  const [suggestions, setSuggestions] = useState<string[]>([])

  // ── Analytics (computed) ───────────────────────────────────────
  const salesData = useMemo(() => {
    const itemSales: Record<string, number> = {}
    orders.forEach(order => {
      if (!order.items) return
      order.items.forEach((item: OrderItem) => {
        itemSales[item.name] = (itemSales[item.name] || 0) + item.quantity
      })
    })
    return Object.entries(itemSales).map(([name, qty]) => ({ name, sales: qty }))
  }, [orders])

  const paymentData = useMemo(() => {
    const totals = { CASH: 0, CARD: 0, UPI: 0 }
    orders.forEach(order => {
      totals[order.payment_method as keyof typeof totals] += order.total
    })
    return [
      { name: "Cash", value: totals.CASH },
      { name: "Card", value: totals.CARD },
      { name: "UPI", value: totals.UPI },
    ]
  }, [orders])

  // ── Helpers ────────────────────────────────────────────────────
  const totalPrice = useMemo(() => {
    const base = selectedSize?.price ?? 0
    const addonTotal = selectedAddons.reduce((s, a) => s + a.price, 0)
    return base + addonTotal
  }, [selectedSize, selectedAddons])

  const checkOrderDelay = useCallback((order: Order) => {
    if (order.status !== OrderStatus.PLACED) return
    const mins = (Date.now() - new Date(order.created_at).getTime()) / 60000
    if (mins > settings.delayAlertMinutes && !alertedOrdersRef.current.has(order.id)) {
      alertedOrdersRef.current.add(order.id)
      if (settings.soundAlert && audioRef.current) {
        audioRef.current.play().catch(() => {})
      }
    }
  }, [settings.delayAlertMinutes, settings.soundAlert, alertedOrdersRef])

  // ── Place order ────────────────────────────────────────────────
  const placeOrder = async () => {
    if (cart.length === 0) { alert("Cart empty"); return }
    if (isPlacingOrder) return
    if (posMode === "TABLE_SERVICE" && !selectedTable) {
      alert("Please select a table first")
      return
    }
    setIsPlacingOrder(true)

    const payload = {
      outlet_id: OUTLET_ID,
      token_no: orders.length + 101,
      items: cart,
      subtotal,
      gst,
      total: grandTotal,
      status: OrderStatus.PLACED,
      payment_method: paymentMethod,
      loyalty_points_earned: Math.floor(grandTotal / 100),
      loyalty_points_used: 0,
      created_at: new Date().toISOString(),
      ...(selectedTable ? { table_id: selectedTable } : {}),
      ...(orderType ? { order_type: orderType } : {}),
      ...(orderNotes ? { notes: orderNotes } : {}),
    }

    const { data, error } = await supabase
      .from("orders")
      .insert(payload)
      .select()
      .single()

    if (error) {
      alert(error.message)
      setIsPlacingOrder(false)
      return
    }

    // Insert order items
    const orderItemsPayload = cart.map(item => ({
      order_id: data.id,
      outlet_id: OUTLET_ID,
      item_id: item.id,
      quantity: item.quantity,
    }))
    await supabase.from("order_items").insert(orderItemsPayload)

    // Print KOT per station
    const stationMap = splitItemsByStation(cart)
    Object.entries(stationMap).forEach(([station, items]) => {
      printKOT({ order: data, items, station })
    })

    // Deduct stock
    for (const item of cart) {
      const { data: recipe } = await supabase
        .from("recipes")
        .select("*")
        .eq("menu_item_id", item.baseId || item.id)
        .single()
      if (!recipe) continue
      const ingredientsList = await expandRecipe(recipe.id)
      const finalList = ingredientsList.map(i => ({ ...i, quantity: i.quantity * item.quantity }))
      for (const ing of finalList) {
        await updateStock(ing.ingredient_id, ing.quantity)
      }
    }

    printReceipt(data)
    setQrOrderId(data.id)
    setView("orders")
    clearCart()
    resetTableState()
    setIsPlacingOrder(false)
    fetchMostOrdered()
  }

  // ── Data fetching ──────────────────────────────────────────────
  useEffect(() => { fetchOrders() }, [fetchOrders])
  useEffect(() => { fetchMenu() }, [fetchMenu])
  useEffect(() => { fetchCategories() }, [fetchCategories])
  useEffect(() => { if (user) { fetchCategories(); fetchMenu() } }, [user])

  useEffect(() => {
    const unsub = subscribeToOrders()
    return () => { unsub?.() }
  }, [subscribeToOrders])

  useEffect(() => {
    const interval = setInterval(() => setTick((t: number) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (categories.length > 0 && !manageCategory) setManageCategory(categories[0].id)
  }, [categories])

  useEffect(() => {
    if (categories.length > 0 && !activeCategory) setActiveCategory("all")
  }, [categories])

  // ── Legacy functions (not yet moved to services) ───────────────
  const addIngredient = async () => {
    if (!newIngredientName || !newIngredientUnit) return
    const { data } = await supabase
      .from("ingredients")
      .insert({ name: newIngredientName, unit: newIngredientUnit })
      .select()
      .single()
    if (data) { setIngredients(prev => [...prev, data]); setNewIngredientName(""); setNewIngredientUnit("") }
  }

  const addSubRecipeItem = async () => {
    if (!selectedSubRecipe || !selectedIngredient || !quantity) return
    const qty = Number(quantity)
    const { data } = await supabase
      .from("sub_recipe_items")
      .insert({ sub_recipe_id: selectedSubRecipe.id, ingredient_id: selectedIngredient, quantity: qty, yield_percent: Number(yieldPercent) })
      .select()
      .single()
    if (data) { setSubRecipeItems(prev => [...prev, data]); setQuantity("") }
  }

  const addRecipe = async () => {
    if (!selectedMenuItem) return
    const { data } = await supabase
      .from("recipes")
      .insert({ menu_item_id: selectedMenuItem, name: menuItems.find(m => m.id === selectedMenuItem)?.name || "Recipe" })
      .select()
      .single()
    if (data) setRecipes(prev => [...prev, data])
  }

  const addSubRecipe = async () => {
    if (!newSubRecipe.trim()) return
    const { data } = await supabase
      .from("sub_recipes")
      .insert({ name: newSubRecipe.trim() })
      .select()
      .single()
    if (data) {
      setSubRecipes(prev => [...prev, data])
      setNewSubRecipe("")
    }
  }

  const addRecipeItem = async () => {
    if (!selectedRecipe || !recipeQty) return
    const { data } = await supabase
      .from("recipe_items")
      .insert({ recipe_id: selectedRecipe.id, ingredient_id: selectedIngredientForRecipe || null, sub_recipe_id: selectedSubRecipeForRecipe || null, quantity: Number(recipeQty), yield_percent: 100 })
      .select()
      .single()
    if (data) { setRecipeItems(prev => [...prev, data]); setRecipeQty("") }
  }

  const generatePurchaseOrder = async () => {
    const { data } = await supabase.from("ingredients").select("*")
    if (!data) return
    const low = data.filter(i => i.current_stock < i.min_stock)
    if (!low.length) { alert("No items needed"); return }
    for (const ing of low) {
      const qty = (ing.min_stock - ing.current_stock) * 2
      const { data: vendor } = await supabase.from("ingredient_prices").select("*").eq("ingredient_id", ing.id).order("price_per_unit", { ascending: true }).limit(1).single()
      if (!vendor) continue
      const { data: po } = await supabase.from("purchase_orders").insert({ vendor_name: vendor.vendor_name, status: "PENDING" }).select().single()
      if (!po) continue
      await supabase.from("purchase_order_items").insert([{ purchase_order_id: po.id, ingredient_id: ing.id, quantity: qty, price: vendor.price_per_unit }])
    }
    alert("Purchase Orders Generated")
  }

  const getSmartSuggestions = async () => {
    const result: string[] = []
    for (const item of menuItems) {
      const sales = orders.reduce((sum, o) => sum + (o.items?.filter(i => i.name === item.name).reduce((s, i) => s + i.quantity, 0) ?? 0), 0)
      if (sales === 0) result.push(`❌ Consider removing ${item.name} — no sales`)
      else if (sales > 20) result.push(`🔥 ${item.name} is a top seller!`)
    }
    setSuggestions(result)
  }



  // ── Render ─────────────────────────────────────────────────────
  const viewStyles: Record<string, React.CSSProperties> = {
    page: { maxWidth: 800, margin: "0 auto" },
    header: { marginBottom: 24 },
    title: { fontSize: 24, fontWeight: 800, color: "#111", margin: 0 },
    subtitle: { color: "#6b7280", fontSize: 14, margin: "4px 0 0" },
    card: { background: "white", borderRadius: 16, padding: "20px 24px", marginBottom: 16, border: "1px solid #e5e7eb" },
    cardTitle: { fontSize: 16, fontWeight: 700, color: "#111", margin: "0 0 6px" },
    cardDesc: { fontSize: 13, color: "#6b7280", margin: "0 0 16px" },
    formRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 },
    formField: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 },
    label: { fontSize: 13, fontWeight: 600, color: "#374151" },
    input: { padding: "10px 14px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 14, outline: "none", color: "#111", background: "white" },
    primaryBtn: { background: "#111", color: "white", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer", width: "100%" },
    statCard: { background: "#f9f7f4", borderRadius: 12, padding: "16px", textAlign: "center" },
  }

  return (
    <>
    <Layout
      view={view}
      setView={(v) => setView(v as View)}
      todayOrderCount={orders.length}
    />

    <main style={{
      marginTop: 56,
      minHeight: "calc(100vh - 56px)",
      padding: "24px 16px",
      maxWidth: 1200,
      marginLeft: "auto",
      marginRight: "auto",
    }}>

      {/* ── MENU VIEW ──────────────────────────────────────────── */}
      {view === "menu" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 0, height: "calc(100vh - 80px)" }}>

          {features.tables && (
            <TableSelector
              tables={tables as any}
              selectedTable={selectedTable}
              setSelectedTable={setSelectedTable}
            />
          )}

          {features.tokenSystem && (
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: "#16a34a", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>🎟️</span>
              Token will be generated automatically after order is placed
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16, flex: 1, minHeight: 0 }}>
            <MenuGrid
              menuItems={menuItems}
              categories={categories}
              mostOrdered={mostOrdered}
              cart={cart}
              activeCategory={activeCategory}
              setActiveCategory={setActiveCategory}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              vegFilter={vegFilter}
              setVegFilter={setVegFilter}
              addToCart={addToCart}
              increaseQty={increaseQty}
              decreaseQty={decreaseQty}
              toggleAvailability={toggleAvailability}
            />

            <CartPanel
              cart={cart}
              subtotal={subtotal}
              gst={gst}
              grandTotal={grandTotal}
              paymentMethod={paymentMethod}
              setPaymentMethod={setPaymentMethod}
              increaseQty={increaseQty}
              decreaseQty={decreaseQty}
              isPlacingOrder={isPlacingOrder}
              onPlaceOrder={placeOrder}
              posMode={posMode}
              selectedTable={selectedTable}
              orderType={orderType}
              setOrderType={setOrderType}
              orderNotes={orderNotes}
              setOrderNotes={setOrderNotes}
            />
          </div>
        </div>
      )}

      {/* ── ORDERS VIEW ────────────────────────────────────────── */}
      {view === "orders" && (
        <OrderBoard
          placedOrders={placedOrders}
          preparingOrders={preparingOrders}
          readyOrders={readyOrders}
          collectedOrders={collectedOrders}
          settings={settings}
          getOrderTime={getOrderTime}
          getOrderColor={getOrderColor}
          startPreparing={startPreparing}
          markReady={markReady}
          collectOrder={collectOrder}
          updatePayment={updatePayment}
        />
      )}

      {/* ── HISTORY VIEW ───────────────────────────────────────── */}
      {view === "history" && (
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Order History</h2>
          {orders.length === 0 ? (
            <p style={{ color: "#9ca3af", textAlign: "center", padding: "40px 0" }}>No orders yet</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[...orders].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(order => (
                <div key={order.id} style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontWeight: 800, fontSize: 16, minWidth: 40 }}>#{order.token_no}</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, margin: 0, color: "#374151" }}>{order.items?.map((i: OrderItem) => `${i.name} ×${i.quantity}`).join(", ")}</p>
                    <p style={{ fontSize: 11, color: "#9ca3af", margin: "2px 0 0" }}>{new Date(order.created_at).toLocaleString("en-IN")}</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontWeight: 700, color: "#f97316", margin: 0 }}>₹{order.total}</p>
                    <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>{order.payment_method} · {order.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MENU MANAGEMENT VIEW ───────────────────────────────── */}
      {view === "menu_manage" && (
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111", margin: 0 }}>Menu Management</h2>
            <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>Manage your categories and menu items</p>
          </div>

          <div style={{ display: "flex", gap: 0, background: "#f3f4f6", borderRadius: 10, padding: 4, marginBottom: 24, width: "fit-content" }}>
            {(["categories", "items"] as const).map(tab => (
              <button key={tab} onClick={() => setManageTab(tab)} style={{ padding: "8px 24px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, background: manageTab === tab ? "white" : "transparent", color: manageTab === tab ? "#111" : "#6b7280", boxShadow: manageTab === tab ? "0 1px 4px rgba(0,0,0,0.08)" : "none", transition: "all .15s" }}>
                {tab === "categories" ? "🏷️ Categories" : "🍽️ Menu Items"}
              </button>
            ))}
          </div>

          {manageTab === "categories" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: "20px 24px" }}>
                <h3 style={{ fontWeight: 700, fontSize: 15, margin: "0 0 16px" }}>➕ Add New Category</h3>
                <input placeholder="e.g. Steam Momos, Drinks..." value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} onKeyDown={e => e.key === "Enter" && addCategory()} style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 14, outline: "none", marginBottom: 12 }} />
                <button onClick={addCategory} style={{ width: "100%", padding: "10px", background: "#111", color: "white", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Add Category</button>
              </div>
              <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: "20px 24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h3 style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>Your Categories</h3>
                  <span style={{ fontSize: 12, color: "#6b7280", background: "#f3f4f6", padding: "2px 8px", borderRadius: 20 }}>{categories.length} total</span>
                </div>
                {categories.length === 0 ? (
                  <p style={{ color: "#9ca3af", textAlign: "center", padding: "20px 0", fontSize: 13 }}>No categories yet</p>
                ) : categories.map(cat => (
                  <div key={cat.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#f9f9f9", borderRadius: 8, marginBottom: 8 }}>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: 14, margin: 0 }}>{cat.name}</p>
                      <p style={{ fontSize: 11, color: "#9ca3af", margin: 0 }}>{menuItems.filter(i => i.category_id === cat.id).length} items</p>
                    </div>
                    <button onClick={() => deleteCategory(cat.id)} style={{ padding: "5px 12px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>Delete</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {manageTab === "items" && (
            <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 20 }}>
              <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: "20px 24px", height: "fit-content" }}>
                <h3 style={{ fontWeight: 700, fontSize: 15, margin: "0 0 16px" }}>➕ Add New Item</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div><label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Item Name *</label><input placeholder="e.g. Steam Chicken Momos" value={newItemName} onChange={e => setNewItemName(e.target.value)} style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 14, outline: "none" }} /></div>
                  <div><label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Price (₹) *</label><input type="number" placeholder="120" value={newItemPrice} onChange={e => setNewItemPrice(e.target.value)} style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 14, outline: "none" }} /></div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Category *</label>
                    <select value={newItemCategory} onChange={e => setNewItemCategory(e.target.value)} style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 14, outline: "none", background: "white" }}>
                      <option value="">Select a category</option>
                      {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {([true, false] as const).map(isVeg => (
                      <button key={String(isVeg)} onClick={() => setNewItemIsVeg(isVeg)} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1.5px solid", borderColor: newItemIsVeg === isVeg ? (isVeg ? "#16a34a" : "#dc2626") : "#e5e7eb", background: newItemIsVeg === isVeg ? (isVeg ? "#f0fdf4" : "#fef2f2") : "white", color: newItemIsVeg === isVeg ? (isVeg ? "#16a34a" : "#dc2626") : "#374151", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
                        {isVeg ? "🟢 Veg" : "🔴 Non-veg"}
                      </button>
                    ))}
                  </div>
                  <button onClick={addMenuItem} disabled={!newItemName || !newItemPrice || !newItemCategory} style={{ padding: "11px", background: (!newItemName || !newItemPrice || !newItemCategory) ? "#e5e7eb" : "#111", color: (!newItemName || !newItemPrice || !newItemCategory) ? "#9ca3af" : "white", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: (!newItemName || !newItemPrice || !newItemCategory) ? "not-allowed" : "pointer" }}>Add to Menu</button>
                </div>
              </div>
              <div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                  <button onClick={() => setManageCategory(null)} style={{ padding: "5px 14px", borderRadius: 20, border: "1.5px solid", fontSize: 12, fontWeight: 600, cursor: "pointer", borderColor: manageCategory === null ? "#111" : "#e5e7eb", background: manageCategory === null ? "#111" : "white", color: manageCategory === null ? "white" : "#374151" }}>All ({menuItems.length})</button>
                  {categories.map(cat => (
                    <button key={cat.id} onClick={() => setManageCategory(cat.id)} style={{ padding: "5px 14px", borderRadius: 20, border: "1.5px solid", fontSize: 12, fontWeight: 600, cursor: "pointer", borderColor: manageCategory === cat.id ? "#111" : "#e5e7eb", background: manageCategory === cat.id ? "#111" : "white", color: manageCategory === cat.id ? "white" : "#374151" }}>{cat.name} ({menuItems.filter(i => i.category_id === cat.id).length})</button>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                  {(manageCategory ? menuItems.filter(i => i.category_id === manageCategory) : menuItems).map(item => (
                    <div key={item.id} style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: item.is_veg ? "#16a34a" : "#dc2626", flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 700, fontSize: 13, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</p>
                        <p style={{ fontSize: 12, color: "#6b7280", margin: "2px 0 0" }}>₹{item.price} · {categories.find(c => c.id === item.category_id)?.name || "—"}</p>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                        <button onClick={() => toggleAvailability(item.id, item.available)} style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid", fontSize: 11, cursor: "pointer", fontWeight: 600, borderColor: item.available ? "#bbf7d0" : "#fecaca", background: item.available ? "#f0fdf4" : "#fef2f2", color: item.available ? "#16a34a" : "#dc2626" }}>{item.available ? "Available" : "Out of stock"}</button>
                        <button onClick={() => deleteMenuItem(item.id)} style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid #fecaca", background: "#fef2f2", color: "#dc2626", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {view === "settings" && (
        <Settings
          settings={settings}
          setSettings={setSettings}
        />
      )}

      {sizeSelectorItem && (

        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">

          <div
            className="bg-white rounded-xl p-6 w-80"
            onClick={(e) => e.stopPropagation()}
          >

            <h3 className="text-lg font-bold mb-4">
              {sizeSelectorItem.name}
            </h3>

            <div className="space-y-3">

              {/* SIZE OPTIONS */}

              {sizeSelectorItem.sizes?.map(size => (

                <button
                  key={size.label}
                  onClick={() => setSelectedSize(size)}
                  className={`w-full border rounded-lg p-3 flex justify-between ${
                    selectedSize?.label === size.label
                      ? "bg-black text-white"
                      : ""
                  }`}
                >

                  <span>{size.label}</span>
                  <span>₹{size.price}</span>

                </button>

              ))}

              {/* ADDONS */}

              {sizeSelectorItem?.addons?.map(addon => {

                const selected = selectedAddons.find(a => a.name === addon.name)

                return (

                  <label
                    key={addon.name}
                    className="flex justify-between items-center border rounded p-2"
                  >

                    <span>{addon.name}</span>

                    <input
                      type="checkbox"
                      checked={!!selected}
                      onChange={() => {

                        if (selected) {
                          setSelectedAddons(prev =>
                            prev.filter(a => a.name !== addon.name)
                          )
                        } else {
                          setSelectedAddons(prev => [...prev, addon])
                        }

                      }}
                    />

                  </label>

                )

              })}

            </div>

            {/* STEP 5 */}

            <div className="mt-4 border-t pt-3 flex justify-between font-bold">

              <span>Total</span>

              <span>₹{totalPrice}</span>

            </div>

            {/* STEP 6 */}

            <button
              disabled={!selectedSize}
              onClick={() => {

                if (!sizeSelectorItem || !selectedSize) return

                addToCart(sizeSelectorItem, selectedSize, selectedAddons)

                setSizeSelectorItem(null)

              }}
              className="w-full mt-4 bg-black text-white py-3 rounded-lg font-semibold disabled:bg-gray-400"
            >

              Add to Cart

            </button>

          </div>

        </div>

      )}

      {view === "ingredients" && (
        <div>
          <h2>Ingredients</h2>

          <input
            placeholder="Ingredient name"
            value={newIngredientName}
            onChange={(e) => setNewIngredientName(e.target.value)}
          />

          <input
            placeholder="Unit (g/ml/pcs)"
            value={newIngredientUnit}
            onChange={(e) => setNewIngredientUnit(e.target.value)}
          />

          <button onClick={addIngredient}>Add</button>

          {ingredients.map(i => (
            <div key={i.id}>
              {i.name} ({i.unit}) — Stock: {i.current_stock}
            </div>
          ))}
        </div>
      )}

      {view === "procurement" && (
        <div>
          <h2>Procurement</h2>

          <button onClick={generatePurchaseOrder}>
            Generate Purchase Orders
          </button>
        </div>
      )}

      {view === "analytics" && (
        <div>

          <h2>Analytics Dashboard</h2>

          <div className="grid grid-cols-3 gap-6">

            {/* PROFIT */}
            <div className="border p-4">
              <h3>Profit Insights</h3>
            </div>

            {/* WASTAGE */}
            <div className="border p-4">
              <h3>Wastage</h3>
            </div>

            {/* SALES */}
            <div className="border p-4">
              <h3>Top Selling</h3>
            </div>

          </div>

          {/* ✅ ADD HERE (IMPORTANT) */}
          <div className="mt-6">

            <h3>Smart Suggestions</h3>

            {suggestions.map((s, i) => (
              <div key={i}>{s}</div>
            ))}

          </div>

        </div>
      )}

      {view === "subrecipes" && (
        <div>

          {/* CREATE SUB RECIPE */}
          <h2>Sub Recipes</h2>

          <div className="flex gap-2 mb-4">
            <input
              placeholder="Sub recipe name"
              value={newSubRecipe}
              onChange={(e) => setNewSubRecipe(e.target.value)}
            />

            <button onClick={addSubRecipe}>Add</button>
          </div>

          <div className="grid grid-cols-2 gap-6">

            {/* LEFT: SUB RECIPE LIST */}
            <div>
              {subRecipes.map(sr => (
                <div
                  key={sr.id}
                  onClick={() => setSelectedSubRecipe(sr)}
                  className={`p-2 cursor-pointer border mb-2 ${
                    selectedSubRecipe?.id === sr.id
                      ? "bg-black text-white"
                      : ""
                  }`}
                >
                  {sr.name}
                </div>
              ))}
            </div>

            {/* RIGHT: BUILDER */}
            <div>

              <h3>
                {selectedSubRecipe
                  ? selectedSubRecipe.name
                  : "Select Sub Recipe"}
              </h3>

              {selectedSubRecipe && (
                <>
                  {/* ADD INGREDIENT */}
                  <div className="flex gap-2 mb-4">

                    <select
                      value={selectedIngredient}
                      onChange={(e) => setSelectedIngredient(e.target.value)}
                    >
                      <option value="">Ingredient</option>
                      {ingredients.map(i => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>

                    <input
                      placeholder="Qty"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                    />

                    <input
                      placeholder="Yield %"
                      value={yieldPercent}
                      onChange={(e) => setYieldPercent(e.target.value)}
                    />

                    <button onClick={addSubRecipeItem}>
                      Add
                    </button>

                  </div>

                  {/* LIST */}
                  {subRecipeItems.map(item => {
                    const ing = ingredients.find(i => i.id === item.ingredient_id)

                    const usableQty =
                      item.quantity * ((item.yield_percent || 100) / 100)

                    return (
                      <div key={item.id} className="border p-2 mb-2 rounded">

                        <div className="font-semibold">{ing?.name}</div>

                        <div className="text-sm">
                          Input: {item.quantity}
                        </div>

                        <div className="text-sm">
                          Yield: {item.yield_percent || 100}%
                        </div>

                        <div className="text-sm text-green-600">
                          Usable: {usableQty.toFixed(2)}
                        </div>

                        <div className="text-sm text-red-500">
                          Wastage: {item.wastage?.toFixed(2)}
                        </div>

                      </div>
                    )
                  })}

                </>
              )}

            </div>
          </div>
        </div>
      )}

      {view === "recipes" && (
        <div className="grid grid-cols-2 gap-6">

          {/* LEFT: MENU ITEMS */}
          <div>
            <h3>Select Menu Item</h3>

            {menuItems.map(item => (
              <div
                key={item.id}
                onClick={() => setSelectedMenuItem(item.id)}
                className="p-2 border mb-2 cursor-pointer"
              >
                {item.name}
              </div>
            ))}

            <button onClick={addRecipe}>Create Recipe</button>

            <h3 className="mt-4">Recipes</h3>

            {recipes.map(r => (
              <div
                key={r.id}
                onClick={() => setSelectedRecipe(r)}
                className="p-2 border mb-2 cursor-pointer"
              >
                {r.name}
              </div>
            ))}
          </div>

          {/* RIGHT: BUILDER */}
          <div>

            <h3>
              {selectedRecipe ? "Build Recipe" : "Select Recipe"}
            </h3>

            {selectedRecipe && (
              <>
                <div className="flex gap-2 mb-4">

                  {/* INGREDIENT */}
                  <select
                    value={selectedIngredientForRecipe}
                    onChange={(e) => {
                      setSelectedIngredientForRecipe(e.target.value)
                      setSelectedSubRecipeForRecipe("")
                    }}
                  >
                    <option value="">Ingredient</option>
                    {ingredients.map(i => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>

                  {/* SUB RECIPE */}
                  <select
                    value={selectedSubRecipeForRecipe}
                    onChange={(e) => {
                      setSelectedSubRecipeForRecipe(e.target.value)
                      setSelectedIngredientForRecipe("")
                    }}
                  >
                    <option value="">Sub Recipe</option>
                    {subRecipes.map(sr => (
                      <option key={sr.id} value={sr.id}>
                        {sr.name}
                      </option>
                    ))}
                  </select>

                  <input
                    placeholder="Qty"
                    value={recipeQty}
                    onChange={(e) => setRecipeQty(e.target.value)}
                  />

                  <button onClick={addRecipeItem}>
                    Add
                  </button>

                </div>

                {/* LIST */}
                {recipeItems.map(item => {
                  const ing = ingredients.find(i => i.id === item.ingredient_id)
                  const sr = subRecipes.find(s => s.id === item.sub_recipe_id)

                  return (
                    <div key={item.id} className="border p-2 mb-2">
                      {ing?.name || sr?.name} — {item.quantity}
                    </div>
                  )
                })}

              </>
            )}
          </div>
        </div>
      )}


      {/* LOYALTY VIEW */}
      {view === "loyalty" && (
        <div style={viewStyles.page}>
          <div style={viewStyles.header}>
            <h2 style={viewStyles.title}>Loyalty Points</h2>
            <p style={viewStyles.subtitle}>Manage your customer loyalty program</p>
          </div>
          <div style={viewStyles.card}>
            <h3 style={viewStyles.cardTitle}>🔗 Customer Loyalty QR</h3>
            <p style={viewStyles.cardDesc}>Customers scan this to join your loyalty program and check their points</p>
            <div style={{ display: "flex", justifyContent: "center", margin: "20px 0" }}>
              <QRCode value={`${window.location.origin}/loyalty/${OUTLET_ID}`} size={160} />
            </div>
            <p style={{ textAlign: "center", fontSize: 13, color: "#6b7280" }}>Print and place this at your counter</p>
          </div>
          <div style={viewStyles.card}>
            <h3 style={viewStyles.cardTitle}>⚙️ Points Settings</h3>
            <div style={viewStyles.formRow}>
              <div style={viewStyles.formField}>
                <label style={viewStyles.label}>Points per ₹100 spent</label>
                <input type="number" defaultValue={10} style={viewStyles.input} placeholder="e.g. 10" />
              </div>
              <div style={viewStyles.formField}>
                <label style={viewStyles.label}>₹ value per point</label>
                <input type="number" defaultValue={0.5} step={0.1} style={viewStyles.input} placeholder="e.g. 0.5" />
              </div>
            </div>
            <div style={viewStyles.formField}>
              <label style={viewStyles.label}>Minimum points to redeem</label>
              <input type="number" defaultValue={100} style={viewStyles.input} placeholder="e.g. 100" />
            </div>
            <button style={viewStyles.primaryBtn}>Save Settings</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
            {[
              { label: "Total customers", value: "—", icon: "👥" },
              { label: "Points issued", value: "—", icon: "⭐" },
              { label: "Points redeemed", value: "—", icon: "🎁" },
            ].map(stat => (
              <div key={stat.label} style={viewStyles.statCard}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{stat.icon}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#111" }}>{stat.value}</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{stat.label}</div>
              </div>
            ))}
          </div>
          <div style={viewStyles.card}>
            <h3 style={viewStyles.cardTitle}>📋 Recent Activity</h3>
            <p style={{ color: "#9ca3af", fontSize: 14, textAlign: "center", padding: "20px 0" }}>
              Customer loyalty activity will appear here once customers start scanning
            </p>
          </div>
        </div>
      )}

      {/* REPORTS VIEW */}
      {view === "reports" && (
        <div style={viewStyles.page}>
          <div style={viewStyles.header}>
            <h2 style={viewStyles.title}>Reports</h2>
            <p style={viewStyles.subtitle}>Export and share your business reports</p>
          </div>
          <div style={viewStyles.card}>
            <h3 style={viewStyles.cardTitle}>📊 Today's Summary</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, margin: "16px 0" }}>
              <div style={viewStyles.statCard}>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#111" }}>
                  {orders.filter(o => new Date(o.created_at).toDateString() === new Date().toDateString()).length}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>Orders today</div>
              </div>
              <div style={viewStyles.statCard}>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#111" }}>
                  ₹{orders.filter(o => new Date(o.created_at).toDateString() === new Date().toDateString()).reduce((sum, o) => sum + o.total, 0).toFixed(0)}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>Revenue today</div>
              </div>
            </div>
          </div>
          <div style={viewStyles.card}>
            <h3 style={viewStyles.cardTitle}>💬 Send to WhatsApp</h3>
            <p style={viewStyles.cardDesc}>Send today's summary directly to your WhatsApp</p>
            <div style={viewStyles.formField}>
              <label style={viewStyles.label}>Your WhatsApp number (with country code)</label>
              <input type="tel" placeholder="e.g. 919876543210" style={viewStyles.input} id="whatsapp-number" />
            </div>
            <button
              style={{ ...viewStyles.primaryBtn, background: "#25d366", marginTop: 8 }}
              onClick={() => {
                const todayOrders = orders.filter(o => new Date(o.created_at).toDateString() === new Date().toDateString())
                const revenue = todayOrders.reduce((sum, o) => sum + o.total, 0)
                const cashRevenue = todayOrders.filter(o => o.payment_method === "CASH").reduce((sum, o) => sum + o.total, 0)
                const upiRevenue = todayOrders.filter(o => o.payment_method === "UPI").reduce((sum, o) => sum + o.total, 0)
                const topItems: Record<string, number> = {}
                todayOrders.forEach(o => o.items?.forEach((i: any) => { topItems[i.name] = (topItems[i.name] || 0) + i.quantity }))
                const top3 = Object.entries(topItems).sort((a,b) => b[1]-a[1]).slice(0,3).map(([n,q]) => `  • ${n}: ${q}`).join("\n")
                const msg = `🌿 *Praang Daily Report*\n📅 ${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}\n\n📦 Total Orders: ${todayOrders.length}\n💰 Revenue: ₹${revenue.toFixed(0)}\n\n💵 Cash: ₹${cashRevenue.toFixed(0)}\n📱 UPI: ₹${upiRevenue.toFixed(0)}\n\n⭐ Top Items:\n${top3 || "  No orders yet"}\n\n_Sent via Praang POS_`
                const phone = (document.getElementById("whatsapp-number") as HTMLInputElement)?.value || ""
                window.open(`https://wa.me/${phone.replace(/\D/g,"")}?text=${encodeURIComponent(msg)}`, "_blank")
              }}
            >📤 Send WhatsApp Report</button>
          </div>
          <div style={viewStyles.card}>
            <h3 style={viewStyles.cardTitle}>📄 Export as PDF</h3>
            <p style={viewStyles.cardDesc}>Download today's order report as PDF</p>
            <button style={{ ...viewStyles.primaryBtn, marginTop: 8 }} onClick={() => window.print()}>🖨️ Print / Save as PDF</button>
          </div>
          <div style={viewStyles.card}>
            <h3 style={viewStyles.cardTitle}>📊 Export as Excel / CSV</h3>
            <p style={viewStyles.cardDesc}>Download order data as CSV (opens in Excel)</p>
            <button
              style={{ ...viewStyles.primaryBtn, background: "#16a34a", marginTop: 8 }}
              onClick={() => {
                const todayOrders = orders.filter(o => new Date(o.created_at).toDateString() === new Date().toDateString())
                const rows = [["Token","Items","Total","Payment","Status","Time"], ...todayOrders.map(o => [o.token_no, o.items?.map((i:any) => `${i.name}x${i.quantity}`).join(" | ") || "", o.total, o.payment_method || "", o.status, new Date(o.created_at).toLocaleTimeString()])]
                const csv = rows.map(r => r.join(",")).join("\n")
                const blob = new Blob([csv], { type: "text/csv" })
                const url = URL.createObjectURL(blob)
                const a = document.createElement("a")
                a.href = url
                a.download = `praang-orders-${new Date().toISOString().split("T")[0]}.csv`
                a.click()
              }}
            >⬇️ Download CSV / Excel</button>
          </div>
        </div>
      )}

      {/* QR MODAL */}
      {qrOrderId && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
          onClick={() => setQrOrderId(null)}
        >
          <div
            style={{
              background: "white",
              padding: 24,
              borderRadius: 12,
              textAlign: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Scan to Track Order</h3>

            <QRCode
              value={`${window.location.origin}/order/${qrOrderId}`}
              size={200}
            />

            <p style={{ marginTop: 10 }}>
            Token #{orders.find(o => o.id === qrOrderId)?.token_no || "-"}
          </p>

            <button
              onClick={() => setQrOrderId(null)}
              style={{ marginTop: 12 }}
            >
              Close
            </button>
          </div>
        </div>
      )}
        <audio
          ref={audioRef}
          src="/notification.mp3"
          preload="auto"
        />
      </main>
    </>  
  );
}