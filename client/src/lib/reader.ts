/**
 * Read PDF: splits each page's text into sentences and remembers where each
 * sentence sits on the page, so the one being read aloud can be highlighted.
 */

/** A run of text as pdf.js gives it, in page points (top-left origin). */
export interface TextRun { str: string; x: number; y: number; w: number; h: number; eol?: boolean }
export interface Box { x: number; y: number; w: number; h: number }
export interface Sentence {
  id: number; page: number; text: string; boxes: Box[];
  /** starts a new paragraph or heading (for the Text view) */
  para?: boolean;
}

const ABBREVIATIONS = new Set(["mr", "mrs", "ms", "dr", "prof", "rev", "hon", "no", "nos", "ref", "st", "etc", "e.g", "i.e", "vs", "fig", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec", "approx", "dept", "govt", "ltd", "co", "p", "pp", "vol"]);

/**
 * Sentence ends: . ! ? (and closing quotes/brackets after them) followed by
 * a space and a capital or digit; also a blank line or a line ending without
 * punctuation that is short (a heading) closes the sentence.
 */
function sentenceEnds(text: string): number[] {
  const ends: number[] = [];
  const re = /[.!?…]+["'”’)\]]*(?=\s+["'“‘(]?[A-Z0-9])|\n{2,}/g;
  for (let m; (m = re.exec(text)); ) {
    if (m[0][0] === ".") {
      const word = text.slice(0, m.index).match(/([A-Za-z.]+)$/)?.[1]?.toLowerCase() ?? "";
      if (ABBREVIATIONS.has(word) || /^[a-z]$/i.test(word) || /^(?:[a-z]\.)+[a-z]$/i.test(word)) continue;
      if (/\d$/.test(text.slice(0, m.index)) && /^\.\d/.test(text.slice(m.index))) continue;
    }
    ends.push(m.index + m[0].length);
  }
  return ends;
}

/** Builds the sentences of one page from its text runs. */
export function sentencesFromRuns(runs: TextRun[], page: number, firstId = 0): Sentence[] {
  // Page text, with each character mapped back to its run.
  let text = "";
  const owner: number[] = [];
  const offset: number[] = [];
  let lineStart = 0;
  runs.forEach((r, i) => {
    const prev = runs[i - 1];
    if (prev && text && !/\s$/.test(text)) {
      // A new line, or a visible gap on the same line, means a space.
      const newLine = prev.eol || Math.abs(r.y - prev.y) > Math.min(r.h, prev.h) * 0.5;
      const gap = !newLine && r.x - (prev.x + prev.w) > r.h * 0.15;
      if (newLine) {
        // A short line without closing punctuation is a heading or a list item: keep it separate.
        const lineEndsSentence = /[.!?:;]["'”’)]?$/.test(text.trimEnd());
        const prevLine = text.slice(lineStart);
        const bigGap = r.y - prev.y > Math.max(r.h, prev.h) * 1.9;
        const nextStarts = /^\s*(?:[A-Z0-9•\-–(]|$)/.test(r.str);
        text += !lineEndsSentence && (bigGap || (prevLine.trim().length < 45 && nextStarts)) ? "\n\n" : " ";
        lineStart = text.length;
      } else if (gap) text += " ";
      while (owner.length < text.length) { owner.push(-1); offset.push(0); }
    }
    for (let k = 0; k < r.str.length; k++) { text += r.str[k]; owner.push(i); offset.push(k); }
  });

  const out: Sentence[] = [];
  let start = 0;
  let gapFrom = 0;
  for (const end of [...sentenceEnds(text), text.length]) {
    const raw = text.slice(start, end);
    const lead = raw.length - raw.trimStart().length;
    const s = start + lead, e = start + raw.trimEnd().length;
    start = end;
    const clean = text.slice(s, e).replace(/\s+/g, " ").trim();
    // Skip bare page numbers and rules ("— 3 —"); keep anything with a word or a real number.
    if (!/[A-Za-z]|\d.*\d/.test(clean)) continue;
    const para = out.length === 0 || text.slice(gapFrom, s).includes("\n\n");
    gapFrom = e;
    // One box per run the sentence touches, covering just its part of the run.
    const boxes: Box[] = [];
    let i = s;
    while (i < e) {
      const run = owner[i];
      if (run < 0) { i++; continue; }
      let j = i;
      while (j < e && owner[j] === run) j++;
      const r = runs[run];
      const n = Math.max(1, r.str.length);
      const a = offset[i], b = offset[j - 1] + 1;
      boxes.push({ x: r.x + (r.w * a) / n, y: r.y - r.h * 0.85, w: Math.max(1, (r.w * (b - a)) / n), h: r.h * 1.15 });
      i = j;
    }
    // Merge boxes on the same line so the highlight reads as one band.
    const merged: Box[] = [];
    for (const b of boxes) {
      const last = merged[merged.length - 1];
      if (last && Math.abs(last.y - b.y) < b.h * 0.4 && b.x - (last.x + last.w) < b.h * 1.2 && b.x >= last.x) {
        const right = Math.max(last.x + last.w, b.x + b.w);
        last.y = Math.min(last.y, b.y); last.h = Math.max(last.h, b.h); last.w = right - last.x;
      } else merged.push({ ...b });
    }
    out.push({ id: firstId + out.length, page, text: clean, boxes: merged, para });
  }
  return out;
}

export interface ReadablePage { page: number; width: number; height: number; sentences: Sentence[] }

/** Reads every page's text with pdf.js. Browser only. */
export async function readableText(pdf: any, onProgress?: (done: number, total: number) => void): Promise<ReadablePage[]> {
  const { pdfjs } = await import("./pdfjs");
  const pages: ReadablePage[] = [];
  let id = 0;
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const runs: TextRun[] = [];
    for (const item of content.items as any[]) {
      if (typeof item.str !== "string") continue;
      const tx = pdfjs.Util.transform(vp.transform, item.transform);
      const h = Math.hypot(tx[2], tx[3]) || 10;
      if (Math.abs(tx[1]) > 0.01 * Math.abs(tx[0])) continue; // rotated text (stamps, margins)
      const xScale = Math.hypot(tx[0], tx[1]) / (Math.hypot(item.transform[0], item.transform[1]) || 1);
      if (!item.str) { if (item.hasEOL && runs.length) runs[runs.length - 1].eol = true; continue; }
      runs.push({ str: item.str, x: tx[4], y: tx[5], w: (item.width || 0) * xScale, h, eol: item.hasEOL });
    }
    const sentences = sentencesFromRuns(runs, n, id);
    id += sentences.length;
    pages.push({ page: n, width: vp.width, height: vp.height, sentences });
    onProgress?.(n, pdf.numPages);
  }
  return pages;
}
