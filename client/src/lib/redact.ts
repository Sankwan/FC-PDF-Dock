/**
 * Permanent redaction, done so that it can be checked.
 *
 * Why pages are flattened: in a PDF, a black rectangle drawn over text only
 * hides it. The text is still in the file and can be copied out. Real
 * redaction has to delete the underlying text, images and drawings. Engines
 * that edit a page's text in place exist (PDFium, MuPDF), but they have had
 * bugs that left fragments of redacted words in the file (for example
 * github.com/embedpdf/embed-pdf-viewer/issues/801), and the reliable ones
 * are AGPL-licensed.
 *
 * So for each page that has redactions, we render the page to an image on
 * this device, paint the black boxes into the pixels, and replace the page
 * with that image. Nothing from the original page survives: no text, hidden
 * layers, form values or comments. Pages without redactions are copied
 * unchanged, so they keep their selectable text.
 *
 * The flattened pages then get their text back through local OCR (optional,
 * on by default), which cannot recover anything under a black box. Finally
 * we open the new file and search it for every piece of text that was under
 * a box, and report the result.
 */
import { PDFDict, PDFDocument, PDFName, StandardFonts } from "pdf-lib";
import { loadPdfDocument, pdfjs } from "./pdfjs";
import { loadPdfForEditing, makePdfFile } from "./pdfUtils";
import { createLocalOcrWorker } from "./ocrUtils";
import { addOcrTextLayer } from "./ocrLayer";
import { brand } from "@/brand";

type PdfJsDoc = Awaited<ReturnType<typeof loadPdfDocument>>;

/** A rectangle as fractions (0-1) of the page as displayed (rotation applied). */
export interface Box {
  id: string;
  page: number; // 1-based
  x: number;
  y: number;
  w: number;
  h: number;
  /** what found it: a pattern id, "search", or "manual" */
  source: string;
  /** text found under the box, when known; used for the final check */
  text?: string;
}

interface LineChar {
  x0: number;
  x1: number;
  top: number;
  bottom: number;
}

interface TextLine {
  text: string;
  chars: LineChar[];
}

export interface PageText {
  page: number;
  width: number;
  height: number;
  lines: TextLine[];
}

/**
 * Reads the text on a page as lines, with an approximate box per character.
 * pdf.js gives text in runs; we spread each run's width evenly over its
 * characters, which is close enough when we pad the final box a little.
 */
export const readPageText = async (pdf: PdfJsDoc, pageNumber: number): Promise<PageText> => {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  type Run = { str: string; x: number; y: number; w: number; h: number; family: string };
  const runs: Run[] = [];
  for (const item of content.items as any[]) {
    if (!item.str) continue;
    const tx = pdfjs.Util.transform(viewport.transform, item.transform);
    const fontHeight = Math.hypot(tx[2], tx[3]);
    const horizontal = Math.abs(tx[1]) < 0.01 * Math.abs(tx[0]);
    // Width is in text space; scale it into viewport space by the run's x-scale.
    const xScale = Math.hypot(tx[0], tx[1]) / (Math.hypot(item.transform[0], item.transform[1]) || 1);
    const w = (item.width || 0) * xScale;
    const family = (content.styles as any)[item.fontName]?.fontFamily || "serif";
    if (!horizontal || fontHeight <= 0) {
      // Rotated or vertical text: keep it findable with a rough square box.
      runs.push({ str: item.str, x: tx[4], y: tx[5] - fontHeight, w: Math.max(w, fontHeight * item.str.length * 0.5), h: fontHeight, family });
    } else {
      runs.push({ str: item.str, x: tx[4], y: tx[5] - fontHeight * 0.85, w, h: fontHeight * 1.1, family });
    }
  }
  const measure = document.createElement("canvas").getContext("2d")!;
  // Group runs into lines by their vertical position.
  runs.sort((a, b) => (Math.abs(a.y - b.y) < Math.max(a.h, b.h) * 0.5 ? a.x - b.x : a.y - b.y));
  const lines: TextLine[] = [];
  let current: Run[] = [];
  const flush = () => {
    if (!current.length) return;
    const chars: LineChar[] = [];
    let text = "";
    current.forEach((r, i) => {
      if (i > 0) {
        const prev = current[i - 1];
        const gap = r.x - (prev.x + prev.w);
        if (gap > r.h * 0.15 && !text.endsWith(" ") && !r.str.startsWith(" ")) {
          text += " ";
          chars.push({ x0: prev.x + prev.w, x1: r.x, top: r.y, bottom: r.y + r.h });
        }
      }
      // pdf.js gives one width per run, not per character. Split it in
      // proportion to each character's width in the run's font family
      // (narrow letters like i, l and t matter: spreading evenly shifted
      // boxes by a letter or more along a line).
      measure.font = `100px ${r.family}`;
      const widths = Array.from(r.str, (ch) => measure.measureText(ch).width || 50);
      const total = widths.reduce((a, b) => a + b, 0) || 1;
      let cx = r.x;
      for (let c = 0; c < r.str.length; c++) {
        const cw = (widths[c] / total) * r.w;
        chars.push({ x0: cx, x1: cx + cw, top: r.y, bottom: r.y + r.h });
        cx += cw;
      }
      text += r.str;
    });
    lines.push({ text, chars });
    current = [];
  };
  for (const r of runs) {
    const last = current[current.length - 1];
    if (last && Math.abs(r.y - last.y) > Math.max(r.h, last.h) * 0.5) flush();
    current.push(r);
  }
  flush();
  return { page: pageNumber, width: viewport.width, height: viewport.height, lines };
};

