import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "@/lib/supabase"

type Mode = "signin" | "signup"

export default function Login() {
  const [mode, setMode] = useState<Mode>("signin")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess("")
    setIsLoading(true)

    if (mode === "signin") {
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

    } else {
      // Sign up
      if (!name.trim()) {
        setError("Please enter your name.")
        setIsLoading(false)
        return
      }

      if (password.length < 6) {
        setError("Password must be at least 6 characters.")
        setIsLoading(false)
        return
      }

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name }
        }
      })

      if (error) {
        setError(error.message)
        setIsLoading(false)
        return
      }

      setSuccess("Account created! You can now sign in.")
      setMode("signin")
      setPassword("")
      setIsLoading(false)
    }
  }

  const toggleMode = () => {
    setMode(m => m === "signin" ? "signup" : "signin")
    setError("")
    setSuccess("")
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>

        {/* Logo */}
        <div style={styles.logoArea}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>🌿</div>
          <h1 style={styles.logoText}>Praang</h1>
          <p style={styles.tagline}>Every outlet, one courtyard</p>
        </div>

        {/* Mode toggle */}
        <div style={styles.modeToggle}>
          <button
            onClick={() => { setMode("signin"); setError(""); setSuccess("") }}
            style={{
              ...styles.modeBtn,
              background: mode === "signin" ? "#111" : "transparent",
              color: mode === "signin" ? "white" : "#6b7280",
            }}
          >
            Sign in
          </button>
          <button
            onClick={() => { setMode("signup"); setError(""); setSuccess("") }}
            style={{
              ...styles.modeBtn,
              background: mode === "signup" ? "#111" : "transparent",
              color: mode === "signup" ? "white" : "#6b7280",
            }}
          >
            Sign up
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={styles.form}>

          {mode === "signup" && (
            <div style={styles.field}>
              <label style={styles.label}>Your name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Rahul Sharma"
                required
                style={styles.input}
              />
            </div>
          )}

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

          {error && <div style={styles.error}>{error}</div>}
          {success && <div style={styles.successMsg}>{success}</div>}

          <button
            type="submit"
            disabled={isLoading}
            style={{
              ...styles.button,
              opacity: isLoading ? 0.7 : 1,
              cursor: isLoading ? "not-allowed" : "pointer",
            }}
          >
            {isLoading
              ? (mode === "signin" ? "Signing in..." : "Creating account...")
              : (mode === "signin" ? "Sign in" : "Create account")
            }
          </button>

        </form>

        <p style={styles.switchText}>
          {mode === "signin" ? "New to Praang? " : "Already have an account? "}
          <button onClick={toggleMode} style={styles.switchBtn}>
            {mode === "signin" ? "Create account" : "Sign in"}
          </button>
        </p>

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
    background: "#f5f5f0",
    fontFamily: "system-ui, sans-serif",
    padding: 16,
  },
  card: {
    background: "white",
    borderRadius: 20,
    padding: "40px 32px",
    width: "100%",
    maxWidth: 400,
    boxShadow: "0 2px 24px rgba(0,0,0,0.08)",
  },
  logoArea: {
    textAlign: "center",
    marginBottom: 28,
  },
  logoText: {
    fontSize: 34,
    fontWeight: 800,
    margin: 0,
    letterSpacing: "-1px",
    color: "#111",
  },
  tagline: {
    color: "#6b7280",
    margin: "6px 0 0",
    fontSize: 13,
  },
  modeToggle: {
    display: "flex",
    background: "#f3f4f6",
    borderRadius: 10,
    padding: 4,
    marginBottom: 24,
    gap: 4,
  },
  modeBtn: {
    flex: 1,
    padding: "8px 0",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: "#374151",
  },
  input: {
    padding: "12px 14px",
    border: "1.5px solid #e5e7eb",
    borderRadius: 10,
    fontSize: 15,
    outline: "none",
    color: "#111",
    background: "white",
  },
  error: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#dc2626",
    padding: "10px 14px",
    borderRadius: 8,
    fontSize: 13,
  },
  successMsg: {
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    color: "#16a34a",
    padding: "10px 14px",
    borderRadius: 8,
    fontSize: 13,
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
  switchText: {
    textAlign: "center",
    fontSize: 13,
    color: "#6b7280",
    marginTop: 20,
    marginBottom: 0,
  },
  switchBtn: {
    background: "none",
    border: "none",
    color: "#111",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: 13,
    textDecoration: "underline",
  },
  footer: {
    textAlign: "center",
    color: "#9ca3af",
    fontSize: 11,
    marginTop: 20,
    marginBottom: 0,
  },
}