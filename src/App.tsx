import { BrowserRouter, Routes, Route } from "react-router-dom"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import Index from "./pages/Index"
import Login from "./pages/Login"
import OrderTracking from "@/pages/OrderTracking"
import PrintKOT from "./pages/PrintKOT"
import PrintBill from "./pages/PrintBill"
import LoyaltyCard from "@/pages/LoyaltyCard"
import CustomerSelfOrder from "@/pages/CustomerSelfOrder"
import DigitalMenu from "@/pages/DigitalMenu"
import PrintPoster from "@/pages/PrintPoster"
import TastePaletteQuestionnaire from "@/pages/TastePaletteQuestionnaire"
import TastePaletteResults from "@/pages/TastePaletteResults"

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/order/:id" element={<OrderTracking />} />
        <Route path="/print/kot" element={<PrintKOT />} />
        <Route path="/print/bill" element={<PrintBill />} />
        <Route path="/loyalty-card/:code" element={<LoyaltyCard />} />
        <Route path="/order-online/:outletId" element={<CustomerSelfOrder />} />
        <Route path="/menu/:outletId" element={<DigitalMenu />} />
        <Route path="/print/poster/:posterId" element={<PrintPoster />} />
        <Route path="/taste-palette" element={<TastePaletteQuestionnaire />} />
        <Route path="/taste-palette/results" element={<TastePaletteResults />} />
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