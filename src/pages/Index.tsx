import { supabase } from "@/lib/supabase"
import { OrderStatus } from "@/types/pos"
import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import type { MenuItem, Order, POSSettings, OrderItem, Ingredient, SubRecipe, Recipe, RecipeItem } from "@/types/pos"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import QRCode from "react-qr-code"
import Settings from "@/components/Settings"
import Layout from "@/components/Layout"
import MenuGrid from "@/components/pos/MenuGrid"
import CartPanel, { type PrintMode } from "@/components/pos/CartPanel"
import { BillModal } from "@/components/pos/BillModal"
import TableSelector from "@/components/pos/TableSelector"
import OrderBoard from "@/components/pos/OrderBoard"
import { useAuth } from "@/contexts/AuthContext"
import ConfirmDialog from "@/components/ConfirmDialog"
import { useCart } from "@/hooks/useCart"
import { useOrders } from "@/hooks/useOrders"
import { useMenu } from "@/hooks/useMenu"
import { usePOSConfig } from "@/hooks/usePOSConfig"
import { printKOT } from "@/utils/printKOT"
import { expandRecipe, updateStock } from "@/services/inventoryService"
import { addStamp, redeemStampCard } from "@/services/stampCardService"
import InventoryView from "@/components/inventory/InventoryView"
import ProcurementView from "@/components/procurement/ProcurementView"
import MISView from "@/components/mis/MISView"
import LoyaltyView from "@/components/loyalty/LoyaltyView"
import SubRecipesView from "@/components/subrecipes/SubRecipesView"
import RecipesView from "@/components/recipes/RecipesView"
import ExpensesView from "@/components/expenses/ExpensesView"
import ProductionPage from "@/pages/ProductionPage"
import ExpiryAlarmModal from "@/components/ExpiryAlarmModal"
import BusinessResourcesView from "@/components/resources/BusinessResourcesView"
import ChecklistsView from "@/components/checklists/ChecklistsView"
import PostersView from "@/components/posters/PostersView"
import DishTaggingModal from "@/components/menu/DishTaggingModal"

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
  | "inventory"
  | "expenses"
  | "production"
  | "resources"
  | "checklists"
  | "posters"

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
    startPreparing, markReady, collectOrder, updatePayment, markPaid,
    getOrderTime, getOrderColor,
  } = useOrders()

  const [billOrder, setBillOrder] = useState<any>(null)
  const [showBill, setShowBill] = useState(false)

  const {
    menuItems, setMenuItems, categories, setCategories,
    confirmState, handleConfirm, handleCancel,
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
    tables, resetTableState, updateTableStatus,
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
  const [printMode, setPrintMode] = useState<PrintMode>("KOT+BILL")
  const [sizeSelectorItem, setSizeSelectorItem] = useState<MenuItem | null>(null)
  const [taggingItem, setTaggingItem] = useState<MenuItem | null>(null)
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
  const [mostOrdered, setMostOrdered] = useState<MenuItem[]>([])

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
  const placeOrder = async (opts?: {
    discount?: number; discountType?: string
    cartNotes?: Record<string, string>; orderNotes?: string
    payment?: string; dueAmount?: number
    customerName?: string; customerPhone?: string
    splitPayments?: Record<string, number>
    stampProgramId?: string; applyStampReward?: boolean; stampCardIdToRedeem?: string
  }) => {
    if (cart.length === 0) { alert("Cart empty"); return }
    if (isPlacingOrder) return
    if (posMode === "TABLE_SERVICE" && !selectedTable) {
      alert("Please select a table first")
      return
    }
    setIsPlacingOrder(true)

    const discountAmount = opts?.discount ?? 0
    const finalTotal = Math.max(0, grandTotal - discountAmount)
    const effectivePayment = opts?.payment ?? paymentMethod

    // For SPLIT: encode breakdown as "SPLIT:CASH100+UPI50" so MIS/reports can parse it
    const splitLabel = opts?.splitPayments && Object.keys(opts.splitPayments).length > 0
      ? "SPLIT:" + Object.entries(opts.splitPayments).map(([k, v]) => `${k}${Math.round(v)}`).join("+")
      : null

    const payload = {
      outlet_id: OUTLET_ID,
      items: cart,
      subtotal,
      gst,
      discount: discountAmount,
      total: finalTotal,
      status: OrderStatus.PLACED,
      payment_method: splitLabel ?? effectivePayment,
      notes: opts?.orderNotes || orderNotes || null,
      loyalty_points_earned: Math.floor(finalTotal / 100),
      loyalty_points_used: 0,
      customer_phone: opts?.customerPhone || null,
      customer_name: opts?.customerName || null,
      // order_source/payment_status default to 'pos'/'paid' in the DB — this
      // is the in-store checkout path, payment already happened at the counter.
      // Do NOT include created_at — let Supabase default set it server-side
      ...(selectedTable ? { table_id: selectedTable } : {}),
      ...(orderType ? { order_type: orderType } : {}),
    }

    let data: any = null
    try {
      const { data: orderData, error } = await supabase
        .from("orders")
        .insert(payload)
        .select()
        .single()

      if (error) {
        console.error("Order insert error:", error)
        alert(`Order failed: ${error.message}`)
        setIsPlacingOrder(false)
        return
      }

      // Re-fetch the row so we get token_no generated by the DB trigger
      const { data: freshOrder } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderData.id)
        .single()
      data = freshOrder ?? orderData
    } catch (err: any) {
      console.error("Order insert exception:", err)
      alert("Order failed: " + err.message)
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

    // ── Log credit/due sale
    if (effectivePayment === "DUE") {
      await supabase.from("credit_sales").insert({
        order_id: data.id,
        customer_name: opts?.customerName || "",
        customer_phone: opts?.customerPhone || "",
        due_amount: opts?.dueAmount ?? finalTotal,
        paid_amount: 0,
        status: "pending",
        outlet_id: OUTLET_ID,
      }).then(({ error }) => {
        if (error) console.warn("Credit sale log error:", error.message)
      })
    }

    // ── Auto-earn loyalty points — only when the outlet has this program
    // switched on. Points and stamps are independent toggles now (an outlet
    // can run neither, either, or both), not one always-on legacy behavior.
    const { data: loyaltySettings } = await supabase
      .from("loyalty_settings")
      .select("points_per_100, is_active")
      .eq("outlet_id", OUTLET_ID)
      .maybeSingle()

    const pointsEarned = Math.floor(grandTotal / 100 * (loyaltySettings?.points_per_100 ?? 10))

    // Only log if a customer phone was provided (future: prompt at checkout)
    // For now log with a placeholder — real phone comes from customer QR scan
    if (loyaltySettings?.is_active && pointsEarned > 0) {
      await supabase.from("loyalty_transactions").insert({
        outlet_id: OUTLET_ID,
        customer_phone: opts?.customerPhone || "walk-in",
        type: "earned",
        points: pointsEarned,
        order_id: data.id,
      }).then(({ error }) => {
        if (error) console.warn("Loyalty log error (non-fatal):", error.message)
      })
    }

    // ── Stamp card program — redeem first (if staff confirmed a reward),
    // then add this visit's stamp on the now-fresh card. Both calls hit the
    // atomic add_stamp/redeem_stamp_card RPCs, not a client read-then-write,
    // so two checkouts for the same phone can't race the count.
    if (opts?.stampProgramId && opts?.customerPhone) {
      try {
        if (opts.applyStampReward && opts.stampCardIdToRedeem) {
          const { error: redeemErr } = await redeemStampCard({
            cardId: opts.stampCardIdToRedeem,
            orderId: data.id,
            staffNote: "Redeemed at checkout",
          })
          if (redeemErr) console.warn("Stamp redeem error (non-fatal):", redeemErr)
        }
        await addStamp({
          programId: opts.stampProgramId,
          customerPhone: opts.customerPhone,
          customerName: opts.customerName,
          orderId: data.id,
        })
      } catch (stampErr) {
        console.warn("Stamp card error (non-fatal):", stampErr)
      }
    }

    // Print based on selected mode
    const stationMap = splitItemsByStation(cart)
    if (printMode === "KOT" || printMode === "KOT+BILL") {
      Object.entries(stationMap).forEach(([station, items]) => {
        printKOT({ order: data, items, station })
      })
    }

    // Deduct stock — parallel, non-blocking (don't fail order if recipe missing)
    try {
      await Promise.all(cart.map(async item => {
        const { data: recipe } = await supabase
          .from("recipes")
          .select("*")
          .eq("menu_item_id", item.baseId || item.id)
          .single()
        if (!recipe) return
        const ingredientsList = await expandRecipe(recipe.id)
        await Promise.all(
          ingredientsList.map(i => updateStock(i.ingredient_id, i.quantity * item.quantity))
        )
      }))
    } catch (stockErr) {
      console.warn("Stock deduction error (non-fatal):", stockErr)
    }

    setQrOrderId(data.id)
    clearCart()
    // Mark table as occupied after order placed in table service mode
    if (posMode === "TABLE_SERVICE" && selectedTable) {
      updateTableStatus(selectedTable, "occupied")
    }
    resetTableState()
    setBillOrder(data)
    setShowBill(true)
    setIsPlacingOrder(false)
    fetchMostOrdered()
  }

  // ── Data fetching ──────────────────────────────────────────────
  useEffect(() => { fetchOrders() }, [fetchOrders])
  useEffect(() => { fetchMenu() }, [fetchMenu])
  useEffect(() => { fetchCategories() }, [fetchCategories])
  useEffect(() => { if (user) { fetchCategories(); fetchMenu() } }, [user])

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission()
    }
  }, [])

  useEffect(() => {
    if (!subscribeToOrders) return

    const unsubscribe = subscribeToOrders()

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe()
      }
    }
  }, [])

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

  const addSubRecipe = () => {
    if (!newSubRecipe.trim()) return

    const newItem: SubRecipe = {
      id: Date.now().toString(),
      name: newSubRecipe,
      yield_qty: 1,
      unit: "unit"
    }

    setSubRecipes(prev => [...prev, newItem])
    setNewSubRecipe("")
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

  const fetchMostOrderedItems = useCallback(async () => {
    const { data } = await supabase.from("order_items").select("item_id, quantity").eq("outlet_id", OUTLET_ID)
    if (!data) return
    const counts: Record<string, number> = {}
    data.forEach(row => { counts[row.item_id] = (counts[row.item_id] || 0) + row.quantity })
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => menuItems.find(m => m.id === id)).filter(Boolean) as MenuItem[]
    setMostOrdered(sorted)
  }, [menuItems])

  const filteredMenu = useMemo(() => {
    return menuItems.filter(item => {
      if (!item.available) return false
      if (activeCategory !== "all" && item.category_id !== activeCategory) return false
      if (vegFilter === "veg" && !item.is_veg) return false
      if (vegFilter === "nonveg" && item.is_veg) return false
      if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
      return true
    })
  }, [menuItems, activeCategory, vegFilter, searchQuery])

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
    {/* Responsive POS layout: stack cart below menu on narrow windows */}
    <style>{`
      .pos-grid { display: grid; grid-template-columns: minmax(0,1fr) minmax(260px,320px); gap: 16px; flex: 1; min-height: 0; }
      @media (max-width: 760px) {
        .pos-grid { grid-template-columns: 1fr; height: auto !important; }
        .pos-cart { max-height: 420px; }
      }
    `}</style>
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
        <div style={{ display: "flex", flexDirection: "column", gap: 0, height: "calc(100vh - 80px)", minHeight: 600 }}>

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

          <div className="pos-grid" style={{ flex: 1, minHeight: 0 }}>
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

            <div className="pos-cart" style={{ minHeight: 0, display: "flex", flexDirection: "column" }}>
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
                onPlaceOrder={(opts) => placeOrder(opts)}
                posMode={posMode}
                selectedTable={selectedTable}
                orderType={orderType}
                setOrderType={setOrderType}
                orderNotes={orderNotes}
                setOrderNotes={setOrderNotes}
                printMode={printMode}
                setPrintMode={setPrintMode}
              />
            </div>
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
          markPaid={markPaid}
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
                        <button
                          onClick={() => setTaggingItem(item)}
                          style={{
                            padding: "3px 10px", borderRadius: 6, border: "1px solid",
                            fontSize: 11, cursor: "pointer", fontWeight: 600,
                            borderColor: item.dietary_type && item.spice_level != null ? "#99d6c8" : "#fde68a",
                            background: item.dietary_type && item.spice_level != null ? "#e7f2ef" : "#fffbeb",
                            color: item.dietary_type && item.spice_level != null ? "#1B6E5C" : "#b45309",
                          }}
                        >
                          {item.dietary_type && item.spice_level != null ? "🏷️ Tagged" : "🏷️ Tag"}
                        </button>
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

      {taggingItem && (
        <DishTaggingModal
          item={taggingItem}
          onClose={() => setTaggingItem(null)}
          onSaved={updated => {
            setMenuItems(prev => prev.map(m => m.id === updated.id ? updated : m))
            setTaggingItem(null)
          }}
        />
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

      {view === "procurement" && <ProcurementView />}

      {view === "analytics" && <MISView />}

      {view === "subrecipes" && <SubRecipesView />}

      {view === "recipes" && <RecipesView />}


      {/* LOYALTY VIEW */}
      {view === "loyalty" && <LoyaltyView />}

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

      {view === "inventory" && <InventoryView />}

      {view === "production" && <ProductionPage />}

      {view === "resources" && <BusinessResourcesView />}

      {view === "checklists" && <ChecklistsView />}

      {view === "posters" && <PostersView />}

      {/* EXPENSES VIEW */}
      {view === "expenses" && <ExpensesView />}

      {/* EXPIRY ALARM — global, shown on any view */}
      <ExpiryAlarmModalWrapper />

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

      {/* Global in-app confirm dialog */}
      <ConfirmDialog
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        cancelLabel={confirmState.cancelLabel}
        danger={confirmState.danger}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
      <BillModal
        order={billOrder}
        outlet={{ id: OUTLET_ID, name: "Praang", taxRate: 5 }}
        isOpen={showBill}
        onClose={() => { setShowBill(false); setBillOrder(null); setView("orders") }}
      />
    </>
  );
}

// ── Expiry Alarm Wrapper — checks once on mount, re-checks every 30 min ──────

function ExpiryAlarmModalWrapper() {
  const [show, setShow] = useState(false)
  const [checkKey, setCheckKey] = useState(0)

  useEffect(() => {
    // Small delay so the main app loads first
    const t = setTimeout(() => setShow(true), 2000)
    return () => clearTimeout(t)
  }, [checkKey])

  function handleDismiss() {
    setShow(false)
    // Re-check after 30 minutes
    setTimeout(() => setCheckKey(k => k + 1), 30 * 60 * 1000)
  }

  if (!show) return null
  return <ExpiryAlarmModal onDismiss={handleDismiss} />
}