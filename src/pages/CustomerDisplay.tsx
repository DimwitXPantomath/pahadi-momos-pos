import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { OrderStatus } from "@/types/pos"

type Order = {
  id: string
  token_no: number
  status: OrderStatus
}

export default function CustomerDisplay() {
  const [orders, setOrders] = useState<Order[]>([])

  useEffect(() => {
    const fetchOrders = async () => {
      const { data } = await supabase
        .from("orders")
        .select("*")

      if (data) setOrders(data)
    }

    fetchOrders()

    const channel = supabase
      .channel("display-orders")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
        },
        (payload) => {
          const updated = payload.new as Order

          setOrders(prev => {
            const exists = prev.find(o => o.id === updated.id)

            if (exists) {
              return prev.map(o =>
                o.id === updated.id ? updated : o
              )
            }

            return [updated, ...prev]
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const preparing = orders.filter(o => o.status === OrderStatus.PREPARING)
  const ready = orders.filter(o => o.status === OrderStatus.READY)

  return (
    <div style={{ padding: 20 }}>
      <h1>Order Display</h1>

      <h2>Preparing</h2>
      <div style={{ display: "flex", gap: 10 }}>
        {preparing.map(o => (
          <div key={o.id}>{o.token_no}</div>
        ))}
      </div>

      <h2 style={{ marginTop: 20 }}>Ready</h2>
      <div style={{ display: "flex", gap: 10 }}>
        {ready.map(o => (
          <div key={o.id} style={{ color: "green", fontWeight: "bold" }}>
            {o.token_no}
          </div>
        ))}
      </div>
    </div>
  )
}