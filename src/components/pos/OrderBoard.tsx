import { useState } from "react"
import { OrderStatus } from "@/types/pos"
import type { Order, POSSettings } from "@/types/pos"

type PaymentMethod = "CASH" | "CARD" | "UPI"

type Props = {
  placedOrders: Order[]
  preparingOrders: Order[]
  readyOrders: Order[]
  collectedOrders: Order[]
  settings: POSSettings
  getOrderTime: (createdAt: string, closedAt?: string | null) => string
  getOrderColor: (createdAt: string) => string
  startPreparing: (id: string, minutes: number) => void
  markReady: (id: string) => void
  collectOrder: (id: string) => void
  updatePayment: (id: string, method: PaymentMethod) => void
}

type ColumnProps = Props & { title: string; emoji: string; orders: Order[] }

function OrderCard({
  order, settings, getOrderTime, getOrderColor,
  startPreparing, markReady, collectOrder, updatePayment
}: {
  order: Order
  settings: POSSettings
  getOrderTime: (createdAt: string, closedAt?: string | null) => string
  getOrderColor: (createdAt: string) => string
  startPreparing: (id: string, minutes: number) => void
  markReady: (id: string) => void
  collectOrder: (id: string) => void
  updatePayment: (id: string, method: PaymentMethod) => void
}) {
  const isCollected = order.status === OrderStatus.COLLECTED
  // Timer stops when collected
  const time = getOrderTime(order.created_at, order.closed_at)
  const color = isCollected ? "#9ca3af" : getOrderColor(order.created_at)

  // Payment pre-filled from order, still changeable in READY state
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>(
    (order.payment_method as PaymentMethod) || "CASH"
  )

  const handlePaymentChange = (method: PaymentMethod) => {
    setSelectedPayment(method)
    updatePayment(order.id, method)
  }

  const handleCollect = () => {
    collectOrder(order.id)
  }

  return (
    <div style={{
      background: "white",
      border: "1px solid #e5e7eb",
      borderLeft: `4px solid ${color}`,
      borderRadius: 10,
      padding: "12px 14px",
      marginBottom: 8,
      opacity: isCollected ? 0.75 : 1,
    }}>
      {/* Token + time */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontWeight: 800, fontSize: 15 }}>
          #{order.token_no || "—"}
        </span>
        <span style={{ fontSize: 11, color, fontWeight: 600 }}>
          {isCollected ? "✅ Done" : `⏱ ${time}`}
        </span>
      </div>

      {/* Items */}
      <div style={{ marginBottom: 8 }}>
        {order.items?.map((item: any, i: number) => (
          <div key={i} style={{ fontSize: 12, color: "#374151", display: "flex", justifyContent: "space-between" }}>
            <span>{item.name}</span>
            <span style={{ color: "#6b7280" }}>×{item.quantity}</span>
          </div>
        ))}
      </div>

      {/* Total + payment */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "#f97316", marginBottom: 8 }}>
        ₹{order.total?.toFixed(0)}
        <span style={{ fontWeight: 400, color: "#6b7280", marginLeft: 6 }}>
          · {order.payment_method || selectedPayment}
        </span>
      </div>

      {/* PLACED actions */}
      {order.status === OrderStatus.PLACED && (
        <div>
          <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Start preparing in:</p>
          <div style={{ display: "flex", gap: 4 }}>
            {[5, 10, 15].map(min => (
              <button
                key={min}
                onClick={() => {
                  console.log("startPreparing called:", order.id, min)
                  startPreparing(order.id, min)
                }}
                style={{
                  flex: 1, padding: "6px 0",
                  background: "#111", color: "white",
                  border: "none", borderRadius: 6,
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >{min} min</button>
            ))}
          </div>
        </div>
      )}

      {/* PREPARING actions */}
      {order.status === OrderStatus.PREPARING && (
        <div>
          {order.ready_at && (
            <p style={{ fontSize: 11, color: "#f97316", marginBottom: 6 }}>
              ⏱ Ready by {new Date(order.ready_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
          <button
            onClick={() => markReady(order.id)}
            style={{
              width: "100%", padding: "7px",
              background: "#16a34a", color: "white",
              border: "none", borderRadius: 8,
              fontWeight: 700, fontSize: 13, cursor: "pointer"
            }}
          >✓ Mark Ready</button>
        </div>
      )}

      {/* READY actions — payment pre-filled, still changeable */}
      {order.status === OrderStatus.READY && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 4 }}>
            {(["CASH", "UPI", "CARD"] as PaymentMethod[]).map(method => (
              <button
                key={method}
                onClick={() => handlePaymentChange(method)}
                style={{
                  flex: 1, padding: "5px 0",
                  border: "1.5px solid",
                  borderColor: selectedPayment === method ? "#111" : "#e5e7eb",
                  background: selectedPayment === method ? "#111" : "white",
                  color: selectedPayment === method ? "white" : "#374151",
                  borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                }}
              >
                {method === "CASH" ? "💵" : method === "UPI" ? "📱" : "💳"} {method}
              </button>
            ))}
          </div>
          <button
            onClick={handleCollect}
            style={{
              width: "100%", padding: "8px",
              background: "#111", color: "white",
              border: "none", borderRadius: 8,
              fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}
          >✓ Collected</button>
        </div>
      )}
    </div>
  )
}

function OrderColumn({ title, emoji, orders, settings, getOrderTime, getOrderColor, startPreparing, markReady, collectOrder, updatePayment }: ColumnProps) {
  const sorted = settings.autoSortOrders
    ? [...orders].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    : orders

  return (
    <div style={{ background: "#f9f9f9", borderRadius: 12, padding: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>{emoji} {title}</h3>
        <span style={{ background: "#e5e7eb", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>{orders.length}</span>
      </div>
      {sorted.length === 0 ? (
        <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", padding: "16px 0" }}>No orders</p>
      ) : sorted.map(order => (
        <OrderCard
          key={order.id}
          order={order}
          settings={settings}
          getOrderTime={getOrderTime}
          getOrderColor={getOrderColor}
          startPreparing={startPreparing}
          markReady={markReady}
          collectOrder={collectOrder}
          updatePayment={updatePayment}
        />
      ))}
    </div>
  )
}

export default function OrderBoard({
  placedOrders, preparingOrders, readyOrders, collectedOrders,
  settings, getOrderTime, getOrderColor,
  startPreparing, markReady, collectOrder, updatePayment,
}: Props) {
  const shared = { settings, getOrderTime, getOrderColor, startPreparing, markReady, collectOrder, updatePayment }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111", margin: 0 }}>Orders</h2>
        <span style={{ fontSize: 13, color: "#6b7280" }}>
          {placedOrders.length + preparingOrders.length + readyOrders.length} active
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <OrderColumn title="Placed" emoji="📋" orders={placedOrders} {...shared} />
        <OrderColumn title="Preparing" emoji="👨‍🍳" orders={preparingOrders} {...shared} />
        <OrderColumn title="Ready" emoji="🎉" orders={readyOrders} {...shared} />
        <OrderColumn title="Collected" emoji="✅" orders={collectedOrders} {...shared} />
      </div>
    </div>
  )
}
