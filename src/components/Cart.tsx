import { OrderItem } from "@/types/pos";

type Props = {
  cart: OrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  onIncrease: (id: string) => void;
  onDecrease: (id: string) => void;
  onPlaceOrder: () => void;
};

const Cart = ({
  cart,
  subtotal,
  tax,
  total,
  onIncrease,
  onDecrease,
  onPlaceOrder,
}: Props) => {

  return (
    <div>
      <h2>Cart</h2>
        
      {cart.length === 0 && <p>Cart is empty</p>}

      {cart.map(item => (
        <div
          key={item.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <span>{item.name} × {item.quantity}</span>
          <span>₹{item.price * item.quantity}</span>
        </div>
      ))}

      <hr />

      <p>Subtotal: ₹{subtotal}</p>
      <p>Tax: ₹{tax}</p>
      <h3>Total: ₹{total}</h3>

      <button
        onClick={() => {
          console.log("🟢 Place Order clicked");
          onPlaceOrder();
        }}
      >
        Place Order
      </button>
    </div>
  );
};

export default Cart;
