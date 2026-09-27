/**
 * The Forestry Commission letterhead, drawn as real PDF text and vector
 * rules (only the logo is an image), so letters stay crisp when printed and
 * their text stays searchable.
 *
 * Layout follows the current printed Wildlife Division letterhead: logo on
 * the left with "Our Ref" / "Your Ref" beneath it, the green
 * FORESTRY COMMISSION title with the division and contact lines centred to
 * its right, a full-width rule, and the Vision statement in the footer.
 *
 * Standard PDF fonts are used (Helvetica Bold for the title, Times for the
 * rest) so no font files need embedding. When FC Corporate Affairs supplies
 * the official artwork and typefaces, replace the logo PNG and fonts here.
 */
import {
  PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, TextRenderingMode, rgb, setCharacterSqueeze, setLineWidth,
  setStrokingRgbColor, setTextRenderingMode,
} from "pdf-lib";
import { ORG, type DivisionLetterhead } from "@/fc/org";
import { brand } from "@/brand";
import { loadPdfForEditing, makePdfFile } from "./pdfUtils";
import { loadLogo } from "./logo";

export const A4 = { w: 595.28, h: 841.89 };
const FC_GREEN = rgb(0x44 / 255, 0xab / 255, 0x4c / 255);
const INK = rgb(0.06, 0.06, 0.06);
const MARGIN_X = 30;

export interface LetterheadDetails {
  subtitle: string;
  lines: string[];
  ourRef?: string;
  yourRef?: string;
}

interface Fonts {
  title: PDFFont;
  bold: PDFFont;
  regular: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
  sansBold: PDFFont;
}


const embedFonts = async (doc: PDFDocument): Promise<Fonts> => ({
  title: await doc.embedFont(StandardFonts.HelveticaBold),
  sansBold: await doc.embedFont(StandardFonts.HelveticaBold),
  bold: await doc.embedFont(StandardFonts.TimesRomanBold),
  regular: await doc.embedFont(StandardFonts.TimesRoman),
  italic: await doc.embedFont(StandardFonts.TimesRomanItalic),
  boldItalic: await doc.embedFont(StandardFonts.TimesRomanBoldItalic),
});

/** Draws text centred on `cx`, optionally stretched/squeezed to `targetWidth`. */
const centred = (page: PDFPage, text: string, font: PDFFont, size: number, cx: number, y: number, color = INK, targetWidth?: number) => {
  const natural = font.widthOfTextAtSize(text, size);
  if (targetWidth) {
    const squeeze = Math.min(140, Math.max(80, (targetWidth / natural) * 100));
    const w = (natural * squeeze) / 100;
    page.pushOperators(setCharacterSqueeze(squeeze));
    page.drawText(text, { x: cx - w / 2, y, size, font, color });
    page.pushOperators(setCharacterSqueeze(100));
    return;
  }
  page.drawText(text, { x: cx - natural / 2, y, size, font, color });
};

/** Shrinks the font until the text fits `maxWidth`. */
const fitSize = (font: PDFFont, text: string, size: number, maxWidth: number) => {
  let s = size;
  while (s > 6 && font.widthOfTextAtSize(text, s) > maxWidth) s -= 0.25;
  return s;
};

/** Height (from the top of the page) where letter content can start. */
export const HEADER_BOTTOM = 150;
/** Height (from the bottom of the page) the footer occupies. */
export const FOOTER_TOP = 78;

