import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

const CustomerOrder = () => {
  const { orderId } = useParams();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // force re-render every second for countdown
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const tick = setInterval(() => {
      forceUpdate((v) => v + 1);
    }, 1000);

    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!orderId) return;

    const fetchOrder = async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .single();

      if (!error && data) {
        setOrder(data);
      }

      setLoading(false);
    };

    fetchOrder();

    const channel = supabase
      .channel("order-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          setOrder(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId]);

  const getRemainingSeconds = (readyAt: string) => {
    const diffMs = new Date(readyAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diffMs / 1000));
  };

  if (loading) {
    return <p className="p-6 text-center">Loading order…</p>;
  }

  if (!order) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-xl font-semibold">Order not found</h2>
      </div>
    );
  }

  const remainingSeconds =
    order.status === "PREPARING" && order.ready_at
      ? getRemainingSeconds(order.ready_at)
      : null;

  return (
    <div className="min-h-screen bg-gray-100 flex items-start justify-center">
      <div className="max-w-md w-full mt-12 bg-white p-6 rounded-2xl shadow-lg">
        
        <h1 className="text-xl font-bold text-center mb-2">
          Your Order
        </h1>

        <p className="text-center text-sm text-gray-500 mb-4">
          Order ID: {order.id}
        </p>

        {/* Status headline */}
        <h2 className="text-2xl font-bold text-center mb-4">
          {order.status === "PREPARING" && "🍳 Your food is being prepared"}
          {order.status === "READY" && "✅ Your order is ready to collect"}
        </h2>

        {/* Countdown */}
        {order.status === "PREPARING" && order.ready_at && (
          <div className="text-center mt-4">
            {remainingSeconds !== null && remainingSeconds > 60 ? (
              <h3 className="text-lg font-semibold">
                ⏳ Estimated time left:{" "}
                <span className="text-indigo-600">
                  {Math.ceil(remainingSeconds / 60)} min
                </span>
              </h3>
            ) : (
              <h3 className="text-lg font-semibold">
                ⏳ <span className="text-indigo-600">Almost ready</span>
              </h3>
            )}

            <p className="text-sm text-gray-500 mt-2">
              Please wait near the pickup counter
            </p>
          </div>
        )}

        {/* Ready message */}
        {order.status === "READY" && (
          <div className="text-center mt-6">
            <h3 className="text-green-600 text-lg font-bold">
              🎉 Please collect your order
            </h3>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerOrder;
