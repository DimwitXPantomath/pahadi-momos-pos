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
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        fontFamily: "system-ui, sans-serif",
        gap: 12,
        background: "#f5f5f0"
      }}>
        <div style={{ fontSize: 36 }}>🌿</div>
        <p style={{ fontSize: 22, fontWeight: 800, color: "#111", letterSpacing: "-0.5px" }}>
          Praang
        </p>
        <p style={{ color: "#6b7280", fontSize: 14 }}>Loading...</p>
      </div>
    )
  }

  // Not logged in → go to login
  if (!user) return <Navigate to="/login" replace />

  // Logged in but wrong role, OR role couldn't be determined → fail closed.
  // This used to fail OPEN when `profile` was null ("better than locking
  // them out"), which meant any profile-fetch hiccup silently bypassed
  // role restrictions entirely. The actual cause of profile fetches
  // failing (profiles insert using a column that didn't exist — see
  // AuthContext.tsx) is fixed now, so this shouldn't fire in normal use;
  // when it does fire, real authorization still lives in RLS (see
  // 015/016_*.sql) — this is UX, not the security boundary.
  if (allowedRoles && (!profile || !allowedRoles.includes(profile.role))) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}