export const drawLetterhead = (page: PDFPage, fonts: Fonts, logo: PDFImage, d: LetterheadDetails) => {
  const { width: W, height: H } = page.getSize();
  const top = (y: number) => H - y; // measure from the top edge

  // Logo, left.
  const logoW = 158;
  const logoH = (logo.height / logo.width) * logoW;
  page.drawImage(logo, { x: MARGIN_X - 4, y: top(18 + logoH), width: logoW, height: logoH });

  // Title block, centred in the space right of the logo.
  const blockLeft = MARGIN_X + logoW + 6;
  const blockRight = W - MARGIN_X;
  const cx = (blockLeft + blockRight) / 2;
  const blockW = blockRight - blockLeft;
  // The printed title is heavier than Helvetica Bold: outline the glyphs in
  // the same green to thicken them slightly.
  page.pushOperators(setTextRenderingMode(TextRenderingMode.FillAndOutline), setLineWidth(0.55), setStrokingRgbColor(0x44 / 255, 0xab / 255, 0x4c / 255));
  centred(page, "FORESTRY COMMISSION", fonts.title, 22, cx, top(44), FC_GREEN, Math.min(blockW, 330));
  page.pushOperators(setTextRenderingMode(TextRenderingMode.Fill), setLineWidth(1));
  let y = 44;
  if (d.subtitle.trim()) {
    y += 21;
    const sub = `(${d.subtitle.trim().toUpperCase()})`;
    centred(page, sub, fonts.bold, fitSize(fonts.bold, sub, 15.5, blockW), cx, top(y), FC_GREEN);
  }
  y += 6;
  for (const line of d.lines.filter((l) => l.trim())) {
    y += 12;
    centred(page, line.trim(), fonts.bold, fitSize(fonts.bold, line.trim(), 9.8, blockW), cx, top(y));
  }

  // Our Ref / Your Ref, under the logo.
  const refY1 = Math.max(18 + logoH + 16, 112);
  const refLine = (label: string, value: string | undefined, yy: number) => {
    page.drawText(label, { x: MARGIN_X, y: top(yy), size: 9.5, font: fonts.boldItalic, color: INK });
    const lx = MARGIN_X + fonts.boldItalic.widthOfTextAtSize(label, 9.5) + 2;
    if (value && value.trim()) {
      page.drawText(value.trim(), { x: lx + 2, y: top(yy) + 0.5, size: 10.5, font: fonts.regular, color: INK });
    } else {
      page.drawText(".".repeat(38), { x: lx, y: top(yy), size: 9.5, font: fonts.regular, color: INK });
    }
  };
  refLine("Our Ref:", d.ourRef, refY1);
  refLine("Your Ref:", d.yourRef, refY1 + 16);

  // Full-width rule.
  page.drawLine({ start: { x: MARGIN_X - 4, y: top(refY1 + 24) }, end: { x: W - MARGIN_X + 4, y: top(refY1 + 24) }, thickness: 1.1, color: INK });
  return refY1 + 24;
};

export const drawFooter = (page: PDFPage, fonts: Fonts) => {
  const { width: W } = page.getSize();
  const ruleY = 62;
  page.drawLine({ start: { x: MARGIN_X + 6, y: ruleY }, end: { x: W - MARGIN_X - 6, y: ruleY }, thickness: 1.1, color: INK });
  const label = "VISION: ";
  const size = 9.4;
  const maxW = W - 2 * (MARGIN_X + 30);
  // Wrap the vision text into at most two centred lines, label on the first.
  const words = ORG.vision.split(" ");
  const lines: string[] = [];
  let cur = "";
  const labelW = fonts.sansBold.widthOfTextAtSize(label, size + 1.5);
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    const limit = lines.length === 0 ? maxW - labelW : maxW;
    if (fonts.regular.widthOfTextAtSize(test, size) > limit && cur) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  let y = ruleY - 14;
  lines.forEach((ln, i) => {
    const textW = fonts.regular.widthOfTextAtSize(ln, size);
    if (i === 0) {
      const total = labelW + textW;
      const x0 = W / 2 - total / 2;
      page.drawText(label, { x: x0, y, size: size + 1.5, font: fonts.sansBold, color: FC_GREEN });
      page.drawText(ln, { x: x0 + labelW, y, size, font: fonts.regular, color: INK });
    } else {
      page.drawText(ln, { x: W / 2 - textW / 2, y, size, font: fonts.regular, color: INK });
    }
    y -= 11;
  });
};

const prepare = async (doc: PDFDocument) => {
  const fonts = await embedFonts(doc);
  const logo = await doc.embedPng(await loadLogo());
  return { fonts, logo };
};

export const detailsFor = (division: DivisionLetterhead, overrides?: Partial<LetterheadDetails>): LetterheadDetails => ({
  subtitle: division.subtitle,
  lines: division.lines,
  ...overrides,
});

/* ---------------- Blank letterhead ---------------- */

export const blankLetterheadPdf = async (d: LetterheadDetails): Promise<File> => {
  const doc = await PDFDocument.create();
  const { fonts, logo } = await prepare(doc);
  const page = doc.addPage([A4.w, A4.h]);
  drawLetterhead(page, fonts, logo, d);
  drawFooter(page, fonts);
  doc.setTitle("Forestry Commission letterhead");
  doc.setCreator(brand.name);
  doc.setProducer(brand.name);
  return makePdfFile(await doc.save(), "FC_letterhead.pdf");
};

