import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import "./index.css"
import { AuthProvider } from "@/contexts/AuthContext"
import { requestFCMPermission } from "@/hooks/useFCM"

// Request FCM permission after a short delay (browser requires user gesture
// first on some browsers, but this works for most cases on page load)
setTimeout(() => {
  requestFCMPermission().then(token => {
    if (token) console.log("FCM ready ✅")
  })
}, 3000)

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
)
