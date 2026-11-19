import { PDFDocument } from "pdf-lib";

/** One output file: its 1-based source pages and a name. */
export interface SplitPart { pages: number[]; name: string }

const label = (pages: number[]) => {
  // "p1-3", "p7", "p1-2+5"
  const runs: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    let j = i;
    while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j++;
    runs.push(i === j ? `${pages[i]}` : `${pages[i]}-${pages[j]}`);
    i = j;
  }
  const s = runs.join("+");
  return `p${s.length > 40 ? `${pages[0]}-${pages[pages.length - 1]}` : s}`;
};

export const partName = (base: string, pages: number[]) => `${base}_${label(pages)}.pdf`;

/**
 * Reads "1-3, 7, 12-" (also "-3" and "12-") into groups of pages. Each comma
 * part is one group. Errors name the part that's wrong and the valid range.
 */
export function parseRanges(input: string, total: number): { groups: number[][]; error?: string } {
  const groups: number[][] = [];
  const parts = input.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return { groups, error: "Enter the pages you want, for example 1-3, 7." };
  for (const part of parts) {
    const m = part.match(/^(\d*)\s*(?:[-–to]+\s*(\d*))?$/i);
    if (!m || (!m[1] && !m[2])) return { groups, error: `"${part}" isn't a page or range. Use numbers like 1-3 or 7.` };
    const isRange = /[-–]|to/i.test(part);
    const start = m[1] ? Number(m[1]) : 1;
    const end = isRange ? (m[2] ? Number(m[2]) : total) : start;
    for (const n of [start, end]) {
      if (n < 1 || n > total) return { groups, error: `There's no page ${n}. This file has pages 1 to ${total}.` };
    }
    const [a, b] = start <= end ? [start, end] : [end, start];
    groups.push(Array.from({ length: b - a + 1 }, (_, i) => a + i));
  }
  return { groups };
}

export function planFromGroups(groups: number[][], base: string, combine: boolean): SplitPart[] {
  if (!groups.length) return [];
  if (combine) {
    const pages = groups.flat();
    return [{ pages, name: partName(base, [...new Set(pages)].sort((a, b) => a - b)) }];
  }
  return groups.map((pages) => ({ pages, name: partName(base, pages) }));
}

/** Every `n` pages becomes a file. */
export const planEvery = (total: number, n: number, base: string): SplitPart[] => {
  const size = Math.max(1, Math.floor(n));
  const parts: SplitPart[] = [];
  for (let s = 1; s <= total; s += size) {
    const pages = Array.from({ length: Math.min(size, total - s + 1) }, (_, i) => s + i);
    parts.push({ pages, name: partName(base, pages) });
  }
  return parts;
};

const build = async (src: PDFDocument, pages: number[]) => {
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, pages.map((p) => p - 1));
  copied.forEach((p) => out.addPage(p));
  return out.save({ useObjectStreams: true });
};

export async function runSplit(file: File, parts: SplitPart[], onProgress?: (done: number, total: number) => void): Promise<File[]> {
  const src = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
  const files: File[] = [];
  for (let i = 0; i < parts.length; i++) {
    files.push(new File([(await build(src, parts[i].pages)) as BlobPart], parts[i].name, { type: "application/pdf" }));
    onProgress?.(i + 1, parts.length);
  }
  return files;
}

/**
 * Splits into as few files as possible, in page order, each no bigger than
 * `limit` bytes. For each file it finds the longest run of pages that fits
 * by doubling then halving (so a 200-page file needs a few dozen trial
 * saves, not hundreds). A single page bigger than the limit gets a file of
 * its own and is reported in `oversized`.
 */
export async function splitBySize(file: File, limit: number, onProgress?: (done: number, total: number) => void): Promise<{ files: File[]; parts: SplitPart[]; oversized: number[] }> {
  const src = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
  const total = src.getPageCount();
  const base = file.name.replace(/\.pdf$/i, "");
  const files: File[] = [];
  const parts: SplitPart[] = [];
  const oversized: number[] = [];
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

  let start = 1;
  while (start <= total) {
    let best = await build(src, [start]);
    let end = start;
    if (best.byteLength > limit) {
      oversized.push(start);
    } else {
      // Gallop: try 2, 4, 8… pages until too big or out of pages.
      let step = 1, lo = start, hi = -1;
      while (true) {
        const next = Math.min(total, start + step * 2 - 1);
        if (next === lo) break;
        const bytes = await build(src, range(start, next));
        if (bytes.byteLength <= limit) { lo = next; best = bytes; if (next === total) break; step *= 2; }
        else { hi = next; break; }
      }
      // Binary search between the last fit and the first miss.
      if (hi > 0) {
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          const bytes = await build(src, range(start, mid));
          if (bytes.byteLength <= limit) { lo = mid; best = bytes; } else hi = mid;
        }
      }
      end = lo;
    }
    const pages = range(start, end);
    const name = partName(base, pages);
    parts.push({ pages, name });
    files.push(new File([best as BlobPart], name, { type: "application/pdf" }));
    onProgress?.(end, total);
    start = end + 1;
  }
  return { files, parts, oversized };
}
