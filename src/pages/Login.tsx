import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/AuthContext"

export default function Login() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()
  const { profile } = useAuth()

  // If already logged in, redirect based on role
  if (profile) {
    if (profile.role === "owner") navigate("/", { replace: true })
    else if (profile.role === "manager") navigate("/", { replace: true })
    else navigate("/", { replace: true })
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError("Invalid email or password. Please try again.")
      setIsLoading(false)
      return
    }

    navigate("/", { replace: true })
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>

        {/* Logo */}
        <div style={styles.logoArea}>
          <div style={styles.logoIcon}>🌿</div>
          <h1 style={styles.logoText}>Praang</h1>
          <p style={styles.tagline}>Every outlet, one courtyard</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} style={styles.form}>

          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={styles.input}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={styles.input}
            />
          </div>

          {error && (
            <div style={styles.error}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            style={{
              ...styles.button,
              opacity: isLoading ? 0.7 : 1,
              cursor: isLoading ? "not-allowed" : "pointer",
            }}
          >
            {isLoading ? "Signing in..." : "Sign in"}
          </button>

        </form>

        <p style={styles.footer}>
          Praang POS · Built for Indian food outlets
        </p>

      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f9f7f4",
    fontFamily: "system-ui, sans-serif",
    padding: 16,
  },
  card: {
    background: "white",
    borderRadius: 20,
    padding: "40px 36px",
    width: "100%",
    maxWidth: 400,
    boxShadow: "0 2px 24px rgba(0,0,0,0.08)",
  },
  logoArea: {
    textAlign: "center",
    marginBottom: 32,
  },
  logoIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  logoText: {
    fontSize: 32,
    fontWeight: 800,
    margin: 0,
    letterSpacing: "-1px",
    color: "#111",
  },
  tagline: {
    color: "#6b7280",
    margin: "6px 0 0",
    fontSize: 14,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: 600,
    color: "#374151",
  },
  input: {
    padding: "12px 14px",
    border: "1.5px solid #e5e7eb",
    borderRadius: 10,
    fontSize: 15,
    outline: "none",
    transition: "border-color 0.2s",
    color: "#111",
  },
  error: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#dc2626",
    padding: "10px 14px",
    borderRadius: 8,
    fontSize: 14,
  },
  button: {
    background: "#111",
    color: "white",
    border: "none",
    borderRadius: 10,
    padding: "14px",
    fontSize: 15,
    fontWeight: 700,
    marginTop: 4,
    transition: "opacity 0.2s",
  },
  footer: {
    textAlign: "center",
    color: "#9ca3af",
    fontSize: 12,
    marginTop: 28,
    marginBottom: 0,
  },
}