export interface Pattern {
  id: string;
  label: string;
  example: string;
  regex: RegExp;
}

/** Common personal identifiers in Ghanaian documents. */
export const PATTERNS: Pattern[] = [
  { id: "ghana-card", label: "Ghana Card numbers", example: "GHA-123456789-0", regex: /\bGHA[\s-]?\d{9}[\s-]?\d\b/gi },
  {
    id: "phone",
    label: "Phone numbers",
    example: "024 123 4567, +233 30 240 1210",
    regex: /(?:\+\s?233|\b00233|\b233|\b0)[\s-]?\(?\d{2}\)?[\s-]?\d{3}[\s-]?\d{4}\b/g,
  },
  { id: "email", label: "Email addresses", example: "name@example.com", regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { id: "ssnit", label: "SSNIT numbers", example: "C123456789012", regex: /\b[A-Z]\d{12}\b/g },
  { id: "long-number", label: "Account and ID numbers (10+ digits)", example: "1234567890123", regex: /\b\d(?:[\s-]?\d){9,18}\b/g },
];

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let boxSeq = 0;
const boxId = () => `b${Date.now().toString(36)}${(boxSeq++).toString(36)}`;

/** Finds matches of the given patterns and search terms, returning boxes (split per line). */
export const findMatches = (
  pages: PageText[],
  opts: { patterns: string[]; terms: string[]; wholeWords: boolean }
): Box[] => {
  const regexes: { id: string; re: RegExp }[] = [
    ...PATTERNS.filter((p) => opts.patterns.includes(p.id)).map((p) => ({ id: p.id, re: new RegExp(p.regex.source, p.regex.flags) })),
    ...opts.terms
      .map((t) => t.trim())
      .filter((t) => t.length >= 2)
      .map((t) => {
        const body = escapeRegex(t).replace(/\s+/g, "\\s+");
        return { id: "search", re: new RegExp(opts.wholeWords ? `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])` : body, "giu") };
      }),
  ];
  const boxes: Box[] = [];
  for (const pg of pages) {
    for (const line of pg.lines) {
      for (const { id, re } of regexes) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(line.text))) {
          if (!m[0].length) {
            re.lastIndex++;
            continue;
          }
          const chars = line.chars.slice(m.index, m.index + m[0].length);
          if (!chars.length) continue;
          const x0 = Math.min(...chars.map((c) => c.x0));
          const x1 = Math.max(...chars.map((c) => c.x1));
          const top = Math.min(...chars.map((c) => c.top));
          const bottom = Math.max(...chars.map((c) => c.bottom));
          // Generous padding: covering a sliver of a neighbouring letter is
          // fine; leaving part of a redacted one visible is not.
          const padX = (bottom - top) * 0.22;
          const padY = (bottom - top) * 0.12;
          boxes.push({
            id: boxId(),
            page: pg.page,
            x: Math.max(0, (x0 - padX) / pg.width),
            y: Math.max(0, (top - padY) / pg.height),
            w: Math.min(1, (x1 - x0 + padX * 2) / pg.width),
            h: Math.min(1, (bottom - top + padY * 2) / pg.height),
            source: id,
            text: m[0],
          });
        }
      }
    }
  }
  // The same text can match two patterns (a Ghana Card number is also a
  // long number). Keep the larger box and drop any box inside another.
  const inside = (a: Box, b: Box) =>
    a.page === b.page && a.x >= b.x - 1e-4 && a.y >= b.y - 1e-4 && a.x + a.w <= b.x + b.w + 1e-4 && a.y + a.h <= b.y + b.h + 1e-4;
  return boxes.filter((b, i) => !boxes.some((o, j) => j !== i && inside(b, o) && (!inside(o, b) || j < i)));
};

