import { useParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Order = {
  id: string;
  order_no: number;
  status: string;
  ready_at?: string;
};

export default function OrderTracking() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { id } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  const playSound = () => {
    if (notificationsEnabled && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play();
    }
  };


  useEffect(() => {
    if (!id) return;

    // Fetch initial data
    const fetchOrder = async () => {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("id", id)
        .single();

      setOrder(data);
      setLoading(false);
    };

    fetchOrder();

    // Realtime subscription
    const channel = supabase
      .channel("order-realtime")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `id=eq.${id}`,
        },
        (payload) => {
          setOrder(payload.new as any);
          playSound();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);


  if (loading) return <div style={{ padding: 20 }}>Loading...</div>;

  if (!order)
    return <div style={{ padding: 20 }}>Order not found.</div>;

  const enableNotifications = async () => {
    if (audioRef.current) {
      try {
        await audioRef.current.play(); // unlock audio
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        setNotificationsEnabled(true);
      } catch (err) {
        alert("Audio blocked by browser");
      }
    }
  };


  return (
    <>
      <audio ref={audioRef} src="/notification.mp3" preload="auto" />

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

      <div style={{ padding: 20, textAlign: "center" }}>
        <h2>PAHADI MOMOS 🥟</h2>
        <h3>Token #{order.order_no}</h3>
        <p>
          Status: <strong>{order.status}</strong>
        </p>

        {order.status === "PREPARING" && order.ready_at && (
          <p>
            Estimated Ready:{" "}
            {new Date(order.ready_at).toLocaleTimeString()}
          </p>
        )}
      </div>
    </>
  );

}
