import { supabase } from "@/lib/supabase";
import type { OrderItem } from "../types/pos";
import QRCode from "react-qr-code";
import { OrderStatus } from "@/types/pos";
import { useState, useEffect, useMemo, useRef } from "react";
import type { MenuItem } from "@/types/pos";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import Settings from "@/components/Settings"

const OUTLET_ID = "demo-outlet";

type View =
  | "menu"
  | "orders"
  | "reports"
  | "history"
  | "menu_manage"
  | "settings";

type Order = {
  id: string
  order_no: string
  total: number
  status: string
  created_at: string
  items: OrderItem[]
  payment_method: "CASH" | "CARD" | "UPI"
}

type POSSettings = {
  kdsEnabled: boolean
  delayAlertMinutes: number
  soundAlert: boolean
  autoSortOrders: boolean
}

type PaymentMethod = "CASH" | "CARD" | "UPI";

export default function Index() {
  const [settings, setSettings] = useState({
    kdsEnabled: true,
    delayAlertMinutes: 10,
    soundAlert: true,
    autoSortOrders: true
  })
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [, setTick] = useState(0)
  const placedOrders = orders.filter(o => o.status === OrderStatus.PLACED);
  const preparingOrders = orders.filter(o => o.status === OrderStatus.PREPARING);
  const readyOrders = orders.filter(o => o.status === OrderStatus.READY);
  const collectedOrders = orders.filter(o => o.status === OrderStatus.COLLECTED);

  const alertedOrdersRef = useRef<Set<string>>(new Set())

  const sidebarItems: { label: string; value: View }[] = [
    { label: "Menu", value: "menu" },
    { label: "Orders", value: "orders" },
    { label: "Reports", value: "reports" },
    { label: "Order History", value: "history" },
  ];

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
      setTick(t => t + 1)
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (categories.length > 0 && !activeCategory) {
      setActiveCategory(categories[0].id);
    }
  }, [categories]);

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
    if (!newCategoryName) return;

    const { data, error } = await supabase
      .from("categories")
      .insert({ name: newCategoryName })
      .select()
      .single();

    if (!error && data) {
      setCategories(prev => [...prev, data]);
      setNewCategoryName("");
    }
  };

  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
        if (existing) {
          return prev.map((i) =>
            i.id === item.id
              ? { ...i, quantity: i.quantity + 1 }
              : i
            );
          }
          return [...prev, { ...item, quantity: 1 }];
        });
      };

  const renderOrders = (list: Order[], settings: POSSettings) => {
    const sorted = settings.autoSortOrders
      ? [...list].sort(
          (a, b) =>
            new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime()
        )
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
            <strong>#{order.order_no}</strong> — {order.status}
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
          <button onClick={() => collectOrder(order.id)} style={{ marginTop: 8 }}>
            Collected
          </button>
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

  const placeOrder = async () => {
    if (cart.length === 0) {
      alert("Cart empty");
      return;
    }

    const payload = {
      outlet_id: OUTLET_ID,
      order_no: orders.length + 1,
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
      .single();

    if (error) {
      alert(error.message);
      return;
    }

    // DO NOT manually setOrders here
    // Realtime will handle insertion

    setQrOrderId(data.id);
    setView("orders");
    setCart([]);
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
      const { data } = await supabase
        .from("categories")
        .select("*");

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

  const playNotification = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(err => {
        console.log("Audio blocked:", err);
      });
    }
  };

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

  return (
      <>
        {/* MOBILE HEADER */}
        <div className="flex items-center p-4 border-b bg-white shadow-sm md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-2xl"
          >
            ☰
          </button>

          <h1 className="ml-4 font-bold text-lg">
            PAHADI MOMOS
          </h1>
        </div>
      <div className="flex h-[calc(100vh-60px)]">

    {sidebarOpen && (
      <div
        className="fixed inset-0 bg-black bg-opacity-40 md:hidden z-40"
        onClick={() => setSidebarOpen(false)}
      />
    )}

      {/* SIDEBAR */}
      <div
        className={`
          fixed md:relative
          top-0 left-0
          h-full
          w-56
          bg-black text-white
          flex flex-col justify-between
          p-5
          transform
          transition-transform duration-300
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0
          z-50
        `}
      >
        <div className="flex justify-between items-center mb-6 md:hidden">
          <h2 className="font-bold">PAHADI MOMOS</h2>

          <button
            onClick={() => setSidebarOpen(false)}
            className="text-xl"
          >
            ✕
          </button>
        </div>

        {/* TOP SECTION */}
        <div>
          <h2 className="hidden md:block mb-8 font-bold">
            PAHADI MOMOS
          </h2>

          {/* MENU */}
          <div
            onClick={() => setView("menu")}
            style={{
              marginBottom: 12,
              cursor: "pointer",
              padding: "10px 12px",
              borderRadius: 6,
              fontWeight: view === "menu" ? "bold" : "normal",
              background: view === "menu" ? "#f97316" : "transparent",
              color: "white",
            }}
          >
            Menu
          </div>

          {/* ORDERS */}
          <div
            onClick={() => setView("orders")}
            style={{
              marginBottom: 12,
              cursor: "pointer",
              padding: "10px 12px",
              borderRadius: 6,
              fontWeight: view === "orders" ? "bold" : "normal",
              background: view === "orders" ? "#f97316" : "transparent",
              color: "white",
            }}
          >
            Orders
          </div>

          {/* REPORTS */}
          <div
            onClick={() => setView("reports")}
            style={{
              marginBottom: 12,
              cursor: "pointer",
              padding: "10px 12px",
              borderRadius: 6,
              fontWeight: view === "reports" ? "bold" : "normal",
              background: view === "reports" ? "#f97316" : "transparent",
              color: "white",
            }}
          >
            Reports
          </div>

          {/* ORDER HISTORY */}
          <div
            onClick={() => setView("history")}
            style={{
              marginBottom: 12,
              cursor: "pointer",
              padding: "10px 12px",
              borderRadius: 6,
              fontWeight: view === "history" ? "bold" : "normal",
              background: view === "history" ? "#f97316" : "transparent",
              color: "white",
            }}
          >
            Order History
          </div>
        </div>

          {/* SETTINGS */}
        <div
          onClick={() => setView("settings")}
          style={{
            marginBottom: 12,
            cursor: "pointer",
            padding: "10px 12px",
            borderRadius: 6,
            fontWeight: view === "settings" ? "bold" : "normal",
            background: view === "settings" ? "#f97316" : "transparent",
            color: "white",
          }}
        >
          Settings
        </div>
        
        {/* MENU MANAGE */}
        <div
          onClick={() => setView("menu_manage")}
          style={{
            marginBottom: 12,
            cursor: "pointer",
            padding: "10px 12px",
            borderRadius: 6,
            fontWeight: view === "menu_manage" ? "bold" : "normal",
            background: view === "menu_manage" ? "#f97316" : "transparent",
            color: "white",
          }}
        >
          Menu Management
        </div>

        {/* BOTTOM SECTION */}
        <div style={{
          background: "#222",
          padding: 15,
          borderRadius: 8
        }}>
          <div style={{ fontSize: 14 }}>
            Today Orders
          </div>
          <div style={{ fontSize: 22, fontWeight: "bold" }}>
            {orders.length}
          </div>
        </div>

      </div>

      {/* MAIN CONTENT */}
      <div style={{
        flex: 1,
        padding: 30,
        overflowY: "auto"
      }}>

        {/* MENU VIEW */}
        {view === "menu" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* LEFT SIDE - MENU */}
            <div>

              {/* Veg Filter */}
              <div className="flex gap-3 mb-4 flex-wrap">
                <button
                  onClick={() => setVegFilter("all")}
                  className={`px-3 py-1 rounded ${
                    vegFilter === "all" ? "bg-black text-white" : "bg-gray-200"
                  }`}
                >
                  All
                </button>

                <button
                  onClick={() => setVegFilter("veg")}
                  className={`px-3 py-1 rounded ${
                    vegFilter === "veg" ? "bg-green-600 text-white" : "bg-gray-200"
                  }`}
                >
                  Veg
                </button>

                <button
                  onClick={() => setVegFilter("nonveg")}
                  className={`px-3 py-1 rounded ${
                    vegFilter === "nonveg" ? "bg-red-600 text-white" : "bg-gray-200"
                  }`}
                >
                  Non-Veg
                </button>
              </div>

              {/* Category Buttons */}
              <div className="flex gap-2 mb-4 overflow-x-auto">
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`px-4 py-2 rounded-lg font-medium ${
                      activeCategory === cat.id
                        ? "bg-black text-white"
                        : "bg-gray-200"
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>

              {/* Menu Items */}
              <div className="space-y-3">
                {menuItems
                  .filter(item => {
                    if (item.category_id !== activeCategory) return false
                    if (!item.available) return false

                    if (vegFilter === "veg" && !item.is_veg) return false
                    if (vegFilter === "nonveg" && item.is_veg) return false

                    return true
                  })
                  .map(item => (
                    <div
                      key={item.id}
                      className="flex justify-between items-center border rounded-lg p-4 text-lg"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-3 h-3 rounded-full ${
                            item.is_veg ? "bg-green-600" : "bg-red-600"
                          }`}
                        />

                        <div>
                          <p className="font-semibold">{item.name}</p>
                          <p className="text-sm text-gray-500">₹{item.price}</p>
                        </div>
                      </div>

                      <button
                        onClick={() => addToCart(item)}
                        className="bg-black text-white px-4 py-2 rounded-lg"
                      >
                        Add
                      </button>
                    </div>
                ))}
              </div>
            </div>

            {/* RIGHT SIDE - CART */}
            <div className="border rounded-lg p-4 sticky top-0">

              <h3 className="text-lg font-semibold mb-4">Cart</h3>

              {cart.length === 0 && (
                <p className="text-gray-500">No items added</p>
              )}

              <div className="space-y-3">
                {cart.map(i => (
                  <div
                    key={i.id}
                    className="flex justify-between items-center"
                  >
                    <div>
                      <p>{i.name}</p>
                      <p className="text-sm text-gray-500">
                        ₹{i.price} × {i.quantity}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => decreaseQty(i.id)}
                        className="px-3 py-1 bg-gray-200 rounded"
                      >
                        -
                      </button>

                      <span>{i.quantity}</span>

                      <button
                        onClick={() => increaseQty(i.id)}
                        className="px-3 py-1 bg-gray-200 rounded"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Bill Summary */}
              <div className="border-t mt-4 pt-4 space-y-2">

                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>₹{subtotal.toFixed(2)}</span>
                </div>

                <div className="flex justify-between">
                  <span>GST (5%)</span>
                  <span>₹{gst.toFixed(2)}</span>
                </div>

                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span>₹{grandTotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Payment */}
              <div className="mt-4">
                <label className="font-bold">Payment Method</label>

                <select
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(e.target.value as "CASH" | "CARD" | "UPI")
                  }
                  className="block mt-2 p-2 border rounded w-full"
                >
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card</option>
                  <option value="UPI">UPI</option>
                </select>
              </div>

              <button
                onClick={() => placeOrder()}
                className="w-full mt-4 bg-black text-white py-3 rounded-lg font-semibold"
              >
                Place Order
              </button>
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

        {/* REPORTS MODE */}
        {view === "reports" && (
          <div>
            <h2 className="text-2xl font-bold mb-4">Reports</h2>
            <p>Reports dashboard coming next...</p>
          </div>
        )}

        {view === "history" && (
          <div>
            <h2 className="text-2xl font-bold mb-4">Order History</h2>
            <p>Order history page coming next...</p>
          </div>
        )}

      </div>
      
      {/* ORDER HISTORY MODE */}
      {view === "history" && (
        <div>

          <h2 style={{ fontSize: 22, marginBottom: 20 }}>
            Order History
          </h2>

          {orders.map(order => (
            <div
              key={order.id}
              style={{
                border: "1px solid #ddd",
                padding: 12,
                marginBottom: 10,
                borderRadius: 6,
              }}
            >
              <strong>#{order.order_no}</strong> — {order.status}

              <div style={{ fontSize: 14 }}>
                ₹{order.total}
              </div>

              <div style={{ fontSize: 12, color: "#666" }}>
                ⏱ {getOrderTime(order.created_at)}
              </div>

            </div>
          ))}

        </div>
      )}

      {/* REPORTS MODE */}
      {view === "reports" && (

        <div>

          <h2 style={{ fontSize: 22, marginBottom: 20 }}>
            Sales Reports
          </h2>

          {/* ITEM SALES CHART */}
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesData}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="sales" fill="#f97316" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* PAYMENT METHOD CHART */}
          <h3 style={{ marginTop: 40, marginBottom: 10 }}>
            Payment Methods
          </h3>

          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={paymentData}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#22c55e" />
              </BarChart>
            </ResponsiveContainer>
          </div>

        </div>
      )}

      {view === "settings" && (
        <Settings
          settings={settings}
          setSettings={setSettings}
        />
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
              Order ID: {qrOrderId.slice(0, 6)}
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
    </div>
    </>   
  );
}