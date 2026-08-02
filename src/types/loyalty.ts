// Types for the stamp-card loyalty program (supabase/migrations/009_stamp_loyalty_cards.sql).
// Separate from the existing points program (loyalty_settings / loyalty_customers /
// loyalty_transactions) — the two run side by side, not as a replacement.

export type RewardType = "discount_percent" | "discount_flat" | "complimentary_item"
export type StampCardStatus = "active" | "reward_ready" | "redeemed"
export type StampCardEventType = "issue" | "stamp" | "redeem"

export interface StampCardProgram {
  id: string
  outlet_id: string
  name: string
  stamps_required: number
  reward_type: RewardType
  reward_value: number | null
  reward_description: string | null
  is_active: boolean
  created_at?: string
  updated_at?: string
}

export interface StampCard {
  id: string
  outlet_id: string
  program_id: string
  customer_phone: string
  customer_name: string | null
  card_code: string
  stamps_count: number
  status: StampCardStatus
  created_at?: string
  updated_at?: string
  last_stamped_at?: string | null
}

export interface StampCardEvent {
  id: string
  card_id: string
  order_id: string | null
  event_type: StampCardEventType
  staff_note: string | null
  created_at: string
}

// Human-readable reward label, used in staff UI and the customer-facing card page.
export function describeReward(program: Pick<StampCardProgram, "reward_type" | "reward_value" | "reward_description">): string {
  if (program.reward_type === "complimentary_item") {
    return program.reward_description || "Complimentary item"
  }
  if (program.reward_type === "discount_percent") {
    return `${program.reward_value ?? 0}% off next order${program.reward_description ? ` — ${program.reward_description}` : ""}`
  }
  return `₹${program.reward_value ?? 0} off next order${program.reward_description ? ` — ${program.reward_description}` : ""}`
}
