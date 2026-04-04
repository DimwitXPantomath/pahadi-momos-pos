import { BrowserRouter, Routes, Route } from "react-router-dom"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import Index from "./pages/Index"
import Login from "./pages/Login"
import OrderTracking from "@/pages/OrderTracking"
import PrintKOT from "./pages/PrintKOT"
import PrintBill from "./pages/PrintBill"

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/order/:id" element={<OrderTracking />} />
        <Route path="/print/kot" element={<PrintKOT />} />
        <Route path="/print/bill" element={<PrintBill />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Index />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App