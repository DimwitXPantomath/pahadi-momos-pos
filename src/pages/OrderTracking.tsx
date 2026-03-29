import { useParams } from "react-router-dom";
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

type OrderItem = {
  name: string;
  quantity: number;
  price: number;
};

type Order = {
  id: string;
  order_no: number;
  token_no: number;
  status: "PLACED" | "PREPARING" | "READY" | "COLLECTED";
  ready_at?: string | null;
  items: OrderItem[];
  total: number;
};

const STATUS_CONFIG = {
  PLACED: {
    label: "Order Received",
    emoji: "📋",
    color: "#6b7280",
    bg: "#f3f4f6",
    message: "Your order has been received and will be prepared soon.",
  },
  PREPARING: {
    label: "Being Prepared",
    emoji: "👨‍🍳",
    color: "#d97706",
    bg: "#fffbeb",
    message: "Your order is being prepared. Hang tight!",
  },
  READY: {
    label: "Ready for Pickup!",
    emoji: "🎉",
    color: "#16a34a",
    bg: "#f0fdf4",
    message: "Your order is ready! Please collect it from the counter.",
  },
  COLLECTED: {
    label: "Collected",
    emoji: "✅",
    color: "#6b7280",
    bg: "#f3f4f6",
    message: "Order collected. Thank you for visiting!",
  },
};

