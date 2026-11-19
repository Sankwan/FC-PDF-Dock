import type { PDFFont } from "pdf-lib";

/** Common characters the built-in PDF fonts lack, written in a form they have. */
const SUBSTITUTES: Record<string, string> = {
  "₵": "GH¢", "ɛ": "e", "Ɛ": "E", "ɔ": "o", "Ɔ": "O", "ŋ": "n", "Ŋ": "N",
  "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "...",
};

/**
 * Makes text safe for a standard PDF font (which only covers Western
 * European letters). Known characters are substituted; anything else
 * becomes "?" and `changed` tells the caller to warn.
 */
export function fitFontCharset(font: PDFFont, text: string): { text: string; changed: boolean } {
  const supported = new Set(font.getCharacterSet());
  let changed = false;
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (supported.has(code) || ch === " ") { out += ch; continue; }
    const sub = SUBSTITUTES[ch];
    if (sub && [...sub].every((c) => supported.has(c.codePointAt(0)!))) { out += sub; if (ch === "ɛ" || ch === "ɔ" || ch === "Ɛ" || ch === "Ɔ" || ch === "ŋ" || ch === "Ŋ") changed = true; continue; }
    out += "?";
    changed = true;
  }
  return { text: out, changed };
}
