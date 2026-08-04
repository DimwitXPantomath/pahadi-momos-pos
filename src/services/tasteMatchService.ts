import type { MenuItem } from "@/types/pos"
import type { TasteProfile } from "@/services/tasteProfileService"

// Taste Palette matching engine. Two layers, not one blended score —
// see praang-ahead-taste-palette-spec.md §3.4. Layer 1 is a hard
// safety filter (allergens, dietary type) that never gets folded into
// the weighted score. Layer 2 only runs on dishes that survive Layer 1.

export type MatchedDish = {
  item: MenuItem
  score: number
  maxScore: number
  badge: "Great match" | "Good match" | null
}

export type MatchResult = {
  matched: MatchedDish[]      // passed Layer 1, sorted by Layer 2 score desc
  notYetRated: MenuItem[]     // missing dietary_type or spice_level — never
                               // silently treated as safe, shown separately
  excludedByAllergen: number  // count only, for an optional "N dishes hidden
                               // for your allergies" note — never list which
  tooBroadFallback: boolean   // true if the profile is too unrestrictive to
                               // meaningfully differentiate — caller should
                               // show matched sorted by popularity/newest
                               // instead of implying a real personalized rank
}

// ── Layer 1: dietary compatibility ──────────────────────────────────
// What a customer with a given preference can actually eat, per common
// Indian dietary conventions — not a strict equality check. A
// vegetarian customer should not see "eggetarian" dishes (contains
// egg); a jain customer should only see jain-tagged dishes (jain
// excludes onion/garlic/root veg, which a plain "vegetarian" tag
// doesn't guarantee); non_vegetarian customers have no restriction.
const DIETARY_COMPATIBILITY: Record<string, string[]> = {
  non_vegetarian: ["vegetarian", "non_vegetarian", "eggetarian", "vegan", "jain"],
  vegetarian: ["vegetarian", "vegan", "jain"],
  eggetarian: ["vegetarian", "vegan", "jain", "eggetarian"],
  vegan: ["vegan"],
  jain: ["jain"],
}

function dietaryCompatible(customerDietary: string | null | undefined, dishDietary: string | null | undefined): boolean {
  if (!customerDietary) return true // no preference set — don't filter on it
  if (!dishDietary) return false // dish untagged — handled as notYetRated upstream, never "passes"
  const allowed = DIETARY_COMPATIBILITY[customerDietary]
  return allowed ? allowed.includes(dishDietary) : true
}

function hasAllergenConflict(customerAllergens: string[] | null | undefined, dishAllergens: string[] | null | undefined): boolean {
  if (!customerAllergens || customerAllergens.length === 0) return false
  if (!dishAllergens || dishAllergens.length === 0) return false
  const customerSet = new Set(customerAllergens.map(a => a.toLowerCase()))
  return dishAllergens.some(a => customerSet.has(a.toLowerCase()))
}

// ── Layer 2: weighted scoring ────────────────────────────────────────
// Weights are placeholders per spec §3.4 — "start with a reasonable
// hand-set weighting... tune once real order/feedback data exists."
// Spice is weighted highest since a bad spice mismatch "ruins the
// eating experience" in a way a cooking-type mismatch doesn't.
const WEIGHTS = {
  spice: 25,
  cuisine: 20,
  flavor: 15,
  cookingType: 15,
  mealCourse: 10,
  budget: 10,
  calorieAwareness: 5,
}
const MAX_SCORE = Object.values(WEIGHTS).reduce((a, b) => a + b, 0) // 100

function scalarScore(customerVal: number | null | undefined, dishVal: number | null | undefined, weight: number, maxDiff: number): number {
  if (customerVal == null || dishVal == null) return weight / 2 // neutral credit, not zero — no stated preference shouldn't tank the score
  const diff = Math.abs(customerVal - dishVal)
  return Math.max(0, weight * (1 - diff / maxDiff))
}

function setMembershipScore(customerPrefs: string[] | null | undefined, dishTags: string[] | string | null | undefined, weight: number): number {
  if (!customerPrefs || customerPrefs.length === 0) return weight / 2 // no preference stated — neutral
  const dishTagList = Array.isArray(dishTags) ? dishTags : dishTags ? [dishTags] : []
  if (dishTagList.length === 0) return weight / 2 // dish untagged on this soft attribute — neutral, not penalized
  const prefSet = new Set(customerPrefs.map(p => p.toLowerCase()))
  const hit = dishTagList.some(t => prefSet.has(t.toLowerCase()))
  return hit ? weight : 0
}

