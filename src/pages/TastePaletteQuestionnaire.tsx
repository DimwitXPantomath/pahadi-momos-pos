import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useCustomerAuth, sendOtp, verifyOtp } from "@/hooks/useCustomerAuth"
import { getTasteProfile, saveTasteProfile, type TasteProfileDraft } from "@/services/tasteProfileService"

// Taste Palette onboarding questionnaire. Public entry point — a
// customer can land here from a link/QR without having ordered yet.
// Per spec: skippable at any point, 9 core questions (dietary type +
// allergens are the two Layer-1 safety questions; the rest are Layer-2
// soft preferences), progress indicator, skip always as visible as
// continue. Section A.4 (texture/portion/health-goal) is cut for v1
// per the questionnaire doc's own recommendation to keep completion
// rates up — not built here, can be added back later if data shows
// it's worth the extra questions.

type QuestionType = "single" | "multi" | "scalar"
type Question = {
  key: keyof TasteProfileDraft
  type: QuestionType
  title: string
  subtitle?: string
  options: { value: string; label: string }[]
}

const QUESTIONS: Question[] = [
  {
    key: "dietary_type",
    type: "single",
    title: "What do you eat?",
    subtitle: "This decides which dishes we'll ever show you — the most important question here.",
    options: [
      { value: "vegetarian", label: "Vegetarian" },
      { value: "non_vegetarian", label: "Non-vegetarian" },
      { value: "eggetarian", label: "Eggetarian" },
      { value: "vegan", label: "Vegan" },
      { value: "jain", label: "Jain" },
    ],
  },
  {
    key: "allergens",
    type: "multi",
    title: "Any allergies we should know about?",
    subtitle: "Dishes with these are excluded completely, not just ranked lower. Select \"None\" if none apply.",
    options: [
      { value: "peanuts", label: "Peanuts" },
      { value: "tree_nuts", label: "Tree nuts" },
      { value: "dairy", label: "Dairy" },
      { value: "gluten", label: "Gluten" },
      { value: "soy", label: "Soy" },
      { value: "shellfish", label: "Shellfish" },
      { value: "eggs", label: "Eggs" },
      { value: "sesame", label: "Sesame" },
      { value: "mustard", label: "Mustard" },
      { value: "none", label: "None" },
    ],
  },
  {
    key: "spice_tolerance",
    type: "scalar",
    title: "How spicy do you like your food?",
    options: [
      { value: "1", label: "Mild" },
      { value: "2", label: "A little spicy" },
      { value: "3", label: "Medium" },
      { value: "4", label: "Spicy" },
      { value: "5", label: "Very spicy" },
    ],
  },
  {
    key: "calorie_awareness",
    type: "single",
    title: "How much do you think about calories?",
    options: [
      { value: "low_focus", label: "Low-calorie focus" },
      { value: "moderate", label: "Moderate" },
      { value: "no_preference", label: "No preference" },
    ],
  },
  {
    key: "budget_sensitivity",
    type: "single",
    title: "What's your usual budget?",
    options: [
      { value: "budget", label: "Budget-friendly" },
      { value: "mid_range", label: "Mid-range" },
      { value: "no_preference", label: "No preference" },
    ],
  },
  {
    key: "cuisine_preferences",
    type: "multi",
    title: "Which cuisines do you enjoy?",
    subtitle: "Pick as many as you like.",
    options: [
      { value: "north_indian", label: "North Indian" },
      { value: "south_indian", label: "South Indian" },
      { value: "chinese", label: "Chinese" },
      { value: "continental", label: "Continental" },
      { value: "fast_food", label: "Fast Food" },
      { value: "street_food", label: "Street Food" },
      { value: "bakery_desserts", label: "Bakery & Desserts" },
    ],
  },
  {
    key: "cooking_type_preferences",
    type: "multi",
    title: "How do you like your food cooked?",
    options: [
      { value: "grilled", label: "Grilled" },
      { value: "fried", label: "Fried" },
      { value: "steamed", label: "Steamed" },
      { value: "roasted", label: "Roasted" },
      { value: "boiled", label: "Boiled" },
      { value: "raw_fresh", label: "Raw / Fresh (salads etc.)" },
    ],
  },
  {
    key: "meal_course_preferences",
    type: "multi",
    title: "What do you usually order?",
    options: [
      { value: "starters", label: "Starters" },
      { value: "main_course", label: "Main course" },
      { value: "desserts", label: "Desserts" },
      { value: "beverages", label: "Beverages" },
      { value: "snacks", label: "Snacks" },
    ],
  },
  {
    key: "flavor_preferences",
    type: "multi",
    title: "What flavors do you gravitate toward?",
    options: [
      { value: "sweet", label: "Sweet" },
      { value: "savory", label: "Savory" },
      { value: "tangy", label: "Tangy" },
      { value: "spicy_tangy", label: "Spicy & tangy" },
      { value: "mild_comforting", label: "Mild & comforting" },
    ],
  },
]

