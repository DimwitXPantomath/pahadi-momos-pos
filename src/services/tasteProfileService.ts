import { supabase } from "@/lib/supabase"

export type DietaryType = "vegetarian" | "non_vegetarian" | "eggetarian" | "vegan" | "jain"
export type CalorieAwareness = "low_focus" | "moderate" | "no_preference"
export type BudgetSensitivity = "budget" | "mid_range" | "no_preference"

export type TasteProfile = {
  id: string
  customer_uid: string
  phone: string | null
  dietary_type: DietaryType | null
  allergens: string[] | null
  spice_tolerance: number | null
  calorie_awareness: CalorieAwareness | null
  budget_sensitivity: BudgetSensitivity | null
  cuisine_preferences: string[] | null
  cooking_type_preferences: string[] | null
  meal_course_preferences: string[] | null
  flavor_preferences: string[] | null
  texture_preference: string | null
  portion_preference: string | null
  health_goal: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export async function getTasteProfile(customerUid: string): Promise<TasteProfile | null> {
  const { data, error } = await supabase.rpc("get_taste_profile", { p_customer_uid: customerUid })
  if (error) {
    console.error("getTasteProfile error:", error)
    return null
  }
  // RPC returns a single row shaped like the table, or an all-null row
  // if none exists yet (SECURITY DEFINER function returning a table
  // row type still returns one row even with no match, with id NULL)
  if (!data || !data.id) return null
  return data as TasteProfile
}

export type TasteProfileDraft = Partial<
  Omit<TasteProfile, "id" | "customer_uid" | "created_at" | "updated_at" | "completed_at">
>

export async function saveTasteProfile(
  customerUid: string,
  draft: TasteProfileDraft,
  markCompleted = false
): Promise<{ profile: TasteProfile | null; error: string | null }> {
  const { data, error } = await supabase.rpc("upsert_taste_profile", {
    p_customer_uid: customerUid,
    p_phone: draft.phone ?? null,
    p_dietary_type: draft.dietary_type ?? null,
    p_allergens: draft.allergens ?? null,
    p_spice_tolerance: draft.spice_tolerance ?? null,
    p_calorie_awareness: draft.calorie_awareness ?? null,
    p_budget_sensitivity: draft.budget_sensitivity ?? null,
    p_cuisine_preferences: draft.cuisine_preferences ?? null,
    p_cooking_type_preferences: draft.cooking_type_preferences ?? null,
    p_meal_course_preferences: draft.meal_course_preferences ?? null,
    p_flavor_preferences: draft.flavor_preferences ?? null,
    p_texture_preference: draft.texture_preference ?? null,
    p_portion_preference: draft.portion_preference ?? null,
    p_health_goal: draft.health_goal ?? null,
    p_mark_completed: markCompleted,
  })
  if (error) {
    console.error("saveTasteProfile error:", error)
    return { profile: null, error: error.message ?? "Unknown error saving profile" }
  }
  return { profile: data as TasteProfile, error: null }
}