export const manualBox = (page: number, x: number, y: number, w: number, h: number): Box => ({ id: boxId(), page, x, y, w, h, source: "manual" });

/** Text that lies under a box, so the final check also covers hand-drawn boxes. */
export const textUnderBox = (pg: PageText, b: Box): string => {
  const bx0 = b.x * pg.width;
  const bx1 = (b.x + b.w) * pg.width;
  const by0 = b.y * pg.height;
  const by1 = (b.y + b.h) * pg.height;
  const parts: string[] = [];
  for (const line of pg.lines) {
    let s = "";
    line.chars.forEach((c, i) => {
      const cx = (c.x0 + c.x1) / 2;
      const cy = (c.top + c.bottom) / 2;
      if (cx >= bx0 && cx <= bx1 && cy >= by0 && cy <= by1) s += line.text[i];
    });
    if (s.trim()) parts.push(s.trim());
  }
  return parts.join(" ");
};

export interface RedactOptions {
  /** add a searchable OCR text layer back onto flattened pages */
  restoreText: boolean;
  /** remove document info, XMP metadata, attachments, scripts and bookmarks */
  removeHidden: boolean;
  onProgress?: (done: number, total: number, stage: string) => void;
}

export interface RedactResult {
  file: File;
  pagesFlattened: number;
  boxes: number;
  /** redacted strings that could still be found in the output, with where */
  leftovers: { text: string; pages: number[] }[];
  checkedStrings: number;
}

const RENDER_DPI = 200;

const sanitize = (doc: PDFDocument) => {
  const catalog = doc.catalog;
  catalog.delete(PDFName.of("Metadata"));
  catalog.delete(PDFName.of("OpenAction"));
  catalog.delete(PDFName.of("AA"));
  catalog.delete(PDFName.of("Outlines"));
  const names = catalog.lookup(PDFName.of("Names"));
  if (names instanceof PDFDict) {
    names.delete(PDFName.of("JavaScript"));
    names.delete(PDFName.of("EmbeddedFiles"));
  }
  doc.setTitle("");
  doc.setAuthor("");
  doc.setSubject("");
  doc.setKeywords([]);
  doc.setCreator(brand.name);
  doc.setProducer(brand.name);
};

const normaliseForSearch = (s: string) => s.toLowerCase().replace(/[\s\-()+.]/g, "");

