import { createContext, useContext, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import type { User } from "@supabase/supabase-js"

// Verified 2026-08-14 directly against the live database via the
// Supabase MCP connector (information_schema.columns) — the codebase
// had guessed wrong about this table twice before (first "name" was
// assumed not to exist, then "full_name" was assumed to be the real
// column; neither guess was checked against the live schema first).
// Real columns: id (uuid, PK, FK->auth.users), name (text, nullable),
// role (text, NOT NULL, default 'staff', CHECK IN owner/manager/staff),
// brand_id (uuid, nullable, FK->brands — unused by this app today),
// outlet_id (uuid, nullable — NOT text like every other table's
// outlet_id column; there is no real multi-outlet system yet, so this
// is left null rather than guessing a value), created_at.
// `full_name` below is this app's internal field name (kept so the
// several existing call sites reading `profile.full_name` don't all
// need renaming) — it's populated FROM the real `name` column, not a
// real column itself. See fetchProfile().
type Profile = {
  id: string
  full_name: string | null
  role: "owner" | "manager" | "staff"
  outlet_id: string | null
}

type AuthContextType = {
  user: User | null
  profile: Profile | null
  isLoading: boolean
  // Human-readable reason profile is null despite being logged in —
  // was previously only console.error'd, invisible unless someone knew
  // to open devtools. Now surfaced on-screen (see Layout.tsx) so it's
  // readable/screenshottable without any technical steps.
  profileError: string | null
  refetchProfile: () => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  isLoading: true,
  profileError: null,
  refetchProfile: () => {},
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [profileError, setProfileError] = useState<string | null>(null)

  const fetchProfile = async (userId: string): Promise<Profile | null> => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, role, outlet_id")
        .eq("id", userId)
        .single()

      if (error) {
        if (error.code === "PGRST116") {
          // Profile doesn't exist — create one. Checked directly
          // against the live `insert_own_profile` RLS policy (via
          // Supabase MCP, 2026-08-14): it only requires
          // `id = auth.uid() AND role = 'staff'` — no outlet_id check
          // live (migration 016's version differs from what's actually
          // deployed — not unusual for this project, see CLAUDE.md).
          // outlet_id is left unset: it's a uuid column with no valid
          // "demo-outlet" value to give it, and nothing requires it.
          const { data: newProfile, error: insertErr } = await supabase
            .from("profiles")
            .insert({ id: userId, role: "staff", name: "New User" })
            .select("id, name, role, outlet_id")
            .single()
          if (insertErr) {
            setProfileError(`Couldn't create your profile: ${insertErr.message} (code: ${insertErr.code ?? "?"})`)
            return null
          }
          setProfileError(null)
          return { id: newProfile.id, full_name: newProfile.name, role: newProfile.role, outlet_id: newProfile.outlet_id }
        }
        setProfileError(`Couldn't load your profile: ${error.message} (code: ${error.code ?? "?"})`)
        return null
      }

      if (!data.role || !["owner", "manager", "staff"].includes(data.role)) {
        setProfileError(`Your profile exists but has an invalid role ("${data.role ?? "empty"}") — an admin needs to fix this from the database.`)
        return null
      }

      setProfileError(null)
      return { id: data.id, full_name: data.name, role: data.role, outlet_id: data.outlet_id }
    } catch (err: any) {
      setProfileError(`Something went wrong loading your profile: ${err?.message || "unknown error"}`)
      return null
    }
  }

  const loadProfileFor = (userId: string, mountedRef: { mounted: boolean }) => {
    fetchProfile(userId).then(prof => {
      if (mountedRef.mounted) setProfile(prof)
    })
  }

  useEffect(() => {
    const mountedRef = { mounted: true }

    // Step 1: immediately check if there's a session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mountedRef.mounted) return

      if (session?.user) {
        setUser(session.user)
        // Fetch profile in background — don't block loading
        loadProfileFor(session.user.id, mountedRef)
      }

      // Always stop loading after session check — don't wait for profile
      setIsLoading(false)
    }).catch(() => {
      if (mountedRef.mounted) setIsLoading(false)
    })

    // Step 2: listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mountedRef.mounted) return

        if (event === "SIGNED_OUT") {
          setUser(null)
          setProfile(null)
          setProfileError(null)
          return
        }

        if (session?.user) {
          setUser(session.user)
          if (event === "SIGNED_IN") {
            // Was also caching the full profile (including role) in
            // localStorage — nothing else in the app reads it back, and
            // an XSS payload or shared-machine session could read a
            // stale role/outlet_id out of it. Removed; profile is
            // refetched from Supabase on every session load anyway.
            loadProfileFor(session.user.id, mountedRef)
          }
        }
      }
    )

    return () => {
      mountedRef.mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const refetchProfile = () => {
    if (!user) return
    setProfileError(null)
    loadProfileFor(user.id, { mounted: true })
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setProfileError(null)
  }

  return (
    <AuthContext.Provider value={{ user, profile, isLoading, profileError, refetchProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}