const COLORS = {
  primary: "#1B6E5C",
  accent: "#E76F51",
  bg: "#F7F5F0",
  card: "#FFFFFF",
  border: "#E5E7EB",
  text: "#1F2937",
  muted: "#6B7280",
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: COLORS.bg, fontFamily: "Inter, sans-serif", display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 16px" },
  card: { width: "100%", maxWidth: 480, background: COLORS.card, borderRadius: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.08)", border: `1px solid ${COLORS.border}`, padding: 24 },
  progressTrack: { height: 6, background: COLORS.border, borderRadius: 3, overflow: "hidden", marginBottom: 16 },
  progressFill: { height: "100%", background: COLORS.primary, transition: "width 0.2s" },
  progressLabel: { fontSize: 13, color: COLORS.muted, marginBottom: 20 },
  title: { fontSize: 20, fontWeight: 600, color: COLORS.text, margin: "0 0 4px" },
  subtitle: { fontSize: 14, color: COLORS.muted, margin: "0 0 20px" },
  optionButton: (active: boolean): React.CSSProperties => ({
    display: "block", width: "100%", textAlign: "left", padding: "12px 16px", marginBottom: 8,
    borderRadius: 10, border: `1.5px solid ${active ? COLORS.primary : COLORS.border}`,
    background: active ? "#E7F2EF" : COLORS.card, color: COLORS.text, fontSize: 15,
    cursor: "pointer", minHeight: 44,
  }),
  footer: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24 },
  skipBtn: { background: "none", border: "none", color: COLORS.muted, fontSize: 14, cursor: "pointer", padding: "10px 4px", minHeight: 44 },
  navBtns: { display: "flex", gap: 8 },
  backBtn: { padding: "10px 18px", borderRadius: 10, border: `1.5px solid ${COLORS.border}`, background: COLORS.card, color: COLORS.text, fontSize: 14, cursor: "pointer", minHeight: 44 },
  nextBtn: { padding: "10px 22px", borderRadius: 10, border: "none", background: COLORS.primary, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", minHeight: 44 },
  phoneInput: { width: "100%", padding: "12px 14px", borderRadius: 10, border: `1.5px solid ${COLORS.border}`, fontSize: 16, marginBottom: 12, boxSizing: "border-box" },
  errorText: { color: "#E76F51", fontSize: 13, marginBottom: 12 },
  doneWrap: { textAlign: "center", padding: "20px 0" },
}

