import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Order } from "@/types/pos";
import { useParams } from "react-router-dom";
import { useRef } from "react";

export default function OrderPage() {
  console.log("🔥 OrderPage mounted");
  const [previousStatus, setPreviousStatus] = useState<string | null>(null);
  const { id: orderId } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<string>("connecting");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);


  const enableNotifications = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      // Force interaction-based unlock
      await audio.play();
      audio.pause();
      audio.currentTime = 0;

      setNotificationsEnabled(true);
    } catch (err) {
      console.log("Audio unlock failed:", err);
      alert("Tap anywhere once and press OK again.");
    }
  }

  useEffect(() => {
    if (!orderId) return;

    let channel: any;
    let isMounted = true;

    const init = async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .single();

      if (!isMounted) return;

      if (error) {
        console.error("FETCH ERROR:", error);
        setLoading(false);
        return;
      }

      setOrder(data);
      setLoading(false);

      channel = supabase
        .channel(`order-${orderId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "orders",
            filter: `id=eq.${orderId}`,
          },
          (payload: any) => {
            const updatedOrder = payload.new as Order;
            setOrder(updatedOrder);
          }
        )
      .subscribe((status) => {
        setConnectionStatus(status);
      });
    };

    init();

    return () => {
      isMounted = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [orderId]);

  useEffect(() => {
    if (!order || !notificationsEnabled) return;

    if (previousStatus && order.status === "READY" && previousStatus !== "READY") {
      audioRef.current?.play().catch(() => {});
    }

    setPreviousStatus(order.status);
  }, [order?.status, notificationsEnabled]);

  if (loading) return <div>Loading…</div>;
  if (!order) return <div>Order not found</div>;

  return (
    
    <div style={{ padding: 20 }}>
      <audio ref={audioRef} src="/notification.mp3" preload="auto" />

      <h2>Order #{order.order_no}</h2>

      {!notificationsEnabled && (
        <div
          style={{
            marginBottom: 20,
            padding: 12,
            background: "#f3f4f6",
            borderRadius: 8,
          }}
        >
          <p style={{ marginBottom: 8 }}>
            Tap OK to enable sound notifications 🔔
          </p>

          <button
            onClick={enableNotifications}
            style={{
              padding: "6px 14px",
              background: "#2563eb",
              color: "white",
              borderRadius: 6,
              border: "none",
            }}
          >
            OK
          </button>
        </div>
      )}

      <p>Realtime status: {connectionStatus}</p>

      <p>
        Status:{" "}
        <strong
          style={{
            color:
              order.status === "READY"
                ? "green"
                : order.status === "PREPARING"
                ? "orange"
                : "gray",
          }}
        >
          {order.status}
        </strong>
      </p>

      <ul>
        {order.items.map((i) => (
          <li key={i.id}>
            {i.name} × {i.quantity}
          </li>
        ))}
      </ul>
    </div>
  );
}