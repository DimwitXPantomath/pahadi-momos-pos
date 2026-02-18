import type { Order } from "@/types/pos";



type Props = {
  orders: Order[];
  onMarkReady: (id: string) => void;
};

const Orders = ({ orders, onMarkReady }: Props) => {
  return (
    <div>
      <h2>Orders</h2>

      {orders.length === 0 && <p>No orders yet</p>}

      {orders.map((order) => (
        <div key={order.id} style={{ marginBottom: 10 }}>
          <strong>{order.id}</strong> — {order.status}

          {order.status === "PLACED" && (
            <button onClick={() => onMarkReady(order.id)}>
              Mark Ready
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

export default Orders;