export const applyRedactions = async (source: File, boxes: Box[], opts: RedactOptions): Promise<RedactResult> => {
  const { onProgress } = opts;
  const pdf = await loadPdfDocument(source);
  const srcDoc = await loadPdfForEditing(await source.arrayBuffer());
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const byPage = new Map<number, Box[]>();
  for (const b of boxes) byPage.set(b.page, [...(byPage.get(b.page) ?? []), b]);

  // Capture what's under every box before anything changes.
  const secrets = new Set<string>();
  for (const [pageNum, list] of byPage) {
    const pt = await readPageText(pdf, pageNum);
    for (const b of list) {
      const t = (b.text ?? textUnderBox(pt, b)).trim();
      if (normaliseForSearch(t).length >= 4) secrets.add(t);
      // Also check each word of a longer redaction (e.g. each part of a
      // name), skipping short number fragments that match too easily.
      for (const piece of t.split(/\s+/)) {
        const n = normaliseForSearch(piece);
        if (/[a-z]/.test(n) ? n.length >= 4 : n.length >= 6) secrets.add(piece);
      }
    }
  }

  let worker: Awaited<ReturnType<typeof createLocalOcrWorker>> | null = null;
  const flattenCount = byPage.size;
  let flattened = 0;
  try {
    if (opts.restoreText && flattenCount) {
      onProgress?.(0, flattenCount, "Loading text recognition");
      worker = await createLocalOcrWorker();
    }
    for (let n = 1; n <= pdf.numPages; n++) {
      const list = byPage.get(n);
      if (!list) {
        const [copied] = await out.copyPages(srcDoc, [n - 1]);
        out.addPage(copied);
        continue;
      }
      onProgress?.(flattened, flattenCount, `Redacting page ${n}`);
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(RENDER_DPI / 72, 4200 / Math.max(base.width, base.height));
      const vp = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Annotations (comments, form fields) are drawn into the pixels too,
      // then covered like everything else.
      await page.render({ canvas, canvasContext: ctx, viewport: vp, annotationMode: pdfjs.AnnotationMode.ENABLE } as any).promise;
      ctx.fillStyle = "#000000";
      for (const b of list) {
        ctx.fillRect(Math.floor(b.x * canvas.width) - 1, Math.floor(b.y * canvas.height) - 1, Math.ceil(b.w * canvas.width) + 2, Math.ceil(b.h * canvas.height) + 2);
      }

      const jpg = await out.embedJpg(canvas.toDataURL("image/jpeg", 0.9));
      const newPage = out.addPage([base.width, base.height]);
      newPage.drawImage(jpg, { x: 0, y: 0, width: base.width, height: base.height });

      if (worker) {
        onProgress?.(flattened, flattenCount, `Restoring searchable text on page ${n}`);
        await addOcrTextLayer(worker, newPage, font, canvas, scale);
      }
      canvas.width = canvas.height = 0;
      flattened++;
    }
  } finally {
    await worker?.terminate();
    await pdf.destroy();
  }

  if (opts.removeHidden) sanitize(out);
  else {
    out.setTitle(srcDoc.getTitle() ?? "");
    out.setAuthor(srcDoc.getAuthor() ?? "");
    out.setProducer(brand.name);
  }

  onProgress?.(flattenCount, flattenCount, "Checking the result");
  const bytes = await out.save({ useObjectStreams: true });
  const file = makePdfFile(bytes, source.name.replace(/\.pdf$/i, "") + "_redacted.pdf");

  // Verification: search the new file's text for every redacted string.
  const check = await loadPdfDocument(bytes);
  const leftovers = new Map<string, number[]>();
  try {
    const needles = Array.from(secrets).map((s) => ({ s, n: normaliseForSearch(s) }));
    for (let n = 1; n <= check.numPages; n++) {
      const tc = await (await check.getPage(n)).getTextContent();
      const hay = normaliseForSearch((tc.items as any[]).map((i) => i.str ?? "").join(" "));
      for (const { s, n: needle } of needles) {
        if (hay.includes(needle)) leftovers.set(s, [...(leftovers.get(s) ?? []), n]);
      }
    }
  } finally {
    await check.destroy();
  }

  return {
    file,
    pagesFlattened: flattened,
    boxes: boxes.length,
    leftovers: Array.from(leftovers, ([text, pages]) => ({ text, pages })),
    checkedStrings: secrets.size,
  };
};
