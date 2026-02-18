import { useEffect } from "react";
import { useLocation } from "react-router-dom";


const PrintKOT = () => {
  const { state } = useLocation();
  const { order, outlet } = state || {};
        useEffect(() => {
  const timer = setTimeout(() => {
    window.print();
  }, 500);

  return () => clearTimeout(timer);
}, []);

  if (!order) {
    return <p>No order data</p>;
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
      <h2 style={{ textAlign: "center" }}>KOT</h2>
      <hr />

      <p><strong>Outlet:</strong> {outlet?.name}</p>
      <p><strong>Order ID:</strong> {order.id}</p>
      <p><strong>Time:</strong> {new Date().toLocaleTimeString()}</p>

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
          <span>{item.name}</span>
          <span>x{item.quantity}</span>
        </div>
      ))}

      <hr />

      <p style={{ textAlign: "center" }}>
        --- Kitchen Copy ---
      </p>
    </div>
  );
};

export default PrintKOT;
