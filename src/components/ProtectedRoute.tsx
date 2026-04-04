import { Navigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"

type Props = {
  children: React.ReactNode
  allowedRoles?: ("owner" | "manager" | "staff")[]
}

export function ProtectedRoute({ children, allowedRoles }: Props) {
  const { user, profile, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        fontFamily: "system-ui, sans-serif",
        color: "#6b7280"
      }}>
        <div>
          <p style={{ fontSize: 24, fontWeight: 700, color: "#111" }}>
            Praang
          </p>
          <p style={{ marginTop: 8 }}>Loading...</p>
        </div>
      </div>
    )
  }

  // Not logged in → go to login
  if (!user) return <Navigate to="/login" replace />

  // Logged in but wrong role → go to login
  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}