import { OrderStatus } from "@/types/pos"
import type { Order, POSSettings } from "@/types/pos"

type PaymentMethod = "CASH" | "CARD" | "UPI"

type Props = {
  placedOrders: Order[]
  preparingOrders: Order[]
  readyOrders: Order[]
  collectedOrders: Order[]
  settings: POSSettings
  getOrderTime: (createdAt: string) => string
  getOrderColor: (createdAt: string) => string
  startPreparing: (id: string, minutes: number) => void
  markReady: (id: string) => void
  collectOrder: (id: string) => void
  updatePayment: (id: string, method: PaymentMethod) => void
}

type ColumnProps = {
  title: string
  emoji: string
  orders: Order[]
  settings: POSSettings
  getOrderTime: (createdAt: string) => string
  getOrderColor: (createdAt: string) => string
  startPreparing: (id: string, minutes: number) => void
  markReady: (id: string) => void
  collectOrder: (id: string) => void
  updatePayment: (id: string, method: PaymentMethod) => void
}

function OrderCard({ order, settings, getOrderTime, getOrderColor, startPreparing, markReady, collectOrder, updatePayment }: {
  order: Order
  settings: POSSettings
  getOrderTime: (createdAt: string) => string
  getOrderColor: (createdAt: string) => string
  startPreparing: (id: string, minutes: number) => void
  markReady: (id: string) => void
  collectOrder: (id: string) => void
  updatePayment: (id: string, method: PaymentMethod) => void
}) {
  const color = getOrderColor(order.created_at)
  const time = getOrderTime(order.created_at)

  return (
    <div style={{
      background: "white",
      border: "1px solid #e5e7eb",
      borderLeft: `4px solid ${color}`,
      borderRadius: 10,
      padding: "12px 14px",
      marginBottom: 8,
    }}>
      {/* Token + time */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontWeight: 800, fontSize: 15 }}>#{order.token_no}</span>
        <span style={{ fontSize: 11, color, fontWeight: 600 }}>⏱ {time}</span>
      </div>

      {/* Items */}
      <div style={{ marginBottom: 8 }}>
        {order.items?.map((item, i) => (
          <div key={i} style={{ fontSize: 12, color: "#374151", display: "flex", justifyContent: "space-between" }}>
            <span>{item.name}</span>
            <span style={{ color: "#6b7280" }}>×{item.quantity}</span>
          </div>
        ))}
      </div>

      {/* Total */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "#f97316", marginBottom: 8 }}>
        ₹{order.total?.toFixed(0)}
        {order.payment_method && (
          <span style={{ fontWeight: 400, color: "#6b7280", marginLeft: 6 }}>· {order.payment_method}</span>
        )}
      </div>

      {/* Actions */}
      {order.status === OrderStatus.PLACED && (
        <div>
          <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Start preparing in:</p>
          <div style={{ display: "flex", gap: 4 }}>
            {[5, 10, 15].map(min => (
              <button
                key={min}
                onClick={() => startPreparing(order.id, min)}
                style={{
                  flex: 1, padding: "5px 0", background: "#111", color: "white",
                  border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer"
                }}
              >{min} min</button>
            ))}
          </div>
        </div>
      )}

      {order.status === OrderStatus.PREPARING && (
        <button
          onClick={() => markReady(order.id)}
          style={{ width: "100%", padding: "7px", background: "#16a34a", color: "white", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}
        >✓ Mark Ready</button>
      )}

      {order.status === OrderStatus.READY && (
        <div style={{ display: "flex", gap: 6 }}>
          <select
            value={order.payment_method || ""}
            onChange={e => updatePayment(order.id, e.target.value as PaymentMethod)}
            style={{ flex: 1, padding: "6px 8px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 12, background: "white", color: "#111" }}
          >
            <option value="" disabled>Payment method</option>
            <option value="CASH">💵 Cash</option>
            <option value="UPI">📱 UPI</option>
            <option value="CARD">💳 Card</option>
          </select>
          <button
            disabled={!order.payment_method}
            onClick={() => collectOrder(order.id)}
            style={{
              padding: "6px 12px", background: order.payment_method ? "#111" : "#e5e7eb",
              color: order.payment_method ? "white" : "#9ca3af",
              border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700,
              cursor: order.payment_method ? "pointer" : "not-allowed"
            }}
          >Collected</button>
        </div>
      )}
    </div>
  )
}

function OrderColumn({ title, emoji, orders, settings, getOrderTime, getOrderColor, startPreparing, markReady, collectOrder, updatePayment }: ColumnProps) {
  const sorted = settings.autoSortOrders
    ? [...orders].sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
    : orders

  return (
    <div style={{ background: "#f9f9f9", borderRadius: 12, padding: "12px 12px" }}>
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
  placedOrders,
  preparingOrders,
  readyOrders,
  collectedOrders,
  settings,
  getOrderTime,
  getOrderColor,
  startPreparing,
  markReady,
  collectOrder,
  updatePayment,
}: Props) {
  const sharedProps = { settings, getOrderTime, getOrderColor, startPreparing, markReady, collectOrder, updatePayment }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111", margin: 0 }}>Orders</h2>
        <span style={{ fontSize: 13, color: "#6b7280" }}>
          {placedOrders.length + preparingOrders.length + readyOrders.length} active
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <OrderColumn title="Placed" emoji="📋" orders={placedOrders} {...sharedProps} />
        <OrderColumn title="Preparing" emoji="👨‍🍳" orders={preparingOrders} {...sharedProps} />
        <OrderColumn title="Ready" emoji="🎉" orders={readyOrders} {...sharedProps} />
        <OrderColumn title="Collected" emoji="✅" orders={collectedOrders} {...sharedProps} />
      </div>
    </div>
  )
}
