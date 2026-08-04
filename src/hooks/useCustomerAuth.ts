import { useState, useEffect, useCallback } from "react"

// ── STUBBED phone auth ──────────────────────────────────────────────
// Per decision made 2026-08-03: real Firebase Phone Auth needs a Blaze
// (paid) plan, reCAPTCHA setup, and in India, DLT/TRAI sender
// registration for transactional SMS — none of which exist yet. This
// simulates the whole phone-verification flow locally so the rest of
// the app (checkout gating, taste profile persistence) can be built
// and tested end-to-end now, with a narrow, clearly-marked swap point
// for real Firebase Phone Auth later.
//
// TODO WHEN REAL FIREBASE PHONE AUTH IS READY:
//   - Replace sendOtp() with: signInWithPhoneNumber(auth, phone, recaptchaVerifier)
//     (needs a RecaptchaVerifier instance mounted in the calling component)
//   - Replace verifyOtp() with: confirmationResult.confirm(code)
//   - Replace the local customer_uid generation with the real
//     firebase.auth().currentUser.uid from the confirmed credential
//   - Wire linkWithCredential for Google-secondary sign-in per spec §4
//     ("account-exists-with-different-credential" handling)
//   - Everything else (session persistence shape, the hook's return
//     interface) is designed to not need to change when this happens.

const SESSION_KEY = "praang_customer_session"
const OTP_STORE_KEY = "praang_customer_otp_pending"

type CustomerSession = {
  uid: string
  phone: string
}

function digitsOnly(phone: string) {
  return phone.replace(/\D/g, "")
}

// Stable pseudo-uid derived from phone, so the same number always maps
// to the same taste_profiles row even across devices/sessions. Real
// Firebase Auth will replace this with its own uid — the rest of the
// app only ever consumes `uid` as an opaque string, so that swap is
// contained to this one function.
function pseudoUidFromPhone(phone: string) {
  return `stub_${digitsOnly(phone)}`
}

function readSession(): CustomerSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeSession(session: CustomerSession | null) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  else localStorage.removeItem(SESSION_KEY)
}

/**
 * Simulates sending an OTP. No real SMS goes out — this is the ONE
 * function that needs a real backend behind it before this can go
 * live with real customers. Returns the generated code directly so
 * the calling UI can show it on-screen for testing (clearly marked
 * as a dev-only stub) — checking the browser console isn't practical
 * on a phone. When real Firebase Phone Auth replaces this, the
 * `devCode` field goes away and callers stop reading it.
 */
export async function sendOtp(phone: string): Promise<{ ok: boolean; error?: string; devCode?: string }> {
  const digits = digitsOnly(phone)
  if (digits.length < 10) return { ok: false, error: "Enter a valid 10-digit phone number" }

  const code = String(Math.floor(100000 + Math.random() * 900000))
  sessionStorage.setItem(OTP_STORE_KEY, JSON.stringify({ phone: digits, code, sentAt: Date.now() }))

  // STUB: real implementation calls Firebase's signInWithPhoneNumber
  // here, which actually sends the SMS.
  console.warn(`[STUB OTP] Would text ${code} to +91${digits}. (No real SMS is sent — see useCustomerAuth.ts)`)

  return { ok: true, devCode: code }
}

export async function verifyOtp(phone: string, code: string): Promise<{ ok: boolean; error?: string; uid?: string }> {
  const digits = digitsOnly(phone)
  const raw = sessionStorage.getItem(OTP_STORE_KEY)
  if (!raw) return { ok: false, error: "No OTP was requested for this number — request one first" }

  const pending = JSON.parse(raw) as { phone: string; code: string; sentAt: number }
  const expired = Date.now() - pending.sentAt > 5 * 60 * 1000
  if (expired) return { ok: false, error: "Code expired — request a new one" }
  if (pending.phone !== digits) return { ok: false, error: "Phone number doesn't match the code request" }
  if (pending.code !== code.trim()) return { ok: false, error: "Incorrect code" }

  sessionStorage.removeItem(OTP_STORE_KEY)
  const uid = pseudoUidFromPhone(digits)
  writeSession({ uid, phone: digits })
  return { ok: true, uid }
}

export function signOutCustomer() {
  writeSession(null)
}

/**
 * Hook: current customer session (if any), reactive to sign-in/out
 * happening elsewhere (e.g. after verifyOtp succeeds, call
 * refreshSession() so components re-render with the new session).
 */
export function useCustomerAuth() {
  const [session, setSession] = useState<CustomerSession | null>(() => readSession())

  const refreshSession = useCallback(() => setSession(readSession()), [])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SESSION_KEY) refreshSession()
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [refreshSession])

  const signOut = useCallback(() => {
    signOutCustomer()
    setSession(null)
  }, [])

  return {
    uid: session?.uid ?? null,
    phone: session?.phone ?? null,
    isSignedIn: !!session,
    refreshSession,
    signOut,
  }
}
