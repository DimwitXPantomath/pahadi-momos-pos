// Free, local, no-API alternative to LLM-based document structuring.
// Regex/pattern-based line parsing over the Markdown text
// @firecrawl/pdf-inspector-wasm already extracted (see pdfExtract.ts).
// Deliberately not as reliable as an LLM would be on messy real-world
// PDFs — that tradeoff was chosen explicitly to avoid any per-call AI
// API cost (Anthropic, or anyone else). Every result from this feeds
// a review table the user checks/corrects before saving, same as
// before — this just changes how the first-guess gets made.

const UNIT_WORDS = [
  "kg", "kgs", "g", "gm", "gms", "gram", "grams",
  "ml", "l", "ltr", "ltrs", "litre", "litres", "liter", "liters",
  "tsp", "tbsp", "teaspoon", "teaspoons", "tablespoon", "tablespoons",
  "cup", "cups", "pcs", "pc", "piece", "pieces", "nos", "no", "unit", "units",
  "clove", "cloves", "leaf", "leaves", "packet", "packets", "pack", "packs",
  "box", "boxes", "bag", "bags", "bottle", "bottles", "dozen",
]
const UNIT_PATTERN = UNIT_WORDS.join("|")

function parseFraction(s: string): number | null {
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/) // "1 1/2"
  if (mixed) return parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3])
  const frac = s.match(/^(\d+)\/(\d+)$/) // "1/2"
  if (frac) return parseInt(frac[1]) / parseInt(frac[2])
  const dec = s.replace(",", ".").match(/^\d+(\.\d+)?$/)
  if (dec) return parseFloat(s.replace(",", "."))
  return null
}

const QTY = `(\\d+(?:[.,]\\d+)?(?:\\s+\\d+\\/\\d+)?|\\d+\\/\\d+)`

// "200g Paneer", "2 cups Flour", "1/2 tsp Salt", "- 3 pcs Onion"
const PATTERN_QTY_FIRST = new RegExp(
  `^\\s*(?:[-*•]|\\d+[.)])?\\s*${QTY}\\s*(${UNIT_PATTERN})s?\\.?\\s+(?:of\\s+)?(.+?)\\s*$`, "i"
)
// "Paneer - 200g", "Paneer: 200 g", "Paneer — 200g"
const PATTERN_NAME_FIRST = new RegExp(
  `^\\s*(?:[-*•]|\\d+[.)])?\\s*(.+?)[\\s:,\\-–—]+${QTY}\\s*(${UNIT_PATTERN})s?\\.?\\s*$`, "i"
)

export type GuessedIngredientLine = { name: string; quantity: number; unit: string }

/** Best-effort line-by-line guess at "name, qty, unit" triples — for recipe ingredient lists. */
export function guessIngredientLines(markdown: string): GuessedIngredientLine[] {
  const lines = markdown.split("\n").map(l => l.replace(/^\|+|\|+$/g, "").trim()).filter(Boolean)
  const out: GuessedIngredientLine[] = []

  for (const line of lines) {
    if (line.startsWith("#")) continue // headings
    let m = line.match(PATTERN_QTY_FIRST)
    if (m) {
      const qty = parseFraction(m[1].trim())
      if (qty != null && m[3].trim().length > 1) {
        out.push({ name: cleanName(m[3]), quantity: qty, unit: normalizeUnit(m[2]) })
        continue
      }
    }
    m = line.match(PATTERN_NAME_FIRST)
    if (m) {
      const qty = parseFraction(m[2].trim())
      if (qty != null && m[1].trim().length > 1) {
        out.push({ name: cleanName(m[1]), quantity: qty, unit: normalizeUnit(m[3]) })
      }
    }
  }
  return out
}

export type GuessedBillLine = { name: string; quantity: number; unit: string; unitPrice: number | null }

/** Best-effort parse of table-like rows — for vendor bills, which are usually tabular. */
export function guessBillLines(markdown: string): GuessedBillLine[] {
  const lines = markdown.split("\n").map(l => l.trim()).filter(Boolean)
  const out: GuessedBillLine[] = []

  for (const line of lines) {
    // Markdown table row: | Paneer | 5 | kg | 380 |
    if (line.includes("|")) {
      const cells = line.split("|").map(c => c.trim()).filter(Boolean)
      if (cells.length < 2) continue
      if (cells.every(c => /^[-:\s]+$/.test(c))) continue // separator row

      const numericCells = cells.map((c, i) => ({ i, n: parseFraction(c.replace(/[₹,]/g, "")) })).filter(c => c.n != null)
      const nameCell = cells.find(c => parseFraction(c.replace(/[₹,]/g, "")) == null)
      if (!nameCell || numericCells.length === 0) continue

      const unitCell = cells.find(c => new RegExp(`^(${UNIT_PATTERN})s?$`, "i").test(c))
      const qty = numericCells[0]?.n ?? null
      const price = numericCells.length > 1 ? numericCells[numericCells.length - 1].n : null
      if (qty == null) continue

      out.push({
        name: cleanName(nameCell),
        quantity: qty,
        unit: unitCell ? normalizeUnit(unitCell) : "",
        unitPrice: price,
      })
      continue
    }

    // Fall back to the same prose patterns recipes use, with an
    // optional trailing price: "Paneer 5kg ₹380" / "Paneer - 5 kg - 380"
    const m = line.match(PATTERN_QTY_FIRST)
    if (m) {
      const qty = parseFraction(m[1].trim())
      const priceMatch = line.match(/₹?\s*(\d+(?:[.,]\d+)?)\s*$/)
      if (qty != null && m[3].trim().length > 1) {
        out.push({
          name: cleanName(m[3]),
          quantity: qty,
          unit: normalizeUnit(m[2]),
          unitPrice: priceMatch ? parseFloat(priceMatch[1].replace(",", "")) : null,
        })
      }
    }
  }
  return out
}

function cleanName(raw: string): string {
  return raw.replace(/[*_`]/g, "").replace(/\s+/g, " ").trim()
}

function normalizeUnit(raw: string): string {
  const u = raw.toLowerCase().replace(/s$/, "")
  const map: Record<string, string> = {
    kg: "kg", gm: "g", gram: "g", g: "g",
    ml: "ml", l: "l", ltr: "l", litre: "l", liter: "l",
    tsp: "tsp", teaspoon: "tsp", tbsp: "tbsp", tablespoon: "tbsp",
    cup: "cup", pc: "pcs", piece: "pcs", pcs: "pcs", no: "nos", nos: "nos", unit: "pcs",
    clove: "cloves", leaf: "leaves", packet: "packet", pack: "packet",
    box: "box", bag: "bag", bottle: "bottle", dozen: "dozen",
  }
  return map[u] || raw.toLowerCase()
}
