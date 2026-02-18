import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import CustomerOrder from "./pages/CustomerOrder";
import PrintKOT from "./pages/PrintKOT";
import PrintBill from "./pages/PrintBill";
import OrderStatus from "./pages/OrderStatus";
import OrderPage from "@/pages/OrderPage";


const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/order/:id" element={<OrderPage />} />
        <Route path="/order/:orderId" element={<OrderStatus />} />
        <Route path="/" element={<Index />} />
        <Route path="/print/kot" element={<PrintKOT />} />
        <Route path="/print/bill" element={<PrintBill />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
