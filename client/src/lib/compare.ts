/**
 * Compares the text of two PDFs word by word and reports what changed,
 * with each word's position so changes can be highlighted on the pages.
 */

export interface Word {
  text: string;
  /** 1-based page */
  page: number;
  /** box on the page as seen, in points, top-left origin */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PageSize { width: number; height: number }

export type ChangeKind = "changed" | "added" | "removed";

export interface Change {
  id: number;
  kind: ChangeKind;
  removed: Word[];
  added: Word[];
  /** a few unchanged words either side, for context */
  before: string;
  after: string;
  numbers: boolean;
  /** pages where the change sits in each file (for jumping to it) */
  pageA: number;
  pageB: number;
}

const NEGATIONS = new Set(["not", "no", "never", "none", "cannot", "can't", "won't", "shall", "must", "may"]);

/** Comparison key: ignores curly vs straight quotes, dash styles and case-insensitive ligatures. */
export const normalise = (t: string) =>
  t.normalize("NFKC").replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/[‐-―]/g, "-");

type Op = { op: "=" | "-" | "+"; a?: number; b?: number };

/**
 * Myers' O(ND) difference algorithm over word keys. Returns null when more
 * than `maxEdits` edits are needed (the caller falls back to a coarser diff).
 */
export function myers(a: string[], b: string[], maxEdits = 4000): Op[] | null {
  // Trim the common start and end: most revisions change a little.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const A = a.slice(start, endA), B = b.slice(start, endB);
  const n = A.length, m = B.length, max = n + m;
  const ops: Op[] = [];
  for (let i = 0; i < start; i++) ops.push({ op: "=", a: i, b: i });

  if (n === 0 || m === 0) {
    for (let i = 0; i < n; i++) ops.push({ op: "-", a: start + i });
    for (let j = 0; j < m; j++) ops.push({ op: "+", b: start + j });
  } else {
    const offset = max + 1;
    const v = new Int32Array(2 * max + 3);
    const trace: Int32Array[] = [];
    let found = -1;
    for (let d = 0; d <= Math.min(max, maxEdits); d++) {
      trace.push(v.slice(offset - d - 1, offset + d + 2));
      for (let k = -d; k <= d; k += 2) {
        let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
        let y = x - k;
        while (x < n && y < m && A[x] === B[y]) { x++; y++; }
        v[offset + k] = x;
        if (x >= n && y >= m) { found = d; break; }
      }
      if (found >= 0) break;
    }
    if (found < 0) return null;
    // Walk back through the saved frontiers.
    const back: Op[] = [];
    let x = n, y = m;
    for (let d = found; d > 0; d--) {
      const t = trace[d];
      const at = (k: number) => t[k + d + 1];
      const k = x - y;
      const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
      const prevX = at(prevK), prevY = prevX - prevK;
      while (x > prevX && y > prevY) { back.push({ op: "=", a: start + x - 1, b: start + y - 1 }); x--; y--; }
      if (x === prevX) back.push({ op: "+", b: start + y - 1 }); else back.push({ op: "-", a: start + x - 1 });
      x = prevX; y = prevY;
    }
    while (x > 0 && y > 0) { back.push({ op: "=", a: start + x - 1, b: start + y - 1 }); x--; y--; }
    ops.push(...back.reverse());
  }
  for (let i = 0; i < a.length - endA; i++) ops.push({ op: "=", a: endA + i, b: endB + i });
  return ops;
}

/** Line keys for the coarse fallback: words grouped by page and line position. */
const lines = (words: Word[]) => {
  const out: { key: string; idx: number[] }[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i], last = out[out.length - 1];
    const prev = last && words[last.idx[last.idx.length - 1]];
    if (prev && prev.page === w.page && Math.abs(prev.y - w.y) < Math.max(prev.h, w.h) * 0.5) { last.idx.push(i); last.key += " " + normalise(w.text); }
    else out.push({ key: normalise(w.text), idx: [i] });
  }
  return out;
};

/** Word-level operations; very different files are compared line by line instead. */
export function diffWords(a: Word[], b: Word[]): Op[] {
  const ka = a.map((w) => normalise(w.text)), kb = b.map((w) => normalise(w.text));
  const fine = myers(ka, kb);
  if (fine) return fine;
  const la = lines(a), lb = lines(b);
  const coarse = myers(la.map((l) => l.key), lb.map((l) => l.key), 3000)
    // Nothing in common at all: everything was replaced.
    ?? [...la.map((_, i) => ({ op: "-" as const, a: i })), ...lb.map((_, i) => ({ op: "+" as const, b: i }))];
  const ops: Op[] = [];
  for (const o of coarse) {
    if (o.op === "=") la[o.a!].idx.forEach((ia, i) => ops.push({ op: "=", a: ia, b: lb[o.b!].idx[i] }));
    else if (o.op === "-") la[o.a!].idx.forEach((ia) => ops.push({ op: "-", a: ia }));
    else lb[o.b!].idx.forEach((ib) => ops.push({ op: "+", b: ib }));
  }
  return ops;
}

