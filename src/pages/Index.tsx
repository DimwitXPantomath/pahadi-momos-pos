
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Order, OrderItem } from "@/types/pos";
import QRCode from "react-qr-code";
import { OrderStatus } from "@/types/pos";
import { useEffect } from "react";
import { useMemo } from "react";
import { useRef } from "react";

import type { MenuItem } from "@/types/pos";

const OUTLET_ID = "demo-outlet";

type View = "menu" | "orders" | "reports" | "history";
type PaymentMethod = "CASH" | "CARD" | "UPI";

export default function Index() {
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

  const placedOrders = orders.filter(o => o.status === OrderStatus.PLACED);
  const preparingOrders = orders.filter(o => o.status === OrderStatus.PREPARING);
  const readyOrders = orders.filter(o => o.status === OrderStatus.READY);
  const collectedOrders = orders.filter(o => o.status === OrderStatus.COLLECTED);

  const sidebarItems: { label: string; value: View }[] = [
    { label: "Menu", value: "menu" },
    { label: "Orders", value: "orders" },
    { label: "Reports", value: "reports" },
    { label: "Order History", value: "history" },
  ];

  useEffect(() => {
    if (categories.length > 0) {
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

  const addToCart = (item: { id: string; name: string; price: number }) => {
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

    const renderOrders = (list: Order[]) =>
      list.map((o) => (
        <div
          key={o.id}
          style={{
            border: "1px solid #ddd",
            padding: 10,
            marginTop: 10,
            borderRadius: 8,
          }}
        >
          <div>
            <strong>#{o.order_no}</strong> — {o.status}
          </div>

          {o.status === OrderStatus.PLACED && (
            <div style={{ marginTop: 8 }}>
              {[5, 10, 15].map((min) => (
                <button
                  key={min}
                  onClick={() => startPreparing(o.id, min)}
                  style={{ marginRight: 6 }}
                >
                  {min} min
                </button>
              ))}
            </div>
          )}

          {o.status === OrderStatus.PREPARING && (
            <button onClick={() => markReady(o.id)} style={{ marginTop: 8 }}>
              Mark Ready
            </button>
          )}

          {o.status === OrderStatus.READY && (
            <button onClick={() => collectOrder(o.id)} style={{ marginTop: 8 }}>
              Collected
            </button>
          )}
        </div>
      ));
  

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


  return (
    <div style={{ display: "flex", height: "100vh" }}>

      {/* SIDEBAR */}
      <div style={{
        width: 220,
        background: "#111",
        color: "white",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 20
      }}>

        {/* TOP SECTION */}
        <div>
          <h2 style={{ marginBottom: 30, fontWeight: "bold" }}>
            PAHADI MOMOS
          </h2>

          <div
            onClick={() => setView("menu")}
            style={{
              marginBottom: 15,
              cursor: "pointer",
              padding: "8px 12px",
              borderRadius: 6,
              fontWeight: view === "menu" ? "bold" : "normal",
              background: view === "menu" ? "#f97316" : "transparent",
              color: view === "menu" ? "white" : "white",
            }}
          >
            Menu
          </div>

          <div
            onClick={() => setView("orders")}
            style={{
              marginBottom: 15,
              cursor: "pointer",
              padding: "8px 12px",
              borderRadius: 6,
              fontWeight: view === "orders" ? "bold" : "normal",
              background: view === "orders" ? "#f97316" : "transparent",
              color: view === "orders" ? "white" : "white",
            }}
          >
            Orders
          </div>
             <div
                onClick={() => setView("reports")}
                style={{
                  marginBottom: 15,
                  cursor: "pointer",
                  padding: "8px 12px",
                  borderRadius: 6,
                  fontWeight: view === "reports" ? "bold" : "normal",
                  background: view === "reports" ? "#f97316" : "transparent",
                  color: view === "reports" ? "white" : "white",
                }}
              >
            Reports
          </div>
          
             <div
              onClick={() => setView("history")}
                style={{
                  marginBottom: 15,
                  cursor: "pointer",
                  padding: "8px 12px",
                  borderRadius: 6,
                  fontWeight: view === "history" ? "bold" : "normal",
                  background: view === "history" ? "#f97316" : "transparent",
                  color: "white",
                }}
              >
              Order History
            </div>
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
          <>
            {/* Toggle */}
            <div className="flex gap-4 mb-4">
              <button
                onClick={() => setMenuMode("order")}
                className={`px-4 py-2 rounded ${
                  menuMode === "order" ? "bg-black text-white" : "bg-gray-200"
                }`}
              >
                Order Mode
              </button>

              <button
                onClick={() => setMenuMode("manage")}
                className={`px-4 py-2 rounded ${
                  menuMode === "manage" ? "bg-black text-white" : "bg-gray-200"
                }`}
              >
                Manage Menu
              </button>
            </div>

            {/* ORDER MODE */}
            {menuMode === "order" && (
              <div className="grid grid-cols-2 gap-6">
                ... your existing order layout ...
              </div>
            )}

            {/* MANAGE MODE */}
            {menuMode === "manage" && (
              <div>
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

                  <button
                    onClick={addMenuItem}
                    className="bg-black text-white px-4 py-2 rounded"
                  >
                    Add Item
                  </button>
                </div>
                {categories.map(cat => (
                  <div key={cat.id} className="mb-6">
                    <h3 className="font-semibold mb-2">{cat.name}</h3>

                    {menuItems
                      .filter(item => item.category_id === cat.id)
                      .map(item => (
                        <div
                          key={item.id}
                          className="flex justify-between items-center border rounded p-3 mb-2"
                        >
                          <div>
                            <strong>{item.name}</strong>
                            <div>₹{item.price}</div>
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                const newPrice = prompt(
                                  "New price",
                                  item.price.toString()
                                );
                                if (newPrice)
                                  updateMenuItem(item.id, {
                                    price: Number(newPrice),
                                  });
                              }}
                              className="bg-gray-200 px-2 rounded"
                            >
                              Edit
                            </button>

                            <button
                              onClick={() =>
                                updateMenuItem(item.id, {
                                  available: !item.available,
                                })
                              }
                              className="bg-gray-200 px-2 rounded"
                            >
                              {item.available ? "Disable" : "Enable"}
                            </button>

                            <button
                              onClick={() => deleteMenuItem(item.id)}
                              className="bg-red-500 text-white px-2 rounded"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </>
        )}           
         
         {view === "orders" && (
          <div>
            <h2 className="text-2xl font-bold mb-4">Orders</h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div>
                <h3>🆕 Orders</h3>
                {renderOrders(placedOrders)}
              </div>

              <div>
                <h3>👨‍🍳 Preparing</h3>
                {renderOrders(preparingOrders)}
              </div>

              <div>
                <h3>🔔 Ready</h3>
                {renderOrders(readyOrders)}
              </div>

              <div>
                <h3>✅ Collected</h3>
                {renderOrders(collectedOrders)}
              </div>
            </div>
          </div>
        )}

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
  );
}