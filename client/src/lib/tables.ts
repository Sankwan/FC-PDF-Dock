/**
 * Finds tables in a PDF's text and turns them into rows and columns.
 *
 * PDFs don't store tables, only text at positions. This works the way
 * "stream" table extractors do: text on the same baseline forms a row,
 * gaps wider than about a character split a row into cells, and runs of
 * rows with two or more cells form a table. Column edges come from the
 * cells' horizontal extents across the table, so a column stays a column
 * even when some rows leave it empty.
 */

export interface TextPiece { text: string; x: number; right: number; y: number; size: number }

export interface Table {
  page: number;
  /** last page, when the table was joined across pages */
  toPage?: number;
  rows: string[][];
}

interface Cell { text: string; x0: number; x1: number }
interface Row { y: number; size: number; cells: Cell[] }

export function buildRows(pieces: TextPiece[]): Row[] {
  const sorted = pieces.filter((p) => p.text.trim()).sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: { y: number; size: number; pieces: TextPiece[] }[] = [];
  for (const p of sorted) {
    const row = rows.find((r) => Math.abs(r.y - p.y) < Math.max(2, Math.min(r.size, p.size) * 0.45));
    if (row) { row.pieces.push(p); row.size = Math.max(row.size, p.size); } else rows.push({ y: p.y, size: p.size, pieces: [p] });
  }
  rows.sort((a, b) => a.y - b.y);
  return rows.map((r) => {
    const ps = r.pieces.sort((a, b) => a.x - b.x);
    const cells: Cell[] = [];
    for (const p of ps) {
      const last = cells[cells.length - 1];
      const gap = last ? p.x - last.x1 : Infinity;
      if (last && gap < Math.max(4, p.size * 0.9)) {
        last.text += (gap > p.size * 0.15 && !last.text.endsWith(" ") && !p.text.startsWith(" ") ? " " : "") + p.text;
        last.x1 = Math.max(last.x1, p.right);
      } else cells.push({ text: p.text, x0: p.x, x1: p.right });
    }
    cells.forEach((c) => (c.text = c.text.replace(/\s+/g, " ").trim()));
    return { y: r.y, size: r.size, cells: cells.filter((c) => c.text) };
  });
}

/** Column edges from the rows that have the most cells (titles spanning columns would merge them). */
function columnsFor(rows: Row[]): [number, number][] {
  const counts = rows.map((r) => r.cells.length).sort((a, b) => a - b);
  const typical = counts[Math.floor(counts.length / 2)];
  const spans = rows.filter((r) => r.cells.length >= Math.max(2, typical - 1)).flatMap((r) => r.cells.map((c) => [c.x0, c.x1] as [number, number]));
  spans.sort((a, b) => a[0] - b[0]);
  const cols: [number, number][] = [];
  for (const [a, b] of spans) {
    const last = cols[cols.length - 1];
    if (last && a <= last[1] + 1.5) last[1] = Math.max(last[1], b); else cols.push([a, b]);
  }
  return cols;
}

function toGrid(rows: Row[]): string[][] {
  const cols = columnsFor(rows);
  return rows.map((r) => {
    const out = cols.map(() => "");
    for (const c of r.cells) {
      // The column this cell overlaps most, else the nearest.
      let best = 0, bestScore = -Infinity;
      cols.forEach(([a, b], i) => {
        const overlap = Math.min(b, c.x1) - Math.max(a, c.x0);
        const score = overlap > 0 ? overlap : -Math.min(Math.abs(a - c.x1), Math.abs(c.x0 - b));
        if (score > bestScore) { bestScore = score; best = i; }
      });
      out[best] = out[best] ? `${out[best]} ${c.text}` : c.text;
    }
    return out;
  });
}

/**
 * Tables on one page. With `everything`, all of the page's text is kept,
 * in reading order, with table rows split into columns.
 */
