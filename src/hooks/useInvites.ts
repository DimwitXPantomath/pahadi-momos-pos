import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/AuthContext"

// Backs the new invite-only signup gate (028_invite_only_signup.sql).
// Per CLAUDE.md rule #9, all Supabase queries live in a hook, not
// inline in components.

export type Invite = {
  id: string
  email: string
  purpose: "general" | "staff"
  code: string | null
  name: string | null
  phone: string | null
  intended_role: "owner" | "manager" | "staff"
  used_at: string | null
  expires_at: string
  created_at: string
}

// Avoids visually ambiguous characters (0/O, 1/I/L) since this code
// gets read off a screen and typed by hand, often on a phone.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
function generateCode(length = 8) {
  let out = ""
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return out
}

export function useInvites() {
  const { user } = useAuth()
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("invites")
      .select("*")
      .order("created_at", { ascending: false })
    if (error) {
      setError(error.message)
    } else {
      setError(null)
      setInvites((data ?? []) as Invite[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const inviteGeneral = useCallback(async (email: string): Promise<{ ok: boolean; error?: string }> => {
    if (!user) return { ok: false, error: "Not signed in" }
    const { error } = await supabase.from("invites").insert({
      email: email.trim().toLowerCase(),
      purpose: "general",
      invited_by: user.id,
    })
    if (error) return { ok: false, error: error.message }
    await refresh()
    return { ok: true }
  }, [user, refresh])

  const inviteStaff = useCallback(async (params: {
    name: string
    email: string
    phone?: string
  }): Promise<{ ok: boolean; error?: string; code?: string }> => {
    if (!user) return { ok: false, error: "Not signed in" }
    const code = generateCode()
    const { error } = await supabase.from("invites").insert({
      email: params.email.trim().toLowerCase(),
      purpose: "staff",
      code,
      name: params.name.trim(),
      phone: params.phone?.trim() || null,
      invited_by: user.id,
    })
    if (error) return { ok: false, error: error.message }
    await refresh()
    return { ok: true, code }
  }, [user, refresh])

  return { invites, loading, error, refresh, inviteGeneral, inviteStaff }
}
