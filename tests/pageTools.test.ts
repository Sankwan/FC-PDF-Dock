import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { PDFDocument, PDFRawStream, decodePDFRawStream, degrees, StandardFonts } from "pdf-lib";
import { applyWatermark, DEFAULT_WATERMARK } from "../client/src/lib/watermark.ts";
import { applyHeaderFooter, DEFAULT_HEADER_FOOTER, fillTokens } from "../client/src/lib/headerFooter.ts";
import { applyCrop, clampTrim, resizePages, PAPER, MM } from "../client/src/lib/crop.ts";
import { parseRanges, planEvery, planFromGroups, splitBySize } from "../client/src/lib/split.ts";
import { cellValue, tablesFromPieces, type TextPiece } from "../client/src/lib/tables.ts";
import { safeSheetNames, toCsv, writeXlsx } from "../client/src/lib/xlsx.ts";

async function doc(pages: { w?: number; h?: number; rotate?: number }[] = [{}]) {
  const d = await PDFDocument.create();
  for (const p of pages) {
    const page = d.addPage([p.w ?? 600, p.h ?? 800]);
    if (p.rotate) page.setRotation(degrees(p.rotate));
  }
  return d;
}

/** All drawing instructions on a page, decoded (after a save, as a reader sees them). */
const saved = async (d: PDFDocument) => PDFDocument.load(await d.save({ useObjectStreams: false }));
const ops = (d: PDFDocument, i = 0) => {
  const contents = d.getPage(i).node.Contents();
  const streams = contents && "asArray" in contents ? (contents as any).asArray().map((r: any) => d.context.lookup(r)) : [contents];
  return streams.map((s: any) => (s instanceof PDFRawStream ? new TextDecoder().decode(decodePDFRawStream(s).decode()) : "")).join("\n");
};

test("watermark: centred draws once per page, tiled draws many, rotated pages work", async () => {
  const d = await doc([{}, { rotate: 90 }]);
  await applyWatermark(d, DEFAULT_WATERMARK);
  const r = await saved(d);
  assert.equal((ops(r, 0).match(/Tj/g) ?? []).length, 1);
  assert.equal((ops(r, 1).match(/Tj/g) ?? []).length, 1);
  const t = await doc();
  await applyWatermark(t, { ...DEFAULT_WATERMARK, layout: "tiled" });
  assert.ok((ops(await saved(t)).match(/Tj/g) ?? []).length > 10);
});

test("watermark: unsupported characters are replaced, not a crash", async () => {
  const d = await doc();
  const r = await applyWatermark(d, { ...DEFAULT_WATERMARK, text: "Ɛkɔ ₵50" });
  assert.equal(r.changedText, true);
});

test("headers & footers: tokens are filled and the cover can be skipped", async () => {
  assert.equal(fillTokens("Page {page} of {pages} – {filename}", { page: 2, pages: 5, date: new Date(), fileName: "Report.pdf" }), "Page 2 of 5 – Report");
  const d = await doc([{}, {}, {}]);
  await applyHeaderFooter(d, { ...DEFAULT_HEADER_FOOTER, header: { left: "FC/REF/1", center: "", right: "" }, footer: { left: "", center: "Page {page} of {pages}", right: "" }, skipFirst: true }, { fileName: "x.pdf", totalPages: 3 });
  const r = await saved(d);
  assert.equal((ops(r, 0).match(/Tj/g) ?? []).length, 0);
  assert.equal((ops(r, 1).match(/Tj/g) ?? []).length, 2);
});

test("crop: trims the box as seen, including on rotated pages", async () => {
  const d = await doc([{}, { rotate: 90 }]);
  applyCrop(d, { top: 10, right: 20, bottom: 30, left: 40 });
  const a = d.getPage(0).getCropBox();
  assert.deepEqual([a.x, a.y, a.width, a.height], [40, 30, 540, 760]);
  // Rotated 90°: shown 800 wide × 600 tall. Shown top = the page's left edge.
  const b = d.getPage(1).getCropBox();
  assert.equal(Math.round(b.width), 600 - 10 - 30);
  assert.equal(Math.round(b.height), 800 - 40 - 20);
  assert.equal(Math.round(b.x), 10);
  assert.deepEqual(d.getPage(0).getMediaBox(), d.getPage(0).getCropBox());
});

test("crop: never removes more than 80% of a side", () => {
  const t = clampTrim({ top: 500, bottom: 500, left: 0, right: 0 }, 600, 800);
  assert.ok(t.top + t.bottom <= 640.001);
});

test("resize: every page lands on the paper in its own orientation", async () => {
  const d = await doc([{ w: 612, h: 792 }, { w: 900, h: 500 }, { w: 500, h: 900, rotate: 90 }]);
  const out = await resizePages(d, "a4");
  const sizes = out.getPages().map((p) => [Math.round(p.getWidth()), Math.round(p.getHeight())]);
  assert.deepEqual(sizes, [[595, 842], [842, 595], [842, 595]]);
  assert.equal(out.getPage(2).getRotation().angle, 0);
  assert.ok(Math.abs(PAPER.a4.w - 210 * MM) < 0.5);
});

