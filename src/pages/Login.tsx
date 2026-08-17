import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Eye, EyeOff } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"

type Mode = "signin" | "signup"

export default function Login() {
  const [mode, setMode] = useState<Mode>("signin")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
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
      let result
      try {
        result = await supabase.auth.signInWithPassword({ email, password })
      } catch (err: any) {
        setError(err?.message === "Failed to fetch"
          ? "Couldn't reach the server. Check your internet connection and that your Supabase project isn't paused."
          : (err?.message || "Something went wrong. Please try again."))
        setIsLoading(false)
        return
      }

      if (result.error) {
        setError(result.error.message === "Failed to fetch"
          ? "Couldn't reach the server. Check your internet connection and that your Supabase project isn't paused."
          : "Invalid email or password. Please try again.")
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

      if (password !== confirmPassword) {
        setError("Passwords don't match.")
        setIsLoading(false)
        return
      }

      let result
      try {
        result = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name }
          }
        })
      } catch (err: any) {
        setError(err?.message === "Failed to fetch"
          ? "Couldn't reach the server. Check your internet connection and that your Supabase project isn't paused."
          : (err?.message || "Something went wrong. Please try again."))
        setIsLoading(false)
        return
      }

      if (result.error) {
        const msg = result.error.message || ""
        setError(
          msg === "Failed to fetch"
            ? "Couldn't reach the server. Check your internet connection and that your Supabase project isn't paused."
            : msg.toLowerCase().includes("not been invited") || msg.toLowerCase().includes("database error")
            ? "This email hasn't been invited. Ask your admin to invite you first, then try again."
            : msg
        )
        setIsLoading(false)
        return
      }

      // Signup is invite-only as of 028_invite_only_signup.sql — if this
      // succeeded, the email was invited. Whether they can sign in right
      // away depends on the "Confirm email" setting in the Supabase
      // dashboard: if it's on, they need to click the link in the
      // confirmation email first; if it's off, they can sign in now.
      setSuccess("Account created! Check your email to confirm it, then sign in.")
      setMode("signin")
      setPassword("")
      setConfirmPassword("")
      setIsLoading(false)
    }
  }

  const toggleMode = () => {
    setMode(m => m === "signin" ? "signup" : "signin")
    setError("")
    setSuccess("")
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background font-sans p-4">
      <div className="bg-white rounded-[20px] px-8 py-10 w-full max-w-[400px] pos-shadow-lg">

        {/* Logo */}
        <div className="text-center mb-7">
          <div className="text-[44px] mb-2">🌿</div>
          <h1 className="text-[34px] font-extrabold m-0 tracking-tight text-foreground">Praang</h1>
          <p className="text-gray-500 mt-1.5 mb-0 text-[13px]">Every outlet, one courtyard</p>
        </div>

        {/* Mode toggle */}
        <div className="flex bg-muted rounded-lg p-1 mb-6 gap-1">
          <button
            onClick={() => { setMode("signin"); setError(""); setSuccess("") }}
            className={cn(
              "flex-1 py-2 border-none rounded-md text-sm font-semibold cursor-pointer transition-colors",
              mode === "signin" ? "bg-primary text-primary-foreground" : "bg-transparent text-gray-500"
            )}
          >
            Sign in
          </button>
          <button
            onClick={() => { setMode("signup"); setError(""); setSuccess("") }}
            className={cn(
              "flex-1 py-2 border-none rounded-md text-sm font-semibold cursor-pointer transition-colors",
              mode === "signup" ? "bg-primary text-primary-foreground" : "bg-transparent text-gray-500"
            )}
          >
            Sign up
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">

          {mode === "signup" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-gray-700">Your name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Rahul Sharma"
                required
                className="px-3.5 py-3 border-[1.5px] border-border rounded-lg text-[15px] outline-none text-foreground bg-white focus:ring-2 focus:ring-ring focus:border-primary"
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-semibold text-gray-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="px-3.5 py-3 border-[1.5px] border-border rounded-lg text-[15px] outline-none text-foreground bg-white focus:ring-2 focus:ring-ring focus:border-primary"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-semibold text-gray-700">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full box-border px-3.5 py-3 pr-10 border-[1.5px] border-border rounded-lg text-[15px] outline-none text-foreground bg-white focus:ring-2 focus:ring-ring focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer p-0 flex items-center"
              >
                {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
              </button>
            </div>
          </div>

          {mode === "signup" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-gray-700">Re-enter password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="px-3.5 py-3 border-[1.5px] border-border rounded-lg text-[15px] outline-none text-foreground bg-white focus:ring-2 focus:ring-ring focus:border-primary"
              />
            </div>
          )}

          {error && <div className="bg-destructive/10 border border-destructive/20 text-destructive px-3.5 py-2.5 rounded-lg text-[13px]">{error}</div>}
          {success && <div className="bg-green-50 border border-green-200 text-green-600 px-3.5 py-2.5 rounded-lg text-[13px]">{success}</div>}

          <button
            type="submit"
            disabled={isLoading}
            className={cn(
              "bg-primary text-primary-foreground border-none rounded-lg py-3.5 text-[15px] font-bold mt-1 transition-opacity",
              isLoading ? "opacity-70 cursor-not-allowed" : "cursor-pointer"
            )}
          >
            {isLoading
              ? (mode === "signin" ? "Signing in..." : "Creating account...")
              : (mode === "signin" ? "Sign in" : "Create account")
            }
          </button>

        </form>

        <p className="text-center text-[13px] text-gray-500 mt-5 mb-0">
          {mode === "signin" ? "New to Praang? " : "Already have an account? "}
          <button onClick={toggleMode} className="bg-transparent border-none text-foreground font-bold cursor-pointer text-[13px] underline">
            {mode === "signin" ? "Create account" : "Sign in"}
          </button>
        </p>

        <p className="text-center text-gray-400 text-[11px] mt-5 mb-0">
          Praang POS · Built for Indian food outlets
        </p>

      </div>
    </div>
  )
}