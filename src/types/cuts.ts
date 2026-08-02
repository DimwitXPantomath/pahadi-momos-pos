// Shared cut-style and heat-level options for recipe/sub-recipe SOP lines.
// Deliberately not tied to a per-ingredient "is this cuttable" flag on the
// ingredients table — the chef just leaves this blank for lines where a cut
// doesn't apply (liquids, spices, powders) rather than the system gating it.

export const CUT_STYLES = [
  "Dice",
  "Small Dice (Brunoise)",
  "Julienne",
  "Batonnet",
  "Chiffonade",
  "Mince",
  "Rough Chop",
  "Fine Chop",
  "Wedges",
  "Rings",
  "Crushed",
  "Grated",
  "Puree",
  "Whole / No Cut",
  "Other",
] as const
export type CutStyle = typeof CUT_STYLES[number]

export const HEAT_LEVELS = ["low", "medium", "high"] as const
export type HeatLevel = typeof HEAT_LEVELS[number]

export const HEAT_LABELS: Record<HeatLevel, string> = {
  low: "🔥 Low",
  medium: "🔥🔥 Medium",
  high: "🔥🔥🔥 High",
}
