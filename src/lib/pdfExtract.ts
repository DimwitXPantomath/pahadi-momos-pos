// Client-side PDF text extraction using @firecrawl/pdf-inspector-wasm.
// Runs entirely in the browser and stays entirely in the browser — no
// server call, no per-document cost, works offline once the page has
// loaded once. Fully local: this is Praang's own extraction step, not
// a call out to Claude or any other AI API (deliberately dropped —
// see chat, 2026-08-14: no ongoing per-use AI billing, and staff need
// this to work without a Claude/Cowork session open). The structured
// guessing that used to happen via an LLM now happens locally too —
// see pdfHeuristicParse.ts.

import init, { processPdf } from "@firecrawl/pdf-inspector-wasm"

let initPromise: Promise<unknown> | null = null

async function ensureInit() {
  if (!initPromise) initPromise = init()
  return initPromise
}

export type PdfExtractResult = {
  ok: true
  markdown: string
  pdfType: string
  needsOcr: boolean
  title: string | null
} | {
  ok: false
  error: string
}

/**
 * Extracts Markdown text from a PDF File (e.g. from an <input type="file">).
 * Returns ok:false with a friendly message for scanned/image-only PDFs —
 * this package classifies but does not OCR them (see README: "Image-only
 * documents still require a separate OCR step").
 */
export async function extractPdfText(file: File): Promise<PdfExtractResult> {
  try {
    await ensureInit()
    const bytes = new Uint8Array(await file.arrayBuffer())
    const result = processPdf(bytes)

    const needsOcr = result.pagesNeedingOcr.length > 0
    if (!result.markdown || (result.pdfType === "Scanned" || result.pdfType === "ImageBased")) {
      return {
        ok: false,
        error: "This PDF looks like a scanned image, not real text — this tool can only read text-based PDFs right now. Try a PDF exported directly from Word/Excel/Google Docs instead of a photo or scan.",
      }
    }

    return { ok: true, markdown: result.markdown, pdfType: result.pdfType, needsOcr, title: result.title ?? null }
  } catch (err: any) {
    return { ok: false, error: err?.message || "Couldn't read that PDF." }
  }
}