export function tablesFromPieces(pieces: TextPiece[], page: number, everything = false): Table[] {
  const rows = buildRows(pieces);
  if (everything) return rows.length ? [{ page, rows: toGrid(rows.length > 1 ? rows : rows) }] : [];
  const tables: Table[] = [];
  let block: Row[] = [];
  const flush = () => {
    // A single-cell row inside a table is usually a wrapped cell; keep it, but drop trailing ones.
    while (block.length && block[block.length - 1].cells.length < 2) block.pop();
    if (block.filter((r) => r.cells.length >= 2).length >= 2) tables.push({ page, rows: toGrid(block) });
    block = [];
  };
  for (const r of rows) {
    const prev = block[block.length - 1];
    const near = !prev || r.y - prev.y < Math.max(prev.size, r.size) * 2.6;
    if (!near) flush();
    if (r.cells.length >= 2) block.push(r);
    else if (block.length && near) block.push(r);
    else flush();
  }
  flush();
  // Drop columns that are empty in every row.
  return tables.map((t) => {
    const keep = t.rows[0].map((_, i) => t.rows.some((row) => row[i]));
    return { ...t, rows: t.rows.map((row) => row.filter((_, i) => keep[i])) };
  });
}

export type CellKind =
  | { type: "text"; value: string }
  | { type: "number"; value: number; format: "plain" | "thousands" | "money" | "percent" }
  | { type: "date"; value: number; text: string };

const CURRENCY = /^(?:GH\s?₵|GH\s?¢|GHS|GHC|₵|¢|USD|US\$|\$|GBP|£|EUR|€)\s?|\s?(?:GHS|GH₵|GH¢|₵|USD|GBP|EUR)$/i;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Days since 1899-12-30, which is how Excel stores dates. */
const excelSerial = (y: number, m: number, d: number) => {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
  const t = Date.UTC(y, m - 1, d);
  if (new Date(t).getUTCDate() !== d) return null; // 31/02 etc.
  return Math.round((t - Date.UTC(1899, 11, 30)) / 86400000);
};

/** Dates as written in Ghana: day first (12/03/2025, 12-Mar-2025, 12 March 2025) or ISO (2025-03-12). */
export function parseDate(t: string): number | null {
  let m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return excelSerial(+m[3], +m[2], +m[1]);
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return excelSerial(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})\.?,?[\s-]+(\d{4})$/);
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi >= 0 && (m[2].length === 3 || m[2].toLowerCase().startsWith(MONTHS[mi]))) return excelSerial(+m[3], mi + 1, +m[1]);
  }
  return null;
}

/**
 * What a cell holds. "1,200" → 1200, "(500)" → -500, "12.5%" → 0.125,
 * "GH₵ 1,250.00" → 1250 (money), "12/03/2025" → a real date. Phone numbers,
 * IDs with leading zeros and anything else stay as text.
 */
export function cellKind(text: string): CellKind {
  const t = text.trim();
  if (!t || t.length > 24) return { type: "text", value: t };
  const date = parseDate(t);
  if (date !== null) return { type: "date", value: date, text: t };
  let body = t, money = false;
  const neg = /^-/.test(body) && CURRENCY.test(body.slice(1)) ? (body = body.slice(1), true) : false;
  if (CURRENCY.test(body)) { body = body.replace(CURRENCY, "").trim(); money = true; }
  if (/^0\d/.test(body.replace(/[\s,]/g, ""))) return { type: "text", value: t }; // leading zero: phone/ID
  const m = body.match(/^\(?(-?)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\)?(%?)$/);
  if (!m || body.startsWith("(") !== body.endsWith(")")) return { type: "text", value: t };
  const digits = (m[2] + (m[3] ?? "")).replace(/,/g, "");
  if (digits.replace(".", "").length > 15) return { type: "text", value: t };
  let n = Number(digits);
  if (!Number.isFinite(n)) return { type: "text", value: t };
  const negative = (body.startsWith("(") ? !m[1] : !!m[1]) !== neg;
  if (negative) n = -n;
  if (m[4]) return { type: "number", value: n / 100, format: "percent" };
  return { type: "number", value: n, format: money ? "money" : m[2].includes(",") ? "thousands" : "plain" };
}

/** The number in a cell, or the text when it isn't one (dates stay text here). */
export function cellValue(text: string): string | number {
  const k = cellKind(text);
  return k.type === "number" ? k.value : text.trim();
}

const sameRow = (a: string[], b: string[]) =>
  a.length === b.length && a.every((c, i) => c.replace(/\s+/g, " ").trim().toLowerCase() === (b[i] ?? "").replace(/\s+/g, " ").trim().toLowerCase());

/**
 * Joins a table that carries on over the page break: the last table on one
 * page and the first on the next, with the same number of columns. A heading
 * row repeated at the top of the next page is dropped.
 */
