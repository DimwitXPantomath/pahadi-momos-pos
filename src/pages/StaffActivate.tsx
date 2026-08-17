import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Eye, EyeOff } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"

// Public route (no auth needed to view — the person doesn't have an
// account yet). Second half of the invite-only signup gate
// (028_invite_only_signup.sql): an owner/manager generates a code on
// the Staff screen and hands it to this person directly (no SMS —
// real phone OTP isn't available in this project, see
// useCustomerAuth.ts). This page checks the code, creates the
// account, then verifies their email with a real Supabase-sent code
// (free, unlike SMS) before letting them in.

type Step = "form" | "otp"

export default function StaffActivate() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>("form")

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  const [otp, setOtp] = useState("")

  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!name.trim()) { setError("Please enter your name."); return }
    if (!email.trim()) { setError("Please enter your email."); return }
    if (!code.trim()) { setError("Please enter the code your admin gave you."); return }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return }
    if (password !== confirmPassword) { setError("Passwords don't match."); return }

    setIsLoading(true)

    // Pre-check the code with a clean, specific error before touching
    // signUp() — Supabase's auth server can wrap raw Postgres trigger
    // errors in a generic "Database error saving new user" message
    // instead of surfacing the exact reason, so this catches the most
    // common failure (wrong/used/expired code) with a message that
    // actually explains what to do.
    const { data: valid, error: rpcError } = await supabase.rpc("validate_staff_invite", {
      p_email: email.trim(),
      p_code: code.trim(),
    })

    if (rpcError) {
      setError("Couldn't check your code right now. Please try again.")
      setIsLoading(false)
      return
    }

    if (!valid) {
      setError("That code doesn't match this email, or it's expired/already used. Double-check with whoever gave it to you.")
      setIsLoading(false)
      return
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { name: name.trim(), invite_code: code.trim() },
      },
    })

    if (signUpError) {
      const msg = signUpError.message || ""
      setError(
        msg === "Failed to fetch"
          ? "Couldn't reach the server. Check your internet connection."
          : msg.toLowerCase().includes("database error")
          ? "Something went wrong creating your account. Ask your admin to double-check the code and try again."
          : msg
      )
      setIsLoading(false)
      return
    }

    setIsLoading(false)

    // If a session came back immediately, email confirmation isn't
    // required (the "Confirm email" toggle is off in the Supabase
    // dashboard) — just go straight in.
    if (data.session) {
      navigate("/", { replace: true })
      return
    }

    setStep("otp")
  }

  const submitOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!otp.trim()) { setError("Enter the code from your email."); return }
    setIsLoading(true)

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp.trim(),
      type: "signup",
    })

    setIsLoading(false)

    if (verifyError) {
      setError(verifyError.message || "Couldn't verify that code. Please try again.")
      return
    }

    navigate("/", { replace: true })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background font-sans p-4">
      <div className="bg-white rounded-[20px] px-8 py-10 w-full max-w-[420px] pos-shadow-lg">

        <div className="text-center mb-7">
          <div className="text-[44px] mb-2">🌿</div>
          <h1 className="text-[28px] font-extrabold m-0 tracking-tight text-foreground">Activate your account</h1>
          <p className="text-gray-500 mt-1.5 mb-0 text-[13px]">
            {step === "form" ? "Enter the code your admin gave you." : "Enter the code we emailed you."}
          </p>
        </div>

        {step === "form" ? (
          <form onSubmit={submitForm} className="flex flex-col gap-[16px]">
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-gray-700">Your name</label>
              <input
                type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. Priya Verma" required
                className="px-3.5 py-3 border-[1.5px] border-border rounded-lg text-[15px] outline-none text-foreground bg-white focus:ring-2 focus:ring-ring focus:border-primary"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-gray-700">Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" required
                className="px-3.5 py-3 border-[1.5px] border-border rounded-lg text-[15px] outline-none text-foreground bg-white focus:ring-2 focus:ring-ring focus:border-primary"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-gray-700">Activation code</label>
              <input
                type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. K7QX9M2P" required
                className="px-3.5 py-3 border-[1.5px] border-border rounded-lg text-[15px] outline-none text-foreground bg-white font-mono tracking-widest focus:ring-2 focus:ring-ring focus:border-primary"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-gray-700">Choose a password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required
                  className="w-full box-border px-3.5 py-3 pr-10 border-[1.5px] border-border rounded-lg text-[15px] outline-none text-foreground bg-white focus:ring-2 focus:ring-ring focus:border-primary"
                />
                <button
                  type="button" onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer p-0 flex items-center"
                >
                  {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-gray-700">Re-enter password</label>
              <input
                type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••" required
                className="px-3.5 py-3 border-[1.5px] border-border rounded-lg text-[15px] outline-none text-foreground bg-white focus:ring-2 focus:ring-ring focus:border-primary"
              />
            </div>

            {error && <div className="bg-destructive/10 border border-destructive/20 text-destructive px-3.5 py-2.5 rounded-lg text-[13px]">{error}</div>}

            <button
              type="submit" disabled={isLoading}
              className={cn(
                "bg-primary text-primary-foreground border-none rounded-lg py-3.5 text-[15px] font-bold mt-1 transition-opacity",
                isLoading ? "opacity-70 cursor-not-allowed" : "cursor-pointer"
              )}
            >
              {isLoading ? "Checking…" : "Continue"}
            </button>
          </form>
        ) : (
          <form onSubmit={submitOtp} className="flex flex-col gap-[16px]">
            <p className="text-sm text-gray-600 -mt-2">We sent a verification code to <strong>{email}</strong>.</p>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-gray-700">Verification code</label>
              <input
                type="text" value={otp} onChange={e => setOtp(e.target.value)}
                placeholder="6-digit code" required autoFocus
                className="px-3.5 py-3 border-[1.5px] border-border rounded-lg text-[15px] outline-none text-foreground bg-white font-mono tracking-widest focus:ring-2 focus:ring-ring focus:border-primary"
              />
            </div>

            {error && <div className="bg-destructive/10 border border-destructive/20 text-destructive px-3.5 py-2.5 rounded-lg text-[13px]">{error}</div>}

            <button
              type="submit" disabled={isLoading}
              className={cn(
                "bg-primary text-primary-foreground border-none rounded-lg py-3.5 text-[15px] font-bold mt-1 transition-opacity",
                isLoading ? "opacity-70 cursor-not-allowed" : "cursor-pointer"
              )}
            >
              {isLoading ? "Verifying…" : "Verify & finish"}
            </button>
            <p className="text-[11px] text-gray-400 text-center mt-1">Didn't get it? Ask your admin to send you a new invite.</p>
          </form>
        )}

      </div>
    </div>
  )
}