// price_tier is deliberately not stored (see 022's schema comment) —
// derived here relative to the average price of the dishes being
// matched over, so it stays correct as prices change.
function priceTier(price: number, avgPrice: number): "budget" | "mid_range" {
  return price <= avgPrice * 0.85 ? "budget" : "mid_range"
}

function budgetScore(customerPref: string | null | undefined, dishPrice: number, avgPrice: number, weight: number): number {
  if (!customerPref || customerPref === "no_preference") return weight / 2
  return priceTier(dishPrice, avgPrice) === customerPref ? weight : weight * 0.3 // not a hard miss, food isn't fungible on price alone
}

function calorieAwarenessScore(customerPref: string | null | undefined, calories: number | null | undefined, weight: number): number {
  if (!customerPref || customerPref === "no_preference" || calories == null) return weight / 2
  if (customerPref === "low_focus") return calories <= 350 ? weight : weight * 0.2
  if (customerPref === "moderate") return calories <= 550 ? weight : weight * 0.4
  return weight / 2
}

function scoreDish(profile: TasteProfile, item: MenuItem, avgPrice: number): { score: number; max: number } {
  let score = 0
  score += scalarScore(profile.spice_tolerance, item.spice_level, WEIGHTS.spice, 4)
  score += setMembershipScore(profile.cuisine_preferences, item.cuisine_category, WEIGHTS.cuisine)
  score += setMembershipScore(profile.flavor_preferences, item.flavor_profile, WEIGHTS.flavor)
  score += setMembershipScore(profile.cooking_type_preferences, item.cooking_type, WEIGHTS.cookingType)
  score += setMembershipScore(profile.meal_course_preferences, item.meal_course_type, WEIGHTS.mealCourse)
  score += budgetScore(profile.budget_sensitivity, item.price, avgPrice, WEIGHTS.budget)
  score += calorieAwarenessScore(profile.calorie_awareness, item.estimated_calories, WEIGHTS.calorieAwareness)
  return { score, max: MAX_SCORE }
}

// A profile counts as "too broad" if it hasn't meaningfully narrowed
// anything — no cuisine/flavor/cooking-type preference selected at
// all. Per spec: don't restrict input to prevent this, handle it on
// the display side by falling back to a non-personalized sort.
function isProfileTooBroad(profile: TasteProfile): boolean {
  const signalCount = [
    profile.cuisine_preferences,
    profile.flavor_preferences,
    profile.cooking_type_preferences,
  ].filter(p => p && p.length > 0).length
  return signalCount === 0 && profile.spice_tolerance == null
}

export function matchDishes(profile: TasteProfile, items: MenuItem[]): MatchResult {
  const available = items.filter(i => i.available)

  const notYetRated: MenuItem[] = []
  const candidates: MenuItem[] = []
  let excludedByAllergen = 0

  for (const item of available) {
    // Missing the two safety-critical fields → never scored, never
    // silently treated as safe. Shown separately.
    if (!item.dietary_type || item.spice_level == null) {
      notYetRated.push(item)
      continue
    }
    if (hasAllergenConflict(profile.allergens, item.allergens)) {
      excludedByAllergen++
      continue
    }
    if (!dietaryCompatible(profile.dietary_type, item.dietary_type)) {
      continue
    }
    candidates.push(item)
  }

  const avgPrice = candidates.length > 0 ? candidates.reduce((s, i) => s + i.price, 0) / candidates.length : 0
  const tooBroad = isProfileTooBroad(profile)

  const matched: MatchedDish[] = candidates.map(item => {
    const { score, max } = scoreDish(profile, item, avgPrice)
    const pct = max > 0 ? score / max : 0
    return {
      item,
      score,
      maxScore: max,
      badge: tooBroad ? null : pct >= 0.8 ? "Great match" : pct >= 0.55 ? "Good match" : null,
    }
  })

  if (tooBroad) {
    // Fall back to newest-first rather than implying a personalized
    // rank the data can't actually support.
    matched.sort((a, b) => (b.item.created_at ?? "").localeCompare(a.item.created_at ?? ""))
  } else {
    matched.sort((a, b) => b.score - a.score)
  }

  return { matched, notYetRated, excludedByAllergen, tooBroadFallback: tooBroad }
}
