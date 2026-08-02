import { createContext, useContext, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import type { User } from "@supabase/supabase-js"

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
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  isLoading: true,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchProfile = async (userId: string): Promise<Profile | null> => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single()

      if (error) {
        if (error.code === "PGRST116") {
          // Profile doesn't exist — create one.
          // SECURITY: role/outlet_id here MUST match exactly what
          // 016_profiles_lockdown.sql's insert_own_profile RLS policy
          // allows (role='staff', outlet_id='demo-outlet') — the policy
          // is the real enforcement, this is just so a legitimate new
          // sign-up doesn't hit an RLS rejection here. A brand-new
          // account is never auto-granted 'owner' anymore; an existing
          // owner promotes staff via admin_update_staff_role().
          // Also fixed: this used to insert `name`, a column that has
          // never existed on `profiles` (the real column is
          // `full_name`) — every new sign-up's profile insert was
          // silently failing before this fix.
          const { data: newProfile, error: insertErr } = await supabase
            .from("profiles")
            .insert({ id: userId, role: "staff", outlet_id: "demo-outlet", full_name: "New User" })
            .select()
            .single()
          if (insertErr) {
            console.error("Profile provisioning failed:", insertErr)
            return null
          }
          return newProfile as Profile
        }
        return null
      }

      return data as Profile
    } catch {
      return null
    }
  }

  useEffect(() => {
    let mounted = true

    // Step 1: immediately check if there's a session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return

      if (session?.user) {
        setUser(session.user)
        // Fetch profile in background — don't block loading
        fetchProfile(session.user.id).then(prof => {
          if (mounted) setProfile(prof)
        })
      }

      // Always stop loading after session check — don't wait for profile
      setIsLoading(false)
    }).catch(() => {
      if (mounted) setIsLoading(false)
    })

    // Step 2: listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return

        if (event === "SIGNED_OUT") {
          setUser(null)
          setProfile(null)
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
            fetchProfile(session.user.id).then(prof => {
              if (mounted) setProfile(prof)
            })
          }
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ user, profile, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}