// Small dependency-free fuzzy string matcher — used to match ingredient
// names extracted from a PDF (e.g. "Onion (Red)") against this outlet's
// existing ingredients list (e.g. "Red Onion") so imports can suggest a
// match instead of always creating duplicates. Deliberately simple
// (Levenshtein + substring boost) rather than pulling in a library for
// one narrow use case.

function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[()[\]{}]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1])
    }
  }
  return dp[m][n]
}

/** 0 (no match) to 1 (identical) */
export function similarity(a: string, b: string): number {
  const na = normalize(a), nb = normalize(b)
  if (!na || !nb) return 0
  if (na === nb) return 1

  const maxLen = Math.max(na.length, nb.length)
  const dist = levenshtein(na, nb)
  let score = 1 - dist / maxLen

  // Boost for one string containing the other (e.g. "onion" vs "red onion")
  if (na.includes(nb) || nb.includes(na)) {
    score = Math.max(score, 0.75)
  }

  return Math.max(0, Math.min(1, score))
}

export function findBestMatch<T extends { id: string; name: string }>(
  query: string,
  candidates: T[],
  threshold = 0.55
): { match: T; score: number } | null {
  let best: { match: T; score: number } | null = null
  for (const c of candidates) {
    const score = similarity(query, c.name)
    if (score >= threshold && (!best || score > best.score)) {
      best = { match: c, score }
    }
  }
  return best
}