test("split: ranges parse, with clear errors", () => {
  assert.deepEqual(parseRanges("1-3, 7, 9-", 10).groups, [[1, 2, 3], [7], [9, 10]]);
  assert.deepEqual(parseRanges("-2", 10).groups, [[1, 2]]);
  assert.match(parseRanges("0, 9", 5).error!, /no page 0.*1 to 5/);
  assert.match(parseRanges("1-x", 5).error!, /isn't a page/);
  assert.ok(parseRanges("", 5).error);
  assert.equal(planFromGroups([[1, 2], [5]], "doc", true)[0].name, "doc_p1-2+5.pdf");
  assert.deepEqual(planEvery(7, 3, "d").map((p) => p.pages.length), [3, 3, 1]);
});

test("split by size: every part is under the limit and pages stay in order", async () => {
  const d = await PDFDocument.create();
  const font = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 40; i++) {
    const p = d.addPage([600, 800]);
    // Incompressible-ish content so pages have real size.
    let s = ""; for (let k = 0; k < 400; k++) s += String.fromCharCode(33 + ((k * 7919 + i * 104729) % 90));
    for (let y = 0; y < 30; y++) p.drawText(s.slice(y * 13, y * 13 + 60), { x: 10, y: 780 - y * 20, size: 8, font });
  }
  const bytes = await d.save({ useObjectStreams: false });
  const file = new File([bytes], "big.pdf", { type: "application/pdf" });
  const limit = Math.round(bytes.byteLength / 4);
  const r = await splitBySize(file, limit);
  assert.ok(r.files.length >= 2 && r.files.length <= 8, `got ${r.files.length} parts`);
  assert.equal(r.oversized.length, 0);
  for (const f of r.files) assert.ok(f.size <= limit, `${f.name} ${f.size} > ${limit}`);
  assert.deepEqual(r.parts.flatMap((p) => p.pages), Array.from({ length: 40 }, (_, i) => i + 1));
});

const piece = (text: string, x: number, y: number, size = 10): TextPiece => ({ text, x, right: x + text.length * size * 0.5, y, size });

test("tables: rows and columns are found, empty cells kept in place", () => {
  const pieces = [
    piece("Seedling Allocation Notice", 50, 40, 14),
    piece("Species", 50, 100), piece("Quantity", 200, 100), piece("Nursery", 320, 100),
    piece("Teak", 50, 114), piece("1,200", 200, 114), piece("Kumasi", 320, 114),
    piece("Mahogany", 50, 128), piece("800", 200, 128),
    piece("Cedrela", 50, 142), piece("450", 200, 142), piece("Sunyani", 320, 142),
    piece("Please return a signed copy.", 50, 220),
  ];
  const [t, ...rest] = tablesFromPieces(pieces, 1);
  assert.equal(rest.length, 0);
  assert.deepEqual(t.rows, [["Species", "Quantity", "Nursery"], ["Teak", "1,200", "Kumasi"], ["Mahogany", "800", ""], ["Cedrela", "450", "Sunyani"]]);
});

test("cell values: numbers become numbers, IDs and phone numbers stay text", () => {
  assert.equal(cellValue("1,200"), 1200);
  assert.equal(cellValue("(500)"), -500);
  assert.equal(cellValue("12.5%"), 0.125);
  assert.equal(cellValue("0.75"), 0.75);
  assert.equal(cellValue("0244123456"), "0244123456");
  assert.equal(cellValue("GHA-123456789-0"), "GHA-123456789-0");
  assert.equal(cellValue("19/11/2026"), "19/11/2026");
  assert.equal(cellValue("12,34"), "12,34");
});

test("xlsx: a valid workbook with numbers, text and safe sheet names", async () => {
  assert.deepEqual(safeSheetNames(["Page 1", "Page 1", "a/b:c", ""]), ["Page 1", "Page 1 (2)", "a b c", "Sheet"]);
  const blob = await writeXlsx([{ name: "Page 1", rows: [["Species", "Qty"], ["Teak", "1,200"], ["<b>&", ""]], boldFirstRow: true }]);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  for (const f of ["[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/styles.xml", "_rels/.rels", "xl/_rels/workbook.xml.rels"]) assert.ok(zip.file(f), f);
  const sheet = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
  assert.match(sheet, /<c r="B2"( s="\d+")?><v>1200<\/v><\/c>/);
  assert.match(sheet, /&lt;b&gt;&amp;/);
  assert.match(sheet, /<c r="A1" t="inlineStr" s="1">/);
});

test("csv: quoted properly and formulas neutralised", () => {
  const csv = toCsv([["a,b", 'say "hi"', "=SUM(A1)", "-5", "-x"]]);
  assert.equal(csv, '﻿"a,b","say ""hi""",\'=SUM(A1),-5,\'-x');
});
