import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Order = {
  id: string;
  order_no: number;
  status: string;
  ready_at?: string;
};

export default function OrderTracking() {
  const { id } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

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
  }, [id]);

  if (loading) return <div style={{ padding: 20 }}>Loading...</div>;

  if (!order)
    return <div style={{ padding: 20 }}>Order not found.</div>;

  return (
    <div style={{ padding: 20, textAlign: "center" }}>
      <h2>PAHADI MOMOS 🥟</h2>
      <h3>Token #{order.order_no}</h3>
      <p>Status: <strong>{order.status}</strong></p>

      {order.ready_at && (
        <p>Estimated Ready: {new Date(order.ready_at).toLocaleTimeString()}</p>
      )}
    </div>
  );
}