export function joinContinued(tables: Table[]): Table[] {
  const out: Table[] = [];
  // Heading rows seen in each joined table (its own first row and each continuation's).
  const heads: string[][][] = [];
  for (const t of tables) {
    const i = out.length - 1;
    const prev = out[i];
    const prevEnd = prev ? prev.toPage ?? prev.page : -1;
    // Tables come in page order, so when t is on the page right after prev
    // ends, prev is the last table on its page and t the first on its own.
    if (prev && t.page === prevEnd + 1 && prev.rows[0]?.length === t.rows[0]?.length) {
      const repeated = heads[i].some((h) => sameRow(h, t.rows[0]));
      if (!repeated) heads[i].push(t.rows[0]);
      out[i] = { ...prev, toPage: t.page, rows: [...prev.rows, ...(repeated ? t.rows.slice(1) : t.rows)] };
    } else {
      out.push({ ...t, rows: [...t.rows] });
      heads.push([t.rows[0]]);
    }
  }
  return out;
}

export interface TotalProblem { row: number; col: number; stated: number; added: number }

/**
 * Checks "Total" rows: each number in such a row should equal the sum of the
 * numbers above it in that column (back to the heading or the previous
 * total). Catches misread digits from scans and typing slips.
 */
export function checkTotals(rows: string[][], headerRow = true): TotalProblem[] {
  const problems: TotalProblem[] = [];
  let from = headerRow ? 1 : 0;
  rows.forEach((r, ri) => {
    if (ri < from) return;
    const label = r.find((c) => c.trim() && cellKind(c).type === "text") ?? "";
    if (!/\b(sub[\s-]?total|grand total|total|sum)\b/i.test(label)) return;
    r.forEach((c, ci) => {
      const k = cellKind(c);
      if (k.type !== "number" || k.format === "percent") return;
      let added = 0, count = 0;
      for (let i = from; i < ri; i++) {
        const v = cellKind(rows[i][ci] ?? "");
        if (v.type === "number") { added += v.value; count++; }
      }
      if (count >= 2 && Math.abs(added - k.value) > Math.max(0.011, Math.abs(k.value) * 1e-9)) {
        problems.push({ row: ri, col: ci, stated: k.value, added: Math.round(added * 100) / 100 });
      }
    });
    from = ri + 1;
  });
  return problems;
}

/** Reads text pieces from every page. Browser only (pdf.js). */
export interface Extracted { tables: Table[]; pages: number; textPages: number; pieces: TextPiece[][] }

export async function extractTables(file: File, everything: boolean, onProgress?: (done: number, total: number) => void): Promise<Extracted> {
  const { loadPdfDocument, pdfjs } = await import("./pdfjs");
  const pdf = await loadPdfDocument(file);
  const tables: Table[] = [];
  const allPieces: TextPiece[][] = [];
  let textPages = 0;
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const pieces: TextPiece[] = [];
      for (const item of content.items as any[]) {
        if (!item.str?.trim()) continue;
        const tx = pdfjs.Util.transform(vp.transform, item.transform);
        if (Math.abs(tx[1]) > 0.01 * Math.abs(tx[0])) continue; // rotated text
        const size = Math.hypot(tx[2], tx[3]) || 10;
        const xScale = Math.hypot(tx[0], tx[1]) / (Math.hypot(item.transform[0], item.transform[1]) || 1);
        const w = (item.width || 0) * xScale;
        pieces.push({ text: item.str, x: tx[4], right: tx[4] + w, y: tx[5], size });
      }
      if (pieces.length) textPages++;
      allPieces.push(pieces);
      tables.push(...tablesFromPieces(pieces, n, everything));
      onProgress?.(n, pdf.numPages);
    }
    return { tables, pages: pdf.numPages, textPages, pieces: allPieces };
  } finally {
    await pdf.destroy();
  }
}

/** A table from the text inside a box the user drew (points, top-left origin). */
export function tableInBox(pieces: TextPiece[], page: number, box: { x0: number; y0: number; x1: number; y1: number }): Table | null {
  const inside = pieces.filter((p) => {
    const cx = (p.x + p.right) / 2, cy = p.y - p.size * 0.35;
    return cx >= box.x0 && cx <= box.x1 && cy >= box.y0 && cy <= box.y1;
  });
  const [t] = tablesFromPieces(inside, page, true);
  if (!t) return null;
  const keep = t.rows[0].map((_, i) => t.rows.some((row) => row[i]));
  return { ...t, rows: t.rows.map((row) => row.filter((_, i) => keep[i])) };
}