export default function TastePaletteQuestionnaire() {
  const navigate = useNavigate()
  const { uid, phone: sessionPhone, isSignedIn, refreshSession } = useCustomerAuth()

  const [authStep, setAuthStep] = useState<"phone" | "otp">("phone")
  const [phoneInput, setPhoneInput] = useState("")
  const [otpInput, setOtpInput] = useState("")
  const [authError, setAuthError] = useState<string | null>(null)
  const [authBusy, setAuthBusy] = useState(false)
  // Dev-only: sendOtp() is stubbed (no real SMS sent yet), so it hands
  // back the code directly for testing. This whole field disappears
  // once real Firebase Phone Auth is wired in — see useCustomerAuth.ts.
  const [devCode, setDevCode] = useState<string | null>(null)

  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<TasteProfileDraft>({})
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Resume an existing profile if this phone already has one.
  useEffect(() => {
    if (!isSignedIn || !uid) return
    setLoadingProfile(true)
    getTasteProfile(uid).then(profile => {
      if (profile) {
        setAnswers({
          dietary_type: profile.dietary_type ?? undefined,
          allergens: profile.allergens ?? undefined,
          spice_tolerance: profile.spice_tolerance ?? undefined,
          calorie_awareness: profile.calorie_awareness ?? undefined,
          budget_sensitivity: profile.budget_sensitivity ?? undefined,
          cuisine_preferences: profile.cuisine_preferences ?? undefined,
          cooking_type_preferences: profile.cooking_type_preferences ?? undefined,
          meal_course_preferences: profile.meal_course_preferences ?? undefined,
          flavor_preferences: profile.flavor_preferences ?? undefined,
        })
      }
      setLoadingProfile(false)
    })
  }, [isSignedIn, uid])

  const requestCode = async () => {
    setAuthError(null)
    setAuthBusy(true)
    const res = await sendOtp(phoneInput)
    setAuthBusy(false)
    if (!res.ok) { setAuthError(res.error ?? "Couldn't send code"); return }
    setDevCode(res.devCode ?? null)
    setAuthStep("otp")
  }

  const confirmCode = async () => {
    setAuthError(null)
    setAuthBusy(true)
    const res = await verifyOtp(phoneInput, otpInput)
    setAuthBusy(false)
    if (!res.ok) { setAuthError(res.error ?? "Couldn't verify code"); return }
    refreshSession()
  }

  const currentQuestion = QUESTIONS[step]
  const isLast = step === QUESTIONS.length - 1

  const setAnswer = (value: TasteProfileDraft[keyof TasteProfileDraft]) => {
    setAnswers(prev => ({ ...prev, [currentQuestion.key]: value }))
  }

  const toggleMultiValue = (val: string) => {
    const key = currentQuestion.key
    const current = (answers[key] as string[] | undefined) ?? []
    if (val === "none") { setAnswer(["none"]); return }
    const withoutNone = current.filter(v => v !== "none")
    const next = withoutNone.includes(val) ? withoutNone.filter(v => v !== val) : [...withoutNone, val]
    setAnswer(next)
  }

  const finish = async (markCompleted: boolean) => {
    if (!uid) {
      setSaveError("You're not signed in — please verify your phone number again.")
      return
    }
    setSaving(true)
    setSaveError(null)
    const { error } = await saveTasteProfile(uid, answers, markCompleted)
    setSaving(false)
    if (error) {
      setSaveError(error)
      return
    }
    navigate("/taste-palette/results")
  }

  const goNext = () => {
    if (isLast) { finish(true); return }
    setStep(s => s + 1)
  }

  // ── Auth gate ────────────────────────────────────────────────────
  if (!isSignedIn) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <h1 style={s.title}>Taste Palette</h1>
          <p style={s.subtitle}>Answer a few quick questions and we'll point you to dishes you'll actually like. Takes about a minute — skip anytime.</p>
          {authStep === "phone" ? (
            <>
              <input
                style={s.phoneInput}
                type="tel"
                placeholder="10-digit phone number"
                value={phoneInput}
                onChange={e => setPhoneInput(e.target.value)}
              />
              {authError && <p style={s.errorText}>{authError}</p>}
              <button style={s.nextBtn} onClick={requestCode} disabled={authBusy}>
                {authBusy ? "Sending..." : "Send code"}
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, color: COLORS.muted, marginBottom: 8 }}>Code sent to +91{phoneInput.replace(/\D/g, "")}</p>
              {devCode && (
                <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#92400E" }}>
                  <strong>Dev mode — no real SMS sent.</strong> Your test code is <strong style={{ fontSize: 16, letterSpacing: 2 }}>{devCode}</strong>. This box disappears once real Firebase Phone Auth replaces the stub.
                </div>
              )}
              <input
                style={s.phoneInput}
                type="text"
                inputMode="numeric"
                placeholder="6-digit code"
                value={otpInput}
                onChange={e => setOtpInput(e.target.value)}
              />
              {authError && <p style={s.errorText}>{authError}</p>}
              <button style={s.nextBtn} onClick={confirmCode} disabled={authBusy}>
                {authBusy ? "Checking..." : "Verify"}
              </button>
            </>
          )}
          <div style={{ marginTop: 16 }}>
            {/* FIXED: was navigate(-1) — assumed a previous in-app page
                existed to go back to. A customer arriving via QR scan
                or a direct link (typical for this page) has no such
                history, so "skip" was exiting the whole site instead
                of just this page. Falls back to a known-safe route
                instead of browser history. */}
            <button style={s.skipBtn} onClick={() => navigate("/menu/demo-outlet")}>Not now</button>
          </div>
        </div>
      </div>
    )
  }

  if (loadingProfile) {
    return <div style={s.page}><p>Loading...</p></div>
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.progressTrack}>
          <div style={{ ...s.progressFill, width: `${((step + 1) / QUESTIONS.length) * 100}%` }} />
        </div>
        <p style={s.progressLabel}>Question {step + 1} of {QUESTIONS.length}</p>

        <h2 style={s.title}>{currentQuestion.title}</h2>
        {currentQuestion.subtitle && <p style={s.subtitle}>{currentQuestion.subtitle}</p>}

        {currentQuestion.type === "single" && currentQuestion.options.map(opt => (
          <button
            key={opt.value}
            style={s.optionButton(answers[currentQuestion.key] === opt.value)}
            onClick={() => setAnswer(opt.value)}
          >
            {opt.label}
          </button>
        ))}

        {currentQuestion.type === "scalar" && currentQuestion.options.map(opt => (
          <button
            key={opt.value}
            style={s.optionButton(String(answers[currentQuestion.key]) === opt.value)}
            onClick={() => setAnswer(Number(opt.value))}
          >
            {opt.label}
          </button>
        ))}

        {currentQuestion.type === "multi" && currentQuestion.options.map(opt => {
          const current = (answers[currentQuestion.key] as string[] | undefined) ?? []
          return (
            <button
              key={opt.value}
              style={s.optionButton(current.includes(opt.value))}
              onClick={() => toggleMultiValue(opt.value)}
            >
              {opt.label}
            </button>
          )
        })}

        {saveError && (
          <p style={{ color: "#dc2626", fontSize: 13, margin: "0 0 10px", textAlign: "center" }}>
            {saveError}
          </p>
        )}

        <div style={s.footer}>
          <button style={s.skipBtn} onClick={() => finish(false)} disabled={saving}>Skip for now</button>
          <div style={s.navBtns}>
            {step > 0 && <button style={s.backBtn} onClick={() => setStep(s => s - 1)} disabled={saving}>Back</button>}
            <button style={s.nextBtn} onClick={goNext} disabled={saving}>
              {saving ? "Saving…" : isLast ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
