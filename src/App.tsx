import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import PrintKOT from "./pages/PrintKOT";
import PrintBill from "./pages/PrintBill";
import OrderTracking from "@/pages/OrderTracking";

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/order/:id" element={<OrderTracking />} />
        <Route path="/print/kot" element={<PrintKOT />} />
        <Route path="/print/bill" element={<PrintBill />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;