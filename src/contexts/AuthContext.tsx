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
        console.warn("Profile fetch warning:", error.message)
        // Profile doesn't exist yet — create a basic one
        if (error.code === "PGRST116") {
          const { data: newProfile } = await supabase
            .from("profiles")
            .insert({ id: userId, role: "staff", name: "User" })
            .select()
            .single()
          return newProfile as Profile
        }
        return null
      }

      return data as Profile
    } catch (err) {
      console.error("Profile fetch error:", err)
      return null
    }
  }

  useEffect(() => {
    // Hard timeout — never stay loading more than 5 seconds
    const timeout = setTimeout(() => {
      console.warn("Auth timeout — forcing load complete")
      setIsLoading(false)
    }, 10000)

    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (session?.user) {
          setUser(session.user)
          const prof = await fetchProfile(session.user.id)
          setProfile(prof)
        }
      } catch (err) {
        console.error("Auth init error:", err)
      } finally {
        clearTimeout(timeout)
        setIsLoading(false)
      }
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log("Auth event:", event, "user:", session?.user?.email)

        if (event === "SIGNED_OUT") {
          setUser(null)
          setProfile(null)
          setIsLoading(false)
          return
        }

        if (session?.user) {
          setUser(session.user)
          // Only fetch profile on sign in, not on every token refresh
          if (event === "SIGNED_IN" || event === "USER_UPDATED") {
            const prof = await fetchProfile(session.user.id)
            setProfile(prof)
          }
        } else {
          setUser(null)
          setProfile(null)
        }

        setIsLoading(false)
      }
    )

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
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