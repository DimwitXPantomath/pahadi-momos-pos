console.log("SUPABASE URL:", import.meta.env.VITE_SUPABASE_URL);


import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Order, OrderItem } from "@/types/pos";
import QRCode from "react-qr-code";
import { OrderStatus } from "@/types/pos";
import { useEffect } from "react";
import { useMemo } from "react";


const OUTLET_ID = "demo-outlet";

type View = "menu" | "orders";

export default function Index() {
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [qrOrderId, setQrOrderId] = useState<string | null>(null);
  const [view, setView] = useState<View>("menu");
  

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

    const total = cart.reduce(
      (sum, i) => sum + i.price * i.quantity,
      0
    );

    const payload = {
      outlet_id: OUTLET_ID,
      order_no: orders.length + 1,
      items: cart,
      subtotal,
      gst,
      total: grandTotal,
      status: OrderStatus.PLACED,
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

    setOrders((prev) => [data, ...prev]);
      setQrOrderId(data.id); // 👈 THIS
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
      .update({ status: OrderStatus.COLLECTED })
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

  const menu = [
    { id: "1", name: "Espresso", price: 120, category: "Coffee" },
    { id: "2", name: "Cappuccino", price: 160, category: "Coffee" },
    { id: "3", name: "Latte", price: 180, category: "Coffee" },
    { id: "4", name: "Green Tea", price: 100, category: "Tea" },
    { id: "5", name: "Masala Chai", price: 90, category: "Tea" },
    { id: "6", name: "Croissant", price: 140, category: "Snacks" },
    { id: "7", name: "Veg Sandwich", price: 150, category: "Snacks" },
  ];

  const categories = useMemo(
    () => [...new Set(menu.map(i => i.category))],
    []
  );

  const [activeCategory, setActiveCategory] = useState<string>("");

  useEffect(() => {
    if (categories.length > 0) {
      setActiveCategory(categories[0]);
    }
  }, [categories]);


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
          if (payload.eventType === "INSERT") {
            setOrders(prev => [payload.new as Order, ...prev]);
          }

          if (payload.eventType === "UPDATE") {
            setOrders(prev =>
              prev.map(o =>
                o.id === payload.new.id
                  ? payload.new as Order
                  : o
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


  return (
    <>
      {/* MAIN POS UI */}
      <div style={{ padding: 20 }}>
        <h2>POS</h2>

        {/* Navigation */}
        <div style={{ marginBottom: 20 }}>
          <button onClick={() => setView("menu")}>
            Menu
          </button>

          <button
            onClick={() => setView("orders")}
            style={{ marginLeft: 10 }}
          >
            Orders
          </button>
        </div>

        {/* MENU VIEW */}
        {view === "menu" && (
          <div className="grid grid-cols-2 gap-6">

            {/* LEFT SIDE - MENU */}
            <div>
              <div className="flex gap-2 mb-4">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-4 py-2 rounded-lg font-medium ${
                      activeCategory === cat
                        ? "bg-black text-white"
                        : "bg-gray-200"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                {menu
                  .filter(item => item.category === activeCategory)
                  .map(item => (
                    <div
                      key={item.id}
                      className="flex justify-between items-center border rounded-lg p-4"
                    >
                      <div>
                        <p className="font-semibold">{item.name}</p>
                        <p className="text-sm text-gray-500">
                          ₹{item.price}
                        </p>
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
            <div className="border rounded-lg p-4">
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
                        className="px-2 bg-gray-200 rounded"
                      >
                        -
                      </button>

                      <span>{i.quantity}</span>

                      <button
                        onClick={() => increaseQty(i.id)}
                        className="px-2 bg-gray-200 rounded"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>

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

              <button
                onClick={placeOrder}
                className="w-full mt-4 bg-black text-white py-3 rounded-lg font-semibold"
              >
                Place Order
              </button>
            </div>

          </div>
        )}


        {/* ORDERS VIEW */}
        {view === "orders" && (
          <div>
            <strong>Running Orders:</strong>

            {orders.length === 0 && <p>No active orders</p>}
              {[...orders]
                .sort((a, b) => orderPriority[a.status] - orderPriority[b.status])
                .map((o) => (
              <div
                key={o.id}
                style={{
                  border: "1px solid #ddd",
                  padding: 10,
                  marginTop: 10,
                }}
              >
                <div>
                  <strong>#{o.order_no}</strong> —{" "}
                  <span
                    style={{
                      color:
                        o.status === "READY"
                          ? "green"
                          : o.status === "PREPARING"
                          ? "orange"
                          : "gray",
                      fontWeight: "bold",
                    }}
                  >
                    {o.status}
                  </span>
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
                  <button
                    onClick={() => markReady(o.id)}
                    style={{ marginTop: 8 }}
                  >
                    Mark Ready
                  </button>
                )}

                {o.status === OrderStatus.READY && (
                  <button
                    onClick={() => collectOrder(o.id)}
                    style={{ marginTop: 8 }}
                  >
                    Collected
                  </button>
                )}

              </div>
            ))}
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
    </>
  );
}