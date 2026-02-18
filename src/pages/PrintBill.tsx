import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import QRCode from "react-qr-code";
import { useNavigate } from "react-router-dom";



const PrintBill = () => {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { order, outlet, orderUrl } = state || {};
        useEffect(() => {
  const timer = setTimeout(() => {
    window.print();
  }, 500);

  return () => clearTimeout(timer);
}, []);

  if (!order) {
    return <p>No bill data</p>;
  }

  return (
    
    <div
  style={{
    width: "280px",
    margin: "0 auto",
    padding: 16,
    fontFamily: "monospace",
    fontSize: "14px",
  }}
>
      <h2 style={{ textAlign: "center" }}>{outlet?.name}</h2>
      <p style={{ textAlign: "center" }}>{outlet?.address}</p>

      <hr />

      <p><strong>Order ID:</strong> {order.id}</p>
      <p><strong>Date:</strong> {new Date().toLocaleString()}</p>

      <hr />

      {order.items.map((item: any) => (
        <div
          key={item.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 6,
          }}
        >
          <span>
            {item.name} x{item.quantity}
          </span>
          <span>
            ₹{(item.price * item.quantity).toFixed(2)}
          </span>
        </div>
      ))}

      <hr />

      <p><strong>Total:</strong> ₹{order.total}</p>

      <div style={{ marginTop: 16, textAlign: "center" }}>
        <QRCode value={orderUrl} size={100} />
        <p style={{ fontSize: 12 }}>
          Scan to track your order
        </p>
      </div>

      <hr />
        
      <p style={{ textAlign: "center" }}>
        Thank you!
      </p>
    </div>
  );
};

export default PrintBill;
