import { createContext, useContext, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import type { User } from "@supabase/supabase-js"

type Profile = {
  id: string
  name: string
  role: "owner" | "manager" | "staff"
  brand_id: string | null
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
          // Profile doesn't exist — create one
          const { data: newProfile } = await supabase
            .from("profiles")
            .insert({ id: userId, role: "owner", name: "Owner" })
            .select()
            .single()
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
            fetchProfile(session.user.id).then(prof => {
              if (mounted) {
                setProfile(prof)
                if (prof) localStorage.setItem("praang_profile", JSON.stringify(prof))
              }
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
    localStorage.removeItem("praang_profile")
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