export default function OrderTracking() {
  const { id } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [justUpdated, setJustUpdated] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const notificationsRef = useRef(false);

  useEffect(() => {
    notificationsRef.current = notificationsEnabled;
  }, [notificationsEnabled]);

  const playSound = useCallback(() => {
    if (notificationsRef.current && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  }, []);

  const flashUpdate = useCallback(() => {
    setJustUpdated(true);
    setTimeout(() => setJustUpdated(false), 2000);
  }, []);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    const fetchOrder = async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", id)
        .single();

      if (error) console.error("Failed to fetch order:", error);
      setOrder(data ?? null);
      setLoading(false);
    };

    fetchOrder();

    const channel = supabase
      .channel(`order-tracking-${id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `id=eq.${id}`,
        },
        (payload) => {
          setOrder(payload.new as Order);
          playSound();
          flashUpdate();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, playSound, flashUpdate]);

  const enableNotifications = async () => {
    if (!audioRef.current) return;
    try {
      await audioRef.current.play();
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setNotificationsEnabled(true);
    } catch {
      alert("Could not enable sound. Please check your browser settings.");
    }
  };

  if (loading) {
    return (
      <div style={styles.centered}>
        <p style={{ fontSize: 32 }}>⏳</p>
        <p style={{ color: "#6b7280", marginTop: 12 }}>Loading your order…</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div style={styles.centered}>
        <p style={{ fontSize: 48 }}>😕</p>
        <h2 style={{ margin: "12px 0 8px" }}>Order Not Found</h2>
        <p style={{ color: "#6b7280", textAlign: "center", maxWidth: 280 }}>
          This order link may have expired or the order ID is incorrect.
        </p>
      </div>
    );
  }

  const config = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.PLACED;
  const orderItems: OrderItem[] = Array.isArray(order.items) ? order.items : [];

  return (
    <>
      <audio ref={audioRef} src="/notification.mp3" preload="auto" />

      <div style={styles.page}>

        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.headerTitle}>🥟 PAHADI MOMOS</h1>
          <p style={styles.headerSub}>Order Tracker</p>
        </div>

        {/* Token card */}
        <div
          style={{
            ...styles.tokenCard,
            border: `2px solid ${config.color}`,
            background: justUpdated ? config.bg : "white",
            transition: "background 0.5s ease",
          }}
        >
          <p style={styles.tokenLabel}>Your Token</p>
          <p style={{ ...styles.tokenNumber, color: config.color }}>
            #{order.token_no ?? order.order_no}
          </p>
        </div>

        {/* Status card */}
        <div style={{ ...styles.statusCard, background: config.bg }}>
          <p style={{ fontSize: 40, marginBottom: 8 }}>{config.emoji}</p>
          <p style={{ ...styles.statusLabel, color: config.color }}>
            {config.label}
          </p>
          <p style={styles.statusMessage}>{config.message}</p>

          {order.status === "PREPARING" && order.ready_at && (
            <p style={styles.readyTime}>
              ⏱ Estimated ready at{" "}
              <strong>
                {new Date(order.ready_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </strong>
            </p>
          )}
        </div>

        {/* Order items */}
        {orderItems.length > 0 && (
          <div style={styles.itemsCard}>
            <p style={styles.itemsTitle}>Your Order</p>
            {orderItems.map((item, i) => (
              <div key={i} style={styles.itemRow}>
                <span>{item.name}</span>
                <span style={{ color: "#6b7280" }}>× {item.quantity}</span>
              </div>
            ))}
            <div style={styles.divider} />
            <div style={{ ...styles.itemRow, fontWeight: 700 }}>
              <span>Total</span>
              <span>₹{order.total?.toFixed(2) ?? "–"}</span>
            </div>
          </div>
        )}

        {/* Sound notification */}
        {!notificationsEnabled && order.status !== "COLLECTED" && (
          <button style={styles.notifButton} onClick={enableNotifications}>
            🔔 Tap to get sound alert when ready
          </button>
        )}

        {notificationsEnabled && (
          <p style={styles.notifEnabled}>🔔 Sound notifications are on</p>
        )}

        {/* Progress steps */}
        <div style={styles.stepsRow}>
          {(["PLACED", "PREPARING", "READY", "COLLECTED"] as const).map(
            (step, i) => {
              const stepConfig = STATUS_CONFIG[step];
              const currentIndex = ["PLACED", "PREPARING", "READY", "COLLECTED"].indexOf(order.status);
              const isActive = currentIndex >= i;
              return (
                <div key={step} style={styles.step}>
                  <div
                    style={{
                      ...styles.stepDot,
                      background: isActive ? config.color : "#e5e7eb",
                    }}
                  />
                  <p
                    style={{
                      ...styles.stepLabel,
                      color: isActive ? config.color : "#9ca3af",
                      fontWeight: order.status === step ? 700 : 400,
                    }}
                  >
                    {stepConfig.emoji}
                  </p>
                </div>
              );
            }
          )}
        </div>

        <p style={styles.footer}>
          This page updates automatically — no need to refresh!
        </p>
      </div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 420,
    margin: "0 auto",
    padding: "24px 16px 48px",
    fontFamily: "system-ui, sans-serif",
  },
  centered: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    padding: 24,
    fontFamily: "system-ui, sans-serif",
  },
  header: {
    textAlign: "center",
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 800,
    margin: 0,
  },
  headerSub: {
    color: "#6b7280",
    margin: "4px 0 0",
    fontSize: 14,
  },
  tokenCard: {
    borderRadius: 16,
    padding: "20px 24px",
    textAlign: "center",
    marginBottom: 16,
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
  },
  tokenLabel: {
    margin: 0,
    fontSize: 13,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  tokenNumber: {
    margin: "4px 0 0",
    fontSize: 52,
    fontWeight: 900,
    lineHeight: 1,
  },
  statusCard: {
    borderRadius: 16,
    padding: "24px 20px",
    textAlign: "center",
    marginBottom: 16,
  },
  statusLabel: {
    fontSize: 20,
    fontWeight: 700,
    margin: "0 0 8px",
  },
  statusMessage: {
    color: "#374151",
    margin: 0,
    fontSize: 15,
    lineHeight: 1.5,
  },
  readyTime: {
    marginTop: 12,
    fontSize: 14,
    color: "#374151",
  },
  itemsCard: {
    background: "white",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: "16px 20px",
    marginBottom: 16,
  },
  itemsTitle: {
    fontWeight: 700,
    margin: "0 0 12px",
    fontSize: 15,
  },
  itemRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 15,
    padding: "6px 0",
  },
  divider: {
    borderTop: "1px solid #e5e7eb",
    margin: "8px 0",
  },
  notifButton: {
    width: "100%",
    padding: "14px",
    background: "#1d4ed8",
    color: "white",
    border: "none",
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    marginBottom: 16,
  },
  notifEnabled: {
    textAlign: "center",
    color: "#16a34a",
    fontSize: 14,
    marginBottom: 16,
  },
  stepsRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 8px",
    marginBottom: 16,
  },
  step: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: "50%",
  },
  stepLabel: {
    fontSize: 20,
    margin: 0,
  },
  footer: {
    textAlign: "center",
    color: "#9ca3af",
    fontSize: 13,
  },
};
