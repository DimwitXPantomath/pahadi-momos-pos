import { supabase } from "@/lib/supabase"
import type { StampCardProgram, StampCard, StampCardEvent } from "@/types/loyalty"

const OUTLET_ID = "demo-outlet"

// ── Program config (outlet-level settings) ─────────────────────────────────

export const fetchStampProgram = async (outletId: string = OUTLET_ID): Promise<StampCardProgram | null> => {
  const { data, error } = await supabase
    .from("stamp_card_programs")
    .select("*")
    .eq("outlet_id", outletId)
    .maybeSingle()

  if (error) {
    console.error("Fetch stamp program error:", error)
    return null
  }
  return data
}

export const saveStampProgram = async (program: Partial<StampCardProgram> & { outlet_id: string }) => {
  const { data, error } = await supabase
    .from("stamp_card_programs")
    .upsert(program, { onConflict: "outlet_id" })
    .select()
    .single()

  if (error) {
    console.error("Save stamp program error:", error)
    return null
  }
  return data as StampCardProgram
}

// ── Card lookup ──────────────────────────────────────────────────────────

// Used at checkout (CartPanel) once a phone number is entered. Returns null if
// this customer has never earned a stamp yet — that's a normal "no card yet"
// state, not an error; the first add_stamp() call creates the row.
export const lookupCardByPhone = async (
  programId: string,
  phone: string,
  outletId: string = OUTLET_ID
): Promise<StampCard | null> => {
  const { data, error } = await supabase
    .from("stamp_cards")
    .select("*")
    .eq("outlet_id", outletId)
    .eq("program_id", programId)
    .eq("customer_phone", phone)
    .maybeSingle()

  if (error) {
    console.error("Lookup stamp card error:", error)
    return null
  }
  return data
}

// Used by the public digital card page (/loyalty-card/:code) — no auth.
// Was a direct table select relying on an anon SELECT USING(true) policy
// that let anyone dump every stamp card (and phone number) on the
// platform; now goes through a SECURITY DEFINER RPC that only ever
// returns the one card matching the code you already have. See
// 018_scoped_anon_reads.sql.
export const fetchCardByCode = async (code: string): Promise<StampCard | null> => {
  const { data, error } = await supabase.rpc("get_stamp_card_by_code", { p_card_code: code })

  if (error) {
    console.error("Fetch stamp card by code error:", error)
    return null
  }
  return data
}

export const fetchProgramById = async (programId: string): Promise<StampCardProgram | null> => {
  const { data, error } = await supabase.rpc("get_stamp_program_by_id", { p_program_id: programId })

  if (error) {
    console.error("Fetch stamp program by id error:", error)
    return null
  }
  return data
}

// Manually issue a blank card (0 stamps) for a customer — used by the staff
// "look up / issue card" tool so there's something to hand over / print before
// the customer's first order completes. Not RPC-backed like addStamp/redeem:
// worst case of two staff issuing at once is a harmless duplicate 'issue'
// event, never a corrupted stamp count, since the unique constraint on
// (outlet_id, program_id, customer_phone) prevents a second row either way.
export const issueStampCard = async (opts: {
  programId: string
  phone: string
  name?: string
  outletId?: string
}): Promise<StampCard | null> => {
  const outlet_id = opts.outletId ?? OUTLET_ID

  const { data: existing } = await supabase
    .from("stamp_cards")
    .select("*")
    .eq("outlet_id", outlet_id)
    .eq("program_id", opts.programId)
    .eq("customer_phone", opts.phone)
    .maybeSingle()
  if (existing) return existing

  const { data, error } = await supabase
    .from("stamp_cards")
    .insert({ outlet_id, program_id: opts.programId, customer_phone: opts.phone, customer_name: opts.name ?? null })
    .select()
    .single()

  if (error) {
    console.error("Issue stamp card error:", error)
    return null
  }

  await supabase.from("stamp_card_events").insert({ card_id: data.id, event_type: "issue" })
  return data as StampCard
}

// ── Stamp / redeem — both go through Postgres RPCs so the increment and the
// reward-ready check happen atomically server-side, not as a client-side
// read-then-write (see 009_stamp_loyalty_cards.sql for why that matters). ──

export const addStamp = async (opts: {
  programId: string
  customerPhone: string
  customerName?: string
  orderId?: string
  outletId?: string
}): Promise<StampCard | null> => {
  const { data, error } = await supabase.rpc("add_stamp", {
    p_outlet_id: opts.outletId ?? OUTLET_ID,
    p_program_id: opts.programId,
    p_customer_phone: opts.customerPhone,
    p_customer_name: opts.customerName ?? null,
    p_order_id: opts.orderId ?? null,
  })

  if (error) {
    console.error("Add stamp error:", error.message)
    return null
  }
  return data as StampCard
}

export const redeemStampCard = async (opts: {
  cardId: string
  orderId?: string
  staffNote?: string
}): Promise<{ card: StampCard | null; error: string | null }> => {
  const { data, error } = await supabase.rpc("redeem_stamp_card", {
    p_card_id: opts.cardId,
    p_order_id: opts.orderId ?? null,
    p_staff_note: opts.staffNote ?? null,
  })

  if (error) {
    console.error("Redeem stamp card error:", error.message)
    return { card: null, error: error.message }
  }
  return { card: data as StampCard, error: null }
}

// ── Activity / stats for the Loyalty admin tab ──────────────────────────────

export const fetchRecentStampEvents = async (
  outletId: string = OUTLET_ID,
  limit = 20
): Promise<(StampCardEvent & { customer_phone?: string; customer_name?: string | null })[]> => {
  // stamp_card_events doesn't carry outlet_id directly, so join via stamp_cards.
  const { data, error } = await supabase
    .from("stamp_card_events")
    .select("*, stamp_cards!inner(customer_phone, customer_name, outlet_id)")
    .eq("stamp_cards.outlet_id", outletId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("Fetch stamp events error:", error)
    return []
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    card_id: row.card_id,
    order_id: row.order_id,
    event_type: row.event_type,
    staff_note: row.staff_note,
    created_at: row.created_at,
    customer_phone: row.stamp_cards?.customer_phone,
    customer_name: row.stamp_cards?.customer_name,
  }))
}

export const fetchStampCardStats = async (outletId: string = OUTLET_ID) => {
  const { data: cards, error: cardsErr } = await supabase
    .from("stamp_cards")
    .select("status")
    .eq("outlet_id", outletId)

  // Redemptions are logged as events, not a persisted card status — a card
  // goes back to 'active' immediately after redeeming so it can start
  // collecting stamps again. So "redeemed" has to come from the event log,
  // not from stamp_cards.status (which never actually stays 'redeemed').
  const { count: redeemedCount, error: eventsErr } = await supabase
    .from("stamp_card_events")
    .select("*, stamp_cards!inner(outlet_id)", { count: "exact", head: true })
    .eq("event_type", "redeem")
    .eq("stamp_cards.outlet_id", outletId)

  if (cardsErr || !cards) return { totalCards: 0, rewardReady: 0, redeemed: 0 }

  return {
    totalCards: cards.length,
    rewardReady: cards.filter(r => r.status === "reward_ready").length,
    redeemed: eventsErr ? 0 : (redeemedCount ?? 0),
  }
}