/* ---------------- Letterhead on an existing PDF ---------------- */

export interface ApplyOptions {
  pages: "first" | "all";
  /** "fit": shrink each page's content into the space between header and footer. "overlay": draw on top as-is. */
  mode: "fit" | "overlay";
  /** On pages after the first when pages === "first", nothing is added. */
}

export const applyLetterhead = async (file: File, d: LetterheadDetails, opts: ApplyOptions): Promise<File> => {
  const src = await loadPdfForEditing(await file.arrayBuffer());
  const out = await PDFDocument.create();
  const { fonts, logo } = await prepare(out);
  const count = src.getPageCount();
  const embedded = opts.mode === "fit" ? await out.embedPages(src.getPages()) : [];
  const copied = opts.mode === "overlay" ? await out.copyPages(src, src.getPageIndices()) : [];

  for (let i = 0; i < count; i++) {
    const withHead = opts.pages === "all" || i === 0;
    if (opts.mode === "overlay" || !withHead) {
      const page = opts.mode === "overlay" ? out.addPage(copied[i]) : out.addPage([A4.w, A4.h]);
      if (opts.mode === "fit" && !withHead) {
        const e = embedded[i];
        const s = Math.min(A4.w / e.width, A4.h / e.height);
        page.drawPage(e, { x: (A4.w - e.width * s) / 2, y: (A4.h - e.height * s) / 2, width: e.width * s, height: e.height * s });
      }
      if (withHead) {
        drawLetterhead(page, fonts, logo, d);
        drawFooter(page, fonts);
      }
      continue;
    }
    // Fit: new A4 page, letterhead drawn, original page scaled into the gap.
    const page = out.addPage([A4.w, A4.h]);
    const headBottom = drawLetterhead(page, fonts, logo, d) + 6;
    drawFooter(page, fonts);
    const e = embedded[i];
    const availH = A4.h - headBottom - FOOTER_TOP;
    const s = Math.min(A4.w / e.width, availH / e.height);
    const w = e.width * s;
    const h = e.height * s;
    page.drawPage(e, { x: (A4.w - w) / 2, y: FOOTER_TOP + (availH - h), width: w, height: h });
  }
  out.setTitle(src.getTitle() ?? file.name.replace(/\.pdf$/i, ""));
  out.setCreator(brand.name);
  out.setProducer(brand.name);
  return makePdfFile(await out.save({ useObjectStreams: true }), file.name.replace(/\.pdf$/i, "") + "_letterhead.pdf");
};

/* ---------------- Write a letter ---------------- */

export interface Letter {
  ourRef: string;
  yourRef: string;
  date: string;
  recipient: string;
  salutation: string;
  subject: string;
  body: string;
  closing: string;
  signatoryName: string;
  signatoryTitle: string;
  forLine: string;
  cc: string;
  letterheadOnEveryPage: boolean;
}

export const ordinalDate = (d = new Date()) => {
  const day = d.getDate();
  const suffix = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  return `${day}${suffix} ${d.toLocaleString("en-GB", { month: "long" })}, ${d.getFullYear()}`;
};

const wrap = (text: string, font: PDFFont, size: number, maxW: number): string[][] => {
  // Returns paragraphs as arrays of lines; blank lines separate paragraphs.
  return text
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((para) => {
      const words = para.replace(/\n/g, " ").split(/\s+/).filter(Boolean);
      const lines: string[] = [];
      let cur = "";
      for (const w of words) {
        const test = cur ? `${cur} ${w}` : w;
        if (font.widthOfTextAtSize(test, size) > maxW && cur) {
          lines.push(cur);
          cur = w;
        } else cur = test;
      }
      if (cur) lines.push(cur);
      return lines;
    })
    .filter((l) => l.length);
};

/** Replaces characters the standard PDF fonts can't encode (e.g. curly quotes are fine; emoji aren't). */
const safe = (s: string) =>
  s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ]/g, "");

