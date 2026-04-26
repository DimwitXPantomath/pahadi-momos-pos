import { supabase } from "@/lib/supabase";
import type { Ingredient, OrderItem, RecipeItem, SubRecipe, Recipe } from "@/types/pos";
import QRCode from "react-qr-code";
import { OrderStatus } from "@/types/pos";
import { useState, useEffect, useMemo, useRef } from "react";
import type { MenuItem } from "@/types/pos";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import Settings from "@/components/Settings"
import { printReceipt } from "@/utils/printReceipt"
import { printKOT } from "@/utils/printKOT"
import { printOrder } from "@/utils/printManager"
import type { POSSettings } from "@/types/pos"
import type { Order } from "@/types/pos"
import Layout from "@/components/Layout"
import { useAuth } from "@/contexts/AuthContext"


const OUTLET_ID = "demo-outlet";

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

type Props = {
  view: View
  setView: (v: View) => void
  todayOrderCount: number
}

type Printer = {
  id: string
  name: string
  role: "BILL" | "KOT" | "BOTH"
}

type PaymentMethod = "CASH" | "CARD" | "UPI";

export default function Index() {
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [sizeSelectorItem, setSizeSelectorItem] = useState<MenuItem | null>(null)
  const [qrOrderId, setQrOrderId] = useState<string | null>(null);
  const [view, setView] = useState<View>("menu");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [newItemName, setNewItemName] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("");
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [menuMode, setMenuMode] = useState<"order" | "manage">("order");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newItemIsVeg, setNewItemIsVeg] = useState(true);
  const [vegFilter, setVegFilter] = useState<"all" | "veg" | "nonveg">("all");
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [, setTick] = useState(0)
  const placedOrders = orders.filter(o => o.status === OrderStatus.PLACED);
  const preparingOrders = orders.filter(o => o.status === OrderStatus.PREPARING);
  const readyOrders = orders.filter(o => o.status === OrderStatus.READY);
  const collectedOrders = orders.filter(o => o.status === OrderStatus.COLLECTED);
  const [selectedAddons, setSelectedAddons] = useState<{ name: string; price: number }[]>([])
  const [selectedSize, setSelectedSize] = useState<{ label: string; price: number } | null>(null)
  const addons = sizeSelectorItem?.addons ?? []
  const [manageCategory, setManageCategory] = useState<string | null>(null)
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [newIngredientName, setNewIngredientName] = useState("")
  const [newIngredientUnit, setNewIngredientUnit] = useState("")
  const [subRecipes, setSubRecipes] = useState<SubRecipe[]>([])
  const [newSubRecipe, setNewSubRecipe] = useState("")
  const [selectedSubRecipe, setSelectedSubRecipe] = useState<SubRecipe | null>(null)
  const [selectedIngredient, setSelectedIngredient] = useState("")
  const [quantity, setQuantity] = useState("")
  const [subRecipeItems, setSubRecipeItems] = useState<any[]>([])
  const alertedOrdersRef = useRef<Set<string>>(new Set())
  const [yieldPercent, setYieldPercent] = useState("100")
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null)
  const [recipeItems, setRecipeItems] = useState<RecipeItem[]>([])
  const [selectedMenuItem, setSelectedMenuItem] = useState("")
  const [selectedSubRecipeForRecipe, setSelectedSubRecipeForRecipe] = useState("")
  const [selectedIngredientForRecipe, setSelectedIngredientForRecipe] = useState("")
  const [recipeQty, setRecipeQty] = useState("")
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [mostOrdered, setMostOrdered] = useState<MenuItem[]>([]);
  const { profile } = useAuth()


  const [settings, setSettings] = useState<POSSettings>({
    kdsEnabled: true,
    delayAlertMinutes: 10,
    soundAlert: true,
    autoSortOrders: true,
    customerDisplayEnabled: false,
    posMode: "SELF_SERVICE" as "SELF_SERVICE" | "TABLE_SERVICE",
    printers: [
      {
        id: "main",
        name: "Main Printer",
        role: "BOTH"
      }
    ]
  })

  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [orderType, setOrderType] = useState<"DINE_IN" | "TAKEAWAY">("DINE_IN")
  const [orderNotes, setOrderNotes] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [tables, setTables] = useState([
    { id: "T1", seats: 2, status: "available" },
    { id: "T2", seats: 4, status: "available" },
    { id: "T3", seats: 4, status: "occupied" },
    { id: "T4", seats: 2, status: "available" },
    { id: "T5", seats: 6, status: "occupied" },
    { id: "T6", seats: 4, status: "available" },
  ])

  const salesData = useMemo(() => {

  const itemSales: Record<string, number> = {}

    orders.forEach(order => {
      if (!order.items) return

      order.items.forEach((item:OrderItem) => {
        if (!itemSales[item.name]) {
          itemSales[item.name] = 0
        }

        itemSales[item.name] += item.quantity
      })
    })

    return Object.entries(itemSales).map(([name, qty]) => ({
      name,
      sales: qty
    }))

  }, [orders])  

  const paymentData = useMemo(() => {

    const totals = {
      CASH: 0,
      CARD: 0,
      UPI: 0
    }

    orders.forEach(order => {
      totals[order.payment_method as keyof typeof totals] += order.total
    })

    return [
      { name: "Cash", value: totals.CASH },
      { name: "Card", value: totals.CARD },
      { name: "UPI", value: totals.UPI }
    ]

  }, [orders])

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t: number) => t + 1)
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (menuItems.length > 0) {
      fetchMostOrdered();
    }
  }, [menuItems, orders]);

  useEffect(() => {
    if (categories.length > 0 && !manageCategory) {
      setManageCategory(categories[0].id)
    }
  }, [categories])

  useEffect(() => {
    if (categories.length > 0 && !activeCategory) {
      setActiveCategory(categories[0].id);
    }
  }, [categories]);

  useEffect(() => {
    const load = async () => {
      const data = await getSmartSuggestions()
      setSuggestions(data.filter((s): s is string => Boolean(s)))
    }

    load()
  }, [orders])

  const addMenuItem = async () => {
    if (!newItemName || !newItemPrice || !newItemCategory) {
      alert("Fill all fields");
      return;
    }

    const { data, error } = await supabase
      .from("menu_items")
      .insert({
        name: newItemName,
        price: Number(newItemPrice),
        category_id: newItemCategory,
        available: true,
        is_veg: newItemIsVeg,
      })
      .select()
      .single();

    if (!error && data) {
      setMenuItems(prev => [...prev, data]);
      setNewItemName("");
      setNewItemPrice("");
      setNewItemCategory("");
    } else {
      console.error(error);
    }
  };

  const addCategory = async () => {
    const trimmed = newCategoryName.trim()
    if (!trimmed) {
      alert("Please type a category name first")
      return
    }

    const exists = categories.find(
      c => c.name.toLowerCase() === trimmed.toLowerCase()
    )
    if (exists) {
      alert("This category already exists")
      return
    }

    console.log("Inserting category:", trimmed)

    const { data, error } = await supabase
      .from("categories")
      .insert({ name: trimmed })
      .select("id, name")

    console.log("Result:", { data, error })

    if (error) {
      alert("Error adding category: " + error.message + " | Code: " + error.code)
      return
    }

    if (data && data.length > 0) {
      setCategories(prev => [...prev, data[0]])
      setNewCategoryName("")
    } else {
      // Refresh from DB
      const { data: fresh } = await supabase
        .from("categories")
        .select("id, name")
        .order("created_at", { ascending: true })
      if (fresh) setCategories(fresh)
      setNewCategoryName("")
    }
  }

    const deleteCategory = async (id: string) => {

    const confirmDelete = confirm("Delete this category?")

    if (!confirmDelete) return

    const { error } = await supabase
      .from("categories")
      .delete()
      .eq("id", id)

    if (!error) {
      setCategories(prev =>
        prev.filter(c => c.id !== id)
      )
    }
  }

  const addToCart = (
    item: MenuItem,
    size?: { label: string; price: number },
    addons: { name: string; price: number }[] = []
  ) => {

    // ✅ Normalize addons (VERY IMPORTANT)
    const sortedAddons = [...addons].sort((a, b) =>
      a.name.localeCompare(b.name)
    )

    // ✅ Calculate addon price
    const addonPrice = sortedAddons.reduce((sum, a) => sum + a.price, 0)

    // ✅ Final price
    const basePrice = size ? size.price : item.price
    const itemPrice = basePrice + addonPrice

    // ✅ Clean ID (stable)
    const itemId = [
      item.id,
      size?.label || "base",
      ...sortedAddons.map(a => a.name)
    ].join("|")

    // ✅ Display name (UI only)
    const itemName =
      item.name +
      (size ? ` (${size.label})` : "") +
      (sortedAddons.length
        ? ` + ${sortedAddons.map(a => a.name).join(", ")}`
        : "")

    setCart(prev => {
      const existing = prev.find(i => i.id === itemId)

      if (existing) {
        return prev.map(i =>
          i.id === itemId
            ? { ...i, quantity: i.quantity + 1 }
            : i
        )
      }

      return [
        ...prev,
        {
          id: itemId,
          name: itemName,
          price: itemPrice,
          quantity: 1,

          // ✅ ADD THIS (future-proofing)
          baseId: item.id,
          size: size || null,
          addons: sortedAddons,

          station: item.station || "GENERAL",
        }
      ]
    })
  }

  const addSubRecipeItem = async () => {
    if (!selectedSubRecipe || !selectedIngredient || !quantity) return

    const qty = Number(quantity)
    const yieldVal = Number(yieldPercent || 100)

    const usableQty = qty * (yieldVal / 100)
    const wastage = qty - usableQty

    const { data } = await supabase
      .from("sub_recipe_items")
      .insert({
        sub_recipe_id: selectedSubRecipe.id,
        ingredient_id: selectedIngredient,
        quantity: qty,
        yield_percent: yieldVal,
        wastage: wastage
      })
      .select()
      .single()

    if (data) {
      setSubRecipeItems(prev => [...prev, data])
      setQuantity("")
      setYieldPercent("100")
    }
  }

  const addRecipe = async () => {
    if (!selectedMenuItem) return

    const { data } = await supabase
      .from("recipes")
      .insert({
        menu_item_id: selectedMenuItem,
        name: "Recipe"
      })
      .select()
      .single()

    if (data) {
      setRecipes(prev => [...prev, data])
    }
  }

  const addRecipeItem = async () => {
    if (!selectedRecipe || !recipeQty) return

    const { data } = await supabase
      .from("recipe_items")
      .insert({
        recipe_id: selectedRecipe.id,
        ingredient_id: selectedIngredientForRecipe || null,
        sub_recipe_id: selectedSubRecipeForRecipe || null,
        quantity: Number(recipeQty),
        yield_percent: 100
      })
      .select()
      .single()

    if (data) {
      setRecipeItems(prev => [...prev, data])
      setRecipeQty("")
    }
  }

  const renderOrders = (list: Order[], settings: POSSettings) => {
    const sorted = settings.autoSortOrders
      ? [...list].sort((a, b) => {
          const now = Date.now()

          const diffA = now - new Date(a.created_at).getTime()
          const diffB = now - new Date(b.created_at).getTime()

          return diffB - diffA   // longest waiting first 🔥
        })
      : list

    return sorted.map((order) => {
      checkOrderDelay(order)

      return (
        <div
          key={order.id}
          style={{
            border: "1px solid #ddd",
            padding: 12,
            marginBottom: 10,
            borderRadius: 6,
            borderLeft: `6px solid ${getOrderColor(order.created_at)}`
          }}
        >
          <div>
            <strong>Token #{order.token_no}</strong> — {order.status}
          </div>

          <div style={{ fontSize: 12 }}>
            ⏱ {getOrderTime(order.created_at)}
          </div>
          
        {order.status === OrderStatus.PLACED && (
          <div style={{ marginTop: 8 }}>
            {[5, 10, 15].map((min) => (
              <button
                key={min}
                onClick={() => startPreparing(order.id, min)}
                style={{ marginRight: 6 }}
              >
                {min} min
              </button>
            ))}
          </div>
        )}

        {order.status === OrderStatus.PREPARING && (
          <button onClick={() => markReady(order.id)} style={{ marginTop: 8 }}>
            Mark Ready
          </button>
        )}

        {order.status === OrderStatus.READY && (
          <div style={{ marginTop: 8 }}>

            {/* PAYMENT SELECT */}
            <select
              value={order.payment_method || ""}
              onChange={(e) =>
                updatePayment(order.id, e.target.value as PaymentMethod)
              }
              style={{ marginRight: 8 }}
            >
              <option value="" disabled>
                Select Payment
              </option>
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="CARD">Card</option>
            </select>

            {/* COLLECT BUTTON */}
            <button
              disabled={!order.payment_method}
              onClick={() => collectOrder(order.id)}
              style={{
                background: order.payment_method ? "#22c55e" : "#ccc",
                color: "white",
                padding: "6px 10px",
                borderRadius: 4,
                border: "none",
                cursor: order.payment_method ? "pointer" : "not-allowed",
              }}
            >
              {order.payment_method ? "Collected" : "Select Payment First"}
            </button>

          </div>
        )}
      </div>
      )
    })
  }
  
  const orderPriority: Record<OrderStatus, number> = {
    [OrderStatus.PLACED]: 1,
    [OrderStatus.PREPARING]: 2,
    [OrderStatus.READY]: 3,
    [OrderStatus.COLLECTED]: 4,
  };

  const increaseQty = (id: string) => {
    setCart(prev =>
      prev.map(item =>
        item.id === id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      )
    );
  };

  const decreaseQty = (id: string) => {
    setCart(prev =>
      prev
        .map(item =>
          item.id === id
            ? { ...item, quantity: item.quantity - 1 }
            : item
        )
        .filter(item => item.quantity > 0)
    );
  };

  const subtotal = cart.reduce(
    (sum, i) => sum + i.price * i.quantity,
    0
  );

  const gst = subtotal * 0.05; // 5% GST
  const grandTotal = subtotal + gst;

  const splitItemsByStation = (items: OrderItem[]) => {
    const map: Record<string, OrderItem[]> = {}

    items.forEach(item => {
      const station = item.station || "GENERAL"

      if (!map[station]) {
        map[station] = []
      }

      map[station].push(item)
    })

    return map
  }

  const addSubRecipe = async () => {
    if (!newSubRecipe) return
    const { data } = await supabase
      .from("sub_recipes")
      .insert({ name: newSubRecipe })
      .select()
      .single()
    if (data) {
      setSubRecipes(prev => [...prev, data])
      setNewSubRecipe("")
    }
  }

  const addIngredient = async () => {
    if (!newIngredientName || !newIngredientUnit) return

    const { data } = await supabase
      .from("ingredients")
      .insert({
        name: newIngredientName,
        unit: newIngredientUnit
      })
      .select()
      .single()

    if (data) {
      setIngredients(prev => [...prev, data])
      setNewIngredientName("")
      setNewIngredientUnit("")
    }
  }

  const expandSubRecipe = async (subRecipeId: string, multiplier: number) => {
    const { data } = await supabase
      .from("sub_recipe_items")
      .select("*")
      .eq("sub_recipe_id", subRecipeId)

    if (!data) return []

    return data.map(item => ({
      ingredient_id: item.ingredient_id,
      quantity:
        item.quantity *
        (item.yield_percent ? item.yield_percent / 100 : 1) *
        multiplier
    }))
  }

  const expandRecipe = async (recipeId: string) => {
    const { data } = await supabase
      .from("recipe_items")
      .select("*")
      .eq("recipe_id", recipeId)

    if (!data) return []

    let finalIngredients: any[] = []

    for (const item of data) {

      // 🔹 If direct ingredient
      if (item.ingredient_id) {
        finalIngredients.push({
          ingredient_id: item.ingredient_id,
          quantity:
            item.quantity *
            (item.yield_percent ? item.yield_percent / 100 : 1)
        })
      }

      // 🔹 If sub recipe
      if (item.sub_recipe_id) {
        const subItems = await expandSubRecipe(
          item.sub_recipe_id,
          item.quantity
        )

        finalIngredients.push(...subItems)
      }
    }

    return finalIngredients
  }

  const updateStock = async (ingredient_id: string, qty: number) => {
    const { data } = await supabase
      .from("ingredients")
      .select("current_stock")
      .eq("id", ingredient_id)
      .single()

    if (!data) return

    await supabase
      .from("ingredients")
      .update({
        current_stock: data.current_stock - qty
      })
      .eq("id", ingredient_id)
  }

  const calculateCost = async (ingredientsList: any[]) => {
    let total = 0

    for (const item of ingredientsList) {

      const { data } = await supabase
        .from("ingredient_prices")
        .select("price_per_unit")
        .eq("ingredient_id", item.ingredient_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single()

      if (data) {
        total += data.price_per_unit * item.quantity
      }
    }

    return total
  }

  const getLowStockIngredients = async () => {
    const { data } = await supabase
      .from("ingredients")
      .select("*")

    if (!data) return []

    return data.filter(i => i.current_stock < i.min_stock)
  }

  const suggestPurchaseQty = (ingredient: any) => {
    const deficit = ingredient.min_stock - ingredient.current_stock

    return deficit > 0 ? deficit * 2 : 0   // buffer stock
  }

  const getBestVendorPrice = async (ingredient_id: string) => {
    const { data } = await supabase
      .from("ingredient_prices")
      .select("*")
      .eq("ingredient_id", ingredient_id)
      .order("price_per_unit", { ascending: true })
      .limit(1)
      .single()

    return data
  }

  const generatePurchaseOrder = async () => {

    const lowStockItems = await getLowStockIngredients()

    if (!lowStockItems.length) {
      alert("No items needed")
      return
    }

    let poItems = []

    for (const ing of lowStockItems) {

      const qty = suggestPurchaseQty(ing)

      const vendor = await getBestVendorPrice(ing.id)

      if (!vendor) continue

      poItems.push({
        ingredient_id: ing.id,
        quantity: qty,
        price: vendor.price_per_unit,
        vendor_name: vendor.vendor_name
      })
    }

    // group by vendor (IMPORTANT)
    const grouped: Record<string, any[]> = {}

    poItems.forEach(item => {
      if (!grouped[item.vendor_name]) {
        grouped[item.vendor_name] = []
      }
      grouped[item.vendor_name].push(item)
    })

    // create PO per vendor
    for (const vendor in grouped) {

      const items = grouped[vendor]

      const { data: po } = await supabase
        .from("purchase_orders")
        .insert({
          vendor_name: vendor,
          status: "PENDING"
        })
        .select()
        .single()

      if (!po) continue

      await supabase
        .from("purchase_order_items")
        .insert(
          items.map(i => ({
            purchase_order_id: po.id,
            ingredient_id: i.ingredient_id,
            quantity: i.quantity,
            price: i.price
          }))
        )
    }

    alert("Purchase Orders Generated")
  }

  const calculateItemProfit = async (menuItemId: string, sellingPrice: number) => {

    const { data: recipe } = await supabase
      .from("recipes")
      .select("*")
      .eq("menu_item_id", menuItemId)
      .single()

    if (!recipe) return 0

    const ingredients = await expandRecipe(recipe.id)
    const cost = await calculateCost(ingredients)

    return sellingPrice - cost
  }

  const getTotalWastage = async () => {
    const { data } = await supabase
      .from("sub_recipe_items")
      .select("wastage")

    return data?.reduce((sum, i) => sum + (i.wastage || 0), 0)
  }

  const getTopSelling = () => {

    const map: Record<string, number> = {}

    orders.forEach(order => {
      order.items.forEach(item => {
        map[item.name] = (map[item.name] || 0) + item.quantity
      })
    })

    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
  }

  const suggestPrice = (cost: number, marginPercent: number) => {
    return cost / (1 - marginPercent / 100)
  }

  const placeOrder = async () => {
    if (cart.length === 0) {
      alert("Cart empty");
      return;
    }
    if (isPlacingOrder) return;
    setIsPlacingOrder(true);

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
    };

    const { data, error } = await supabase
      .from("orders")
      .insert(payload)
      .select()
      .single()

    if (error) {
      alert(error.message);
      setIsPlacingOrder(false);
      return;
    }

    const orderItemsPayload = cart.map(item => ({
      order_id: data.id,
      outlet_id: OUTLET_ID,
      item_id: item.id,
      quantity: item.quantity,
    }));

    const { error: itemError } = await supabase
      .from("order_items")
      .insert(orderItemsPayload);

    if (itemError) {
      console.error("Order items error:", itemError);
    }

    const stationMap = splitItemsByStation(cart)

    Object.entries(stationMap).forEach(([station, items]) => {
      printKOT({
        order: data,
        items,
        station
      })
    })

    for (const item of cart) {

      // find recipe
      const { data: recipe } = await supabase
        .from("recipes")
        .select("*")
        .eq("menu_item_id", item.baseId || item.id)
        .single()

      if (!recipe) continue

      const ingredientsList = await expandRecipe(recipe.id)

      // multiply by quantity ordered
      const finalList = ingredientsList.map(i => ({
        ...i,
        quantity: i.quantity * item.quantity
      }))

      // deduct
      for (const ing of finalList) {
        await updateStock(ing.ingredient_id, ing.quantity)
      }
    }

    // optional: customer bill
    printReceipt(data)

    // printOrder(data, settings.printers)
    // DO NOT manually setOrders here
    // Realtime will handle insertion

    setQrOrderId(data.id);
    setView("orders");
    setCart([]);
    setIsPlacingOrder(false);
    fetchMostOrdered();
  };

  const handleItemClick = (item: MenuItem) => {

    const hasSizes = item.sizes && item.sizes.length > 0
    const hasAddons = item.addons && item.addons.length > 0

    // If item has size OR addons → open modal
    if (hasSizes || hasAddons) {
      setSizeSelectorItem(item)
      setSelectedSize(null)
      setSelectedAddons([])
      return
    }

    // Simple item → direct add
    addToCart(item)
  }

  const fetchMostOrdered = async () => {
    const { data, error } = await supabase
      .from("order_items")
      .select("item_id, quantity")
      .eq("outlet_id", OUTLET_ID);

    if (error) {
      console.error(error);
      return;
    }

    if (!data) return;

    // ✅ FIX TYPE
    const countMap: Record<string, number> = {};

    data.forEach((item: { item_id: string; quantity: number }) => {
      if (!countMap[item.item_id]) {
        countMap[item.item_id] = 0;
      }
      countMap[item.item_id] += item.quantity;
    });

    const sorted = Object.entries(countMap)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 10);

    const finalItems = sorted
      .map(([id]) => {
        const baseId = id.split("-")[0]   // remove size/addon
        return menuItems.find(m => m.id === baseId)
      })
      .filter(Boolean)

    setMostOrdered(finalItems.filter(Boolean) as MenuItem[]);
  };

  const startPreparing = async (orderId: string, minutes: number) => {
    const readyAt = new Date(
      Date.now() + minutes * 60 * 1000
    ).toISOString();

    const { error } = await supabase
      .from("orders")
      .update({
        status: OrderStatus.PREPARING,
        ready_at: readyAt,
      })
      .eq("id", orderId);

    if (!error) {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? { ...o, status: OrderStatus.PREPARING, ready_at: readyAt }
            : o
        )
      );
    }
  };  

  const markReady = async (orderId: string) => {
    
    const { error } = await supabase
      .from("orders")
      .update({ status: OrderStatus.READY })
      .eq("id", orderId);

    if (!error) {
      setOrders(prev =>
        prev.map(o =>
          o.id === orderId
            ? { ...o, status: OrderStatus.READY }
            : o
        )
      );
    }
  };

  const collectOrder = async (orderId: string) => {
    const { error } = await supabase
      .from("orders")
        .update({
          status: OrderStatus.COLLECTED,
          closed_at: new Date().toISOString(),
        })
      .eq("id", orderId);

    if (!error) {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? { ...o, status: OrderStatus.COLLECTED }
            : o
        )
      );
    }
  };

  const updatePayment = async (orderId: string, method: PaymentMethod) => {
    const { error } = await supabase
      .from("orders")
      .update({ payment_method: method })
      .eq("id", orderId)

    if (!error) {
      setOrders(prev =>
        prev.map(o =>
          o.id === orderId
            ? { ...o, payment_method: method }
            : o
        )
      )
    }
  }

  const updateMenuItem = async (
    id: string,
    updates: Partial<MenuItem>
  ) => {
    const { data, error } = await supabase
      .from("menu_items")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (!error && data) {
      setMenuItems(prev =>
        prev.map(item =>
          item.id === id ? data : item
        )
      );
    }
  };

  const deleteMenuItem = async (id: string) => {
    const confirmDelete = confirm("Delete this item?");
    if (!confirmDelete) return;

    const { error } = await supabase
      .from("menu_items")
      .delete()
      .eq("id", id);

    if (!error) {
      setMenuItems(prev =>
        prev.filter(item => item.id !== id)
      );
    }
  };

  const toggleAvailability = async (id: string, current: boolean) => {

    const { data, error } = await supabase
      .from("menu_items")
      .update({ available: !current })
      .eq("id", id)
      .select()
      .single()

    if (!error && data) {
      setMenuItems(prev =>
        prev.map(item =>
          item.id === id ? data : item
        )
      )
    }
  }

  const playNotification = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(err => {
        console.log("Audio blocked:", err);
      });
    }
  };

  const addonTotal = selectedAddons.reduce(
    (sum, a) => sum + a.price,
    0
  )

  const basePrice = selectedSize?.price ?? sizeSelectorItem?.price ?? 0

  const totalPrice = basePrice + addonTotal

  useEffect(() => {
    const fetchMenu = async () => {
      const { data } = await supabase
        .from("menu_items")
        .select("*")
        .order("created_at", { ascending: true });

      if (data) setMenuItems(data);
    };

    fetchMenu();
  }, []);
  
  useEffect(() => {
    const fetchCategories = async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Categories fetch error:", error)
        return
      }

      console.log("Categories loaded:", data)
      if (data) setCategories(data);
    };

    fetchCategories();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("orders-channel")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
        },
        (payload) => {
          const newOrder = payload.new as Order;

          if (payload.eventType === "INSERT") {
            setOrders((prev) => {
              if (prev.some((o) => o.id === newOrder.id)) {
                return prev;
              }
              return [newOrder, ...prev];
            });
          }

          if (payload.eventType === "UPDATE") {
            setOrders((prev) =>
              prev.map((o) =>
                o.id === newOrder.id ? newOrder : o
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  function getOrderTime(createdAt: string) {
    const now = new Date()
    const created = new Date(createdAt)

    const diff = Math.floor((now.getTime() - created.getTime()) / 1000)

    const minutes = Math.floor(diff / 60)
    const seconds = diff % 60

    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }

  function getOrderColor(createdAt: string) {
    const now = new Date()
    const created = new Date(createdAt)

    const diff = (now.getTime() - created.getTime()) / 1000
    const minutes = diff / 60

    if (minutes < 3) return "#22c55e"   // green
    if (minutes < 6) return "#eab308"   // yellow
    if (minutes < 10) return "#f97316"  // orange
    return "#ef4444"                    // red
  }

  function checkOrderDelay(order: Order) {
    const now = new Date()
    const created = new Date(order.created_at)

    const minutes =
      (now.getTime() - created.getTime()) / 1000 / 60

    if (minutes >= settings.delayAlertMinutes && !alertedOrdersRef.current.has(order.id)) {
      alertedOrdersRef.current.add(order.id)

      if (audioRef.current) {
        audioRef.current.play().catch(() => {})
      }
    }
  }

  function getRemainingTime(readyAt: string) {
    const now = new Date().getTime()
    const ready = new Date(readyAt).getTime()

    const diff = ready - now

    if (diff <= 0) return "Ready"

    const min = Math.floor(diff / 60000)
    const sec = Math.floor((diff % 60000) / 1000)

    return `${min}:${sec.toString().padStart(2,"0")}`
  }

  const getItemDemand = (days = 7) => {

    const map: Record<string, number> = {}

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000

    orders.forEach(order => {
      if (new Date(order.created_at).getTime() < cutoff) return

      order.items.forEach(item => {
        map[item.name] = (map[item.name] || 0) + item.quantity
      })
    })

    return map
  }

  const getDailyPrepSuggestion = () => {
    const demand = getItemDemand(7)

    const daily: Record<string, number> = {}

    Object.entries(demand).forEach(([item, qty]) => {
      daily[item] = Math.ceil(qty / 7)
    })

    return daily
  }

  const classifyMenuItems = async () => {

    const result: any[] = []

    for (const item of menuItems) {

      const sales = orders.reduce((sum, o) => {
        return sum + o.items
          .filter(i => i.name === item.name)
          .reduce((s, i) => s + i.quantity, 0)
      }, 0)

      const profit = await calculateItemProfit(item.id, item.price)

      let type = ""

      if (sales > 50 && profit > 50) type = "STAR"
      else if (sales > 50) type = "CASH COW"
      else if (profit > 50) type = "PUZZLE"
      else type = "DOG"

      result.push({ name: item.name, sales, profit, type })
    }

    return result
  }

  const getSmartSuggestions = async () => {
    const classified = await classifyMenuItems()

    return classified.map(item => {

      if (item.type === "DOG") {
        return `❌ Remove ${item.name}`
      }

      if (item.type === "PUZZLE") {
        return `📢 Promote ${item.name}`
      }

      if (item.type === "CASH COW") {
        return `💰 Increase price slightly for ${item.name}`
      }

      if (item.type === "STAR") {
        return `🔥 Highlight ${item.name}`
      }

      return null
    })
  }

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

        {/* MENU VIEW */}
        {view === "menu" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 0, height: "calc(100vh - 80px)" }}>

            {/* TABLE SELECTOR — only in table service mode */}
            {settings.posMode === "TABLE_SERVICE" && (
              <div style={{ background: "white", borderRadius: 12, padding: "12px 16px", marginBottom: 12, border: "1px solid #e5e7eb" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>Select Table</span>
                  <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#6b7280" }}>
                    <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#16a34a", marginRight: 4 }}></span>Available</span>
                    <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#dc2626", marginRight: 4 }}></span>Occupied</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {tables.map(t => (
                    <button
                      key={t.id}
                      disabled={t.status === "occupied"}
                      onClick={() => setSelectedTable(t.id === selectedTable ? null : t.id)}
                      style={{
                        width: 60, height: 52, borderRadius: 8, border: "1.5px solid",
                        borderColor: selectedTable === t.id ? "#111" : t.status === "occupied" ? "#fecaca" : "#bbf7d0",
                        background: selectedTable === t.id ? "#111" : t.status === "occupied" ? "#fef2f2" : "#f0fdf4",
                        color: selectedTable === t.id ? "white" : t.status === "occupied" ? "#dc2626" : "#16a34a",
                        cursor: t.status === "occupied" ? "not-allowed" : "pointer",
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2
                      }}
                    >
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{t.id}</span>
                      <span style={{ fontSize: 9, opacity: 0.8 }}>{t.seats} seats</span>
                    </button>
                  ))}
                </div>
                {selectedTable && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "#16a34a", fontWeight: 600 }}>
                    ✓ Table {selectedTable} selected
                  </div>
                )}
              </div>
            )}

            {/* TOKEN MESSAGE — only in self service mode */}
            {settings.posMode === "SELF_SERVICE" && (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: "#16a34a", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16 }}>🎟️</span>
                Token will be generated automatically after order is placed
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16, flex: 1, minHeight: 0 }}>

              {/* LEFT — MENU */}
              <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>

                {/* Search + Veg filter */}
                <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
                  <input
                    placeholder="Search menu items..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{ flex: 1, padding: "8px 12px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 13, outline: "none" }}
                  />
                  <button
                    onClick={() => setVegFilter("all")}
                    style={{ padding: "7px 12px", borderRadius: 8, border: "1.5px solid", fontSize: 12, fontWeight: 600, cursor: "pointer", borderColor: vegFilter === "all" ? "#111" : "#e5e7eb", background: vegFilter === "all" ? "#111" : "white", color: vegFilter === "all" ? "white" : "#374151" }}
                  >All</button>
                  <button
                    onClick={() => setVegFilter("veg")}
                    style={{ padding: "7px 12px", borderRadius: 8, border: "1.5px solid", fontSize: 12, fontWeight: 600, cursor: "pointer", borderColor: vegFilter === "veg" ? "#16a34a" : "#e5e7eb", background: vegFilter === "veg" ? "#16a34a" : "white", color: vegFilter === "veg" ? "white" : "#374151" }}
                  >🟢 Veg</button>
                  <button
                    onClick={() => setVegFilter("nonveg")}
                    style={{ padding: "7px 12px", borderRadius: 8, border: "1.5px solid", fontSize: 12, fontWeight: 600, cursor: "pointer", borderColor: vegFilter === "nonveg" ? "#dc2626" : "#e5e7eb", background: vegFilter === "nonveg" ? "#dc2626" : "white", color: vegFilter === "nonveg" ? "white" : "#374151" }}
                  >🔴 Non-veg</button>
                </div>

                {/* Category scroll */}
                <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto", paddingBottom: 4 }}>
                  <button
                    onClick={() => setActiveCategory("all")}
                    style={{ padding: "5px 14px", borderRadius: 20, border: "1.5px solid", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", borderColor: activeCategory === "all" ? "#111" : "#e5e7eb", background: activeCategory === "all" ? "#111" : "white", color: activeCategory === "all" ? "white" : "#374151" }}
                  >All</button>
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCategory(cat.id)}
                      style={{ padding: "5px 14px", borderRadius: 20, border: "1.5px solid", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", borderColor: activeCategory === cat.id ? "#111" : "#e5e7eb", background: activeCategory === cat.id ? "#111" : "white", color: activeCategory === cat.id ? "white" : "#374151" }}
                    >{cat.name}</button>
                  ))}
                </div>

                {/* Most ordered strip */}
                {mostOrdered.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 6 }}>⭐ Most ordered</p>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {mostOrdered.map(item => (
                        <button
                          key={item.id}
                          onClick={() => addToCart(item)}
                          style={{ padding: "5px 12px", background: "#fffbeb", border: "1.5px solid #fbbf24", borderRadius: 20, fontSize: 12, cursor: "pointer", color: "#92400e", fontWeight: 600 }}
                        >{item.name}</button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Menu grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, overflowY: "auto", flex: 1 }}>
                  {menuItems
                    .filter(item => {
                      if (activeCategory !== "all" && item.category_id !== activeCategory) return false
                      if (!item.available) return false
                      if (vegFilter === "veg" && !item.is_veg) return false
                      if (vegFilter === "nonveg" && item.is_veg) return false
                      if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
                      return true
                    })
                    .map(item => (
                      <div
                        key={item.id}
                        style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, cursor: "pointer", transition: "border-color .15s" }}
                      >
                        {/* Item image placeholder */}
                        <div style={{ width: "100%", height: 64, background: "#f5f5f0", borderRadius: 6, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>
                          {item.is_veg ? "🥗" : "🍖"}
                        </div>

                        {/* Veg dot + name */}
                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.is_veg ? "#16a34a" : "#dc2626", display: "inline-block", flexShrink: 0 }}></span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
                        </div>

                        <p style={{ fontSize: 13, fontWeight: 700, color: "#f97316", marginBottom: 8 }}>₹{item.price}</p>

                        {/* Add button / size options */}
                        {item.sizes && item.sizes.length > 0 ? (
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {item.sizes.map(size => {
                              const cartItem = cart.find(i => i.id === `${item.id}-${size.label}`)
                              return cartItem ? (
                                <div key={size.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <button onClick={() => decreaseQty(cartItem.id)} style={{ width: 22, height: 22, borderRadius: 4, border: "1px solid #e5e7eb", background: "#f3f4f6", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>-</button>
                                  <span style={{ fontSize: 12, fontWeight: 700, minWidth: 14, textAlign: "center" }}>{cartItem.quantity}</span>
                                  <button onClick={() => addToCart(item, size)} style={{ width: 22, height: 22, borderRadius: 4, border: "none", background: "#111", color: "white", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                                </div>
                              ) : (
                                <button key={size.label} onClick={() => addToCart(item, size)} disabled={!item.available} style={{ padding: "3px 8px", borderRadius: 6, border: "none", background: "#111", color: "white", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>{size.label}</button>
                              )
                            })}
                          </div>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                            {(() => {
                              const cartItem = cart.find(i => i.id === item.id)
                              return cartItem ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <button onClick={() => decreaseQty(cartItem.id)} style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid #e5e7eb", background: "#f3f4f6", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>-</button>
                                  <span style={{ fontSize: 13, fontWeight: 700, minWidth: 16, textAlign: "center" }}>{cartItem.quantity}</span>
                                  <button onClick={() => addToCart(item)} style={{ width: 24, height: 24, borderRadius: 6, border: "none", background: "#111", color: "white", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                                </div>
                              ) : (
                                <button onClick={() => addToCart(item)} disabled={!item.available} style={{ width: 28, height: 28, borderRadius: "50%", border: "none", background: "#111", color: "white", cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>+</button>
                              )
                            })()}
                          </div>
                        )}

                        <button
                          onClick={() => toggleAvailability(item.id, item.available)}
                          style={{ fontSize: 10, color: item.available ? "#16a34a" : "#dc2626", background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 4 }}
                        >{item.available ? "🟢 Available" : "🔴 Out of stock"}</button>
                      </div>
                    ))}
                </div>
              </div>

              {/* RIGHT — CART */}
              <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 12, display: "flex", flexDirection: "column", minHeight: 0 }}>

                <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb" }}>
                  <p style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>Your order</p>
                  {settings.posMode === "TABLE_SERVICE" && selectedTable && (
                    <p style={{ fontSize: 12, color: "#f97316", margin: "2px 0 0", fontWeight: 600 }}>Table {selectedTable}</p>
                  )}
                  {settings.posMode === "TABLE_SERVICE" && !selectedTable && (
                    <p style={{ fontSize: 12, color: "#dc2626", margin: "2px 0 0" }}>Please select a table first</p>
                  )}
                </div>

                {/* Order type toggle — table service only */}
                {settings.posMode === "TABLE_SERVICE" && (
                  <div style={{ display: "flex", gap: 4, padding: "10px 16px 0" }}>
                    <button
                      onClick={() => setOrderType("DINE_IN")}
                      style={{ flex: 1, padding: "6px", borderRadius: 8, border: "1.5px solid", fontSize: 12, fontWeight: 600, cursor: "pointer", borderColor: orderType === "DINE_IN" ? "#111" : "#e5e7eb", background: orderType === "DINE_IN" ? "#111" : "white", color: orderType === "DINE_IN" ? "white" : "#374151" }}
                    >Dine-in</button>
                    <button
                      onClick={() => setOrderType("TAKEAWAY")}
                      style={{ flex: 1, padding: "6px", borderRadius: 8, border: "1.5px solid", fontSize: 12, fontWeight: 600, cursor: "pointer", borderColor: orderType === "TAKEAWAY" ? "#111" : "#e5e7eb", background: orderType === "TAKEAWAY" ? "#111" : "white", color: orderType === "TAKEAWAY" ? "white" : "#374151" }}
                    >Takeaway</button>
                  </div>
                )}

                {/* Cart items */}
                <div style={{ flex: 1, overflowY: "auto", padding: "10px 16px" }}>
                  {cart.length === 0 ? (
                    <p style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", paddingTop: 20 }}>No items added yet</p>
                  ) : cart.map(i => (
                    <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 10, marginBottom: 10, borderBottom: "1px solid #f3f4f6" }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{i.name}</p>
                        <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>₹{i.price} × {i.quantity}</p>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <button onClick={() => decreaseQty(i.id)} style={{ width: 22, height: 22, borderRadius: 4, border: "1px solid #e5e7eb", background: "#f3f4f6", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>-</button>
                        <span style={{ fontSize: 12, fontWeight: 700, minWidth: 16, textAlign: "center" }}>{i.quantity}</span>
                        <button onClick={() => increaseQty(i.id)} style={{ width: 22, height: 22, borderRadius: 4, border: "none", background: "#111", color: "white", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, minWidth: 40, textAlign: "right" }}>₹{(i.price * i.quantity).toFixed(0)}</span>
                    </div>
                  ))}
                </div>

                {/* Bill summary + payment */}
                <div style={{ padding: "10px 16px", borderTop: "1px solid #e5e7eb" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
                    <span>Subtotal</span><span>₹{subtotal.toFixed(2)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
                    <span>GST (5%)</span><span>₹{gst.toFixed(2)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 800, marginBottom: 12 }}>
                    <span>Total</span><span style={{ color: "#f97316" }}>₹{grandTotal.toFixed(2)}</span>
                  </div>

                  {/* Notes — table service only */}
                  {settings.posMode === "TABLE_SERVICE" && (
                    <textarea
                      placeholder="Notes / special instructions..."
                      value={orderNotes}
                      onChange={e => setOrderNotes(e.target.value)}
                      rows={2}
                      style={{ width: "100%", padding: "6px 10px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 12, resize: "none", marginBottom: 8, fontFamily: "system-ui", color: "#111", background: "white" }}
                    />
                  )}

                  {/* Payment method */}
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value as "CASH" | "CARD" | "UPI")}
                    style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 13, marginBottom: 10, background: "white", color: "#111" }}
                  >
                    <option value="CASH">💵 Cash</option>
                    <option value="CARD">💳 Card</option>
                    <option value="UPI">📱 UPI</option>
                  </select>

                  <button
                    onClick={() => placeOrder()}
                    disabled={
                      isPlacingOrder ||
                      cart.length === 0 ||
                      (settings.posMode === "TABLE_SERVICE" && !selectedTable)
                    }
                    style={{
                      width: "100%", padding: "12px", borderRadius: 10, border: "none",
                      background: (isPlacingOrder || cart.length === 0 || (settings.posMode === "TABLE_SERVICE" && !selectedTable)) ? "#e5e7eb" : "#111",
                      color: (isPlacingOrder || cart.length === 0 || (settings.posMode === "TABLE_SERVICE" && !selectedTable)) ? "#9ca3af" : "white",
                      fontSize: 14, fontWeight: 700, cursor: (isPlacingOrder || cart.length === 0 || (settings.posMode === "TABLE_SERVICE" && !selectedTable)) ? "not-allowed" : "pointer"
                    }}
                  >
                    {isPlacingOrder ? "Placing order..." : settings.posMode === "TABLE_SERVICE" && !selectedTable ? "Select a table first" : "Place order"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MENU MANAGEMENT MODE */}
        {view === "menu_manage" && (
          <div>

            <h2 className="text-xl font-bold mb-6">
              Menu Management
            </h2>

            {/* Add Category */}
            <div className="mb-6 border rounded p-4">
              <h3 className="font-semibold mb-3">Add Category</h3>

              <div className="flex gap-3">
                <input
                  placeholder="Category name"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="border p-2 rounded w-full"
                />

                <button
                  onClick={addCategory}
                  className="bg-black text-white px-4 py-2 rounded"
                >
                  Add
                </button>
              </div>
            </div>


          {/* Existing Menu Items */}

            <div className="grid grid-cols-3 gap-6">

              {/* LEFT: Categories */}

              <div className="border rounded p-4">

                <h3 className="font-semibold mb-3">
                  Categories
                </h3>

                {categories.map(cat => (

                  <div
                    key={cat.id}
                    onClick={() => setManageCategory(cat.id)}
                    className={`p-2 rounded cursor-pointer mb-2 ${
                      manageCategory === cat.id
                        ? "bg-black text-white"
                        : "bg-gray-100"
                    }`}
                  >
                    {cat.name}
                  </div>

                ))}

              </div>

              {/* RIGHT: Items */}

              <div className="col-span-2 border rounded p-4">

                <h3 className="font-semibold mb-3">
                  Items
                </h3>

                {menuItems
                  .filter(item => item.category_id === manageCategory)
                  .map(item => (

                    <div
                      key={item.id}
                      className="flex justify-between items-center border p-2 mb-2 rounded"
                    >

                      <div>
                        <p className="font-semibold">{item.name}</p>
                        <p className="text-sm text-gray-500">
                          ₹{item.price}
                        </p>
                      </div>

                      <button
                        onClick={() => deleteMenuItem(item.id)}
                        className="bg-red-500 text-white px-2 py-1 rounded"
                      >
                        Delete
                      </button>

                    </div>

                ))}

              </div>

            </div>

            {/* Add Item */}
            <div className="mb-6 border rounded p-4">
              <h3 className="font-semibold mb-3">Add New Item</h3>

              <div className="flex gap-3 mb-3">
                <input
                  placeholder="Item name"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="border p-2 rounded w-full"
                />

                <input
                  type="number"
                  placeholder="Price"
                  value={newItemPrice}
                  onChange={(e) => setNewItemPrice(e.target.value)}
                  className="border p-2 rounded w-32"
                />
              </div>

              <select
                value={newItemCategory}
                onChange={(e) => setNewItemCategory(e.target.value)}
                className="border p-2 rounded w-full mb-3"
              >
                <option value="">Select Category</option>

                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}

              </select>

                {/* Category List */}

                <div className="border rounded p-4 mb-6">

                  <h3 className="font-semibold mb-3">
                    Categories
                  </h3>

                  {categories.map(cat => (

                    <div
                      key={cat.id}
                      className="flex justify-between items-center border p-2 mb-2 rounded"
                    >

                      <span>{cat.name}</span>

                      <button
                        onClick={() => deleteCategory(cat.id)}
                        className="bg-red-500 text-white px-2 py-1 rounded"
                      >
                        Delete
                      </button>

                    </div>

                  ))}

                </div>

              <select
                value={newItemIsVeg ? "veg" : "nonveg"}
                onChange={(e) =>
                  setNewItemIsVeg(e.target.value === "veg")
                }
                className="border p-2 rounded w-full mb-3"
              >
                <option value="veg">Veg</option>
                <option value="nonveg">Non-Veg</option>
              </select>

              <button
                onClick={addMenuItem}
                className="bg-black text-white px-4 py-2 rounded"
              >
                Add Item
              </button>
            </div>

          </div>
        )}          
         
         {/* ORDERS MODE */}
         {view === "orders" && (
          <div>
            <h2 className="text-2xl font-bold mb-4">Orders</h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div>
                <h3> Orders</h3>
                {renderOrders(placedOrders, settings)}
              </div>

              <div>
                <h3> Preparing</h3>
                {renderOrders(preparingOrders, settings)}
              </div>

              <div>
                <h3> Ready</h3>
                {renderOrders(readyOrders, settings)}
              </div>

              <div>
                <h3> Collected</h3>
                {renderOrders(collectedOrders, settings)}
              </div>
            </div>
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