/** Groups operations into changes, merging edits separated by a single unchanged word. */
export function groupChanges(a: Word[], b: Word[], ops: Op[]): Change[] {
  const changes: Change[] = [];
  let i = 0, id = 0;
  const lastPage = (list: Word[], idx: number) => list[Math.max(0, Math.min(list.length - 1, idx))]?.page ?? 1;
  while (i < ops.length) {
    if (ops[i].op === "=") { i++; continue; }
    const startOp = i;
    const removed: Word[] = [], added: Word[] = [];
    let j = i;
    while (j < ops.length) {
      const o = ops[j];
      if (o.op === "-") { removed.push(a[o.a!]); j++; continue; }
      if (o.op === "+") { added.push(b[o.b!]); j++; continue; }
      // A lone equal word between edits joins them ("the 3 year plan" → "the 5 month plan").
      if (j + 1 < ops.length && ops[j + 1].op !== "=" && (removed.length || added.length)) {
        removed.push(a[o.a!]); added.push(b[o.b!]); j++; continue;
      }
      break;
    }
    // Context: nearest unchanged words in the revised (or original) text.
    const ctx = (from: number, dir: -1 | 1) => {
      const words: string[] = [];
      for (let k = from; k >= 0 && k < ops.length && words.length < 4; k += dir) {
        if (ops[k].op === "=") words.push(b[ops[k].b!].text);
        else break;
      }
      return (dir < 0 ? words.reverse() : words).join(" ");
    };
    const neighbourA = ops.slice(0, startOp).reverse().find((o) => o.a !== undefined)?.a ?? 0;
    const neighbourB = ops.slice(0, startOp).reverse().find((o) => o.b !== undefined)?.b ?? 0;
    const text = [...removed, ...added].map((w) => w.text.toLowerCase());
    changes.push({
      id: id++,
      kind: removed.length && added.length ? "changed" : added.length ? "added" : "removed",
      removed, added,
      before: ctx(startOp - 1, -1),
      after: ctx(j, 1),
      numbers: text.some((t) => /\d/.test(t)) || text.some((t) => NEGATIONS.has(t.replace(/[^a-z']/g, ""))),
      pageA: removed[0]?.page ?? lastPage(a, neighbourA),
      pageB: added[0]?.page ?? lastPage(b, neighbourB),
    });
    i = j;
  }
  return changes;
}

export const compareWords = (a: Word[], b: Word[]) => groupChanges(a, b, diffWords(a, b));

/** Reads every word with its position. Browser only (uses pdf.js). */
export async function extractWords(file: File, onProgress?: (done: number, total: number) => void): Promise<{ words: Word[]; pages: PageSize[] }> {
  const { loadPdfDocument, pdfjs } = await import("./pdfjs");
  const pdf = await loadPdfDocument(file);
  const words: Word[] = [];
  const pages: PageSize[] = [];
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      pages.push({ width: vp.width, height: vp.height });
      const content = await page.getTextContent();
      for (const item of content.items as any[]) {
        const str: string = item.str ?? "";
        if (!str.trim()) continue;
        const tx = pdfjs.Util.transform(vp.transform, item.transform);
        const size = Math.hypot(tx[2], tx[3]) || 10;
        const xScale = Math.hypot(tx[0], tx[1]) / (Math.hypot(item.transform[0], item.transform[1]) || 1);
        const width = (item.width || 0) * xScale;
        const angle = Math.atan2(tx[1], tx[0]);
        const perChar = width / Math.max(1, str.length);
        // Split the run into words, sharing its width by character count.
        const re = /\S+/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(str))) {
          const off = m.index * perChar, w = m[0].length * perChar;
          const bx = tx[4] + off * Math.cos(angle), by = tx[5] + off * Math.sin(angle);
          words.push({ text: m[0], page: n, x: bx, y: by - size * 0.85, w: Math.max(w, 1), h: size * 1.1 });
        }
      }
      onProgress?.(n, pdf.numPages);
    }
  } finally {
    await pdf.destroy();
  }
  return { words, pages };
}

/** A copy of the PDF with the given words highlighted (red for removed, green for added). */
export async function markWords(file: File, words: Word[], colour: "red" | "green", suffix: string): Promise<File> {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const { pagePlacer } = await import("./editor/exportPdf");
  const doc = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
  const pages = doc.getPages();
  const fill = colour === "red" ? rgb(0.95, 0.25, 0.25) : rgb(0.2, 0.75, 0.35);
  for (const w of words) {
    const page = pages[w.page - 1];
    if (!page) continue;
    const { at } = pagePlacer(page);
    const p1 = at(w.x - 1, w.y), p2 = at(w.x + w.w + 1, w.y + w.h);
    page.drawRectangle({ x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y), width: Math.abs(p2.x - p1.x), height: Math.abs(p2.y - p1.y), color: fill, opacity: 0.35 });
  }
  const bytes = await doc.save();
  return new File([bytes as BlobPart], file.name.replace(/\.pdf$/i, "") + suffix + ".pdf", { type: "application/pdf" });
}