export const buildLetterPdf = async (d: LetterheadDetails, letter: Letter): Promise<File> => {
  const doc = await PDFDocument.create();
  const { fonts, logo } = await prepare(doc);
  const size = 12;
  const lead = 15.5;
  const left = 72;
  const right = A4.w - 72;
  const maxW = right - left;
  let page!: PDFPage;
  let y = 0;
  let pageNo = 0;

  const newPage = () => {
    page = doc.addPage([A4.w, A4.h]);
    pageNo++;
    if (pageNo === 1 || letter.letterheadOnEveryPage) {
      const bottom = drawLetterhead(page, fonts, logo, { ...d, ourRef: letter.ourRef, yourRef: letter.yourRef });
      drawFooter(page, fonts);
      y = A4.h - bottom - 30;
    } else {
      y = A4.h - 72;
    }
    if (pageNo > 1) {
      const label = `- ${pageNo} -`;
      page.drawText(label, { x: A4.w / 2 - fonts.regular.widthOfTextAtSize(label, 10) / 2, y: letter.letterheadOnEveryPage ? 24 : 40, size: 10, font: fonts.regular, color: INK });
    }
  };
  const bottomLimit = () => (pageNo === 1 || letter.letterheadOnEveryPage ? FOOTER_TOP + 16 : 72);
  const ensure = (h: number) => {
    if (y - h < bottomLimit()) newPage();
  };
  const text = (s: string, x: number, font = fonts.regular, sz = size) => page.drawText(safe(s), { x, y, size: sz, font, color: INK });

  newPage();

  // Date, right-aligned.
  if (letter.date.trim()) {
    const ds = safe(letter.date.trim());
    text(ds, right - fonts.regular.widthOfTextAtSize(ds, size));
    y -= lead * 2;
  }

  // Recipient block.
  for (const line of letter.recipient.split("\n").map((l) => l.trim()).filter(Boolean)) {
    ensure(lead);
    text(line, left);
    y -= lead;
  }
  y -= lead;

  if (letter.salutation.trim()) {
    ensure(lead);
    text(letter.salutation.trim(), left);
    y -= lead * 1.6;
  }

  // Subject: bold capitals, underlined, centred (usual Ghana public service style).
  if (letter.subject.trim()) {
    const subjLines = wrap(safe(letter.subject.trim().toUpperCase()), fonts.bold, size, maxW - 40).flat();
    for (const sl of subjLines) {
      ensure(lead);
      const w = fonts.bold.widthOfTextAtSize(sl, size);
      const x = A4.w / 2 - w / 2;
      text(sl, x, fonts.bold);
      page.drawLine({ start: { x, y: y - 2 }, end: { x: x + w, y: y - 2 }, thickness: 0.8, color: INK });
      y -= lead;
    }
    y -= lead * 0.6;
  }

  // Body: justified paragraphs.
  for (const para of wrap(safe(letter.body), fonts.regular, size, maxW)) {
    para.forEach((line, i) => {
      ensure(lead);
      const words = line.split(" ");
      const last = i === para.length - 1;
      if (last || words.length < 2) {
        text(line, left);
      } else {
        const wordsW = words.reduce((n, w) => n + fonts.regular.widthOfTextAtSize(w, size), 0);
        const gap = (maxW - wordsW) / (words.length - 1);
        let x = left;
        for (const w of words) {
          text(w, x);
          x += fonts.regular.widthOfTextAtSize(w, size) + gap;
        }
      }
      y -= lead;
    });
    y -= lead * 0.6;
  }

  // Closing and signature space.
  y -= lead * 0.4;
  ensure(lead * 6);
  if (letter.closing.trim()) {
    text(letter.closing.trim(), left);
    y -= lead * 4;
  }
  if (letter.signatoryName.trim()) {
    text(letter.signatoryName.trim().toUpperCase(), left, fonts.bold);
    y -= lead;
  }
  if (letter.signatoryTitle.trim()) {
    text(letter.signatoryTitle.trim(), left, fonts.italic);
    y -= lead;
  }
  if (letter.forLine.trim()) {
    text(`for: ${letter.forLine.trim().toUpperCase()}`, left, fonts.bold);
    y -= lead;
  }

  const ccLines = letter.cc.split("\n").map((l) => l.trim()).filter(Boolean);
  if (ccLines.length) {
    y -= lead;
    ensure(lead * (ccLines.length + 1));
    text("cc:", left, fonts.bold, 11);
    ccLines.forEach((l) => {
      text(l, left + 30, fonts.regular, 11);
      y -= lead * 0.95;
    });
  }

  doc.setTitle(letter.subject.trim() || "Letter");
  doc.setCreator(brand.name);
  doc.setProducer(brand.name);
  const base = (letter.subject.trim() || "Letter").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 60);
  return makePdfFile(await doc.save(), `${base}.pdf`);
};
