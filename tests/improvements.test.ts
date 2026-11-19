import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { cellKind, cellValue, checkTotals, joinContinued, tableInBox, parseDate, type TextPiece } from "../client/src/lib/tables.ts";
import { writeXlsx } from "../client/src/lib/xlsx.ts";
import { DEFAULT_HEADER_FOOTER, fillTokens, findOverlaps, pageNumbering } from "../client/src/lib/headerFooter.ts";
import { commonTrim, contentBox, pagesPerSheet, PAPER } from "../client/src/lib/crop.ts";
import { handOff, takeHandoff } from "../client/src/lib/handoff.ts";

test("cells: currency, dates, percentages and IDs", () => {
  assert.deepEqual(cellKind("GH₵ 1,250.00"), { type: "number", value: 1250, format: "money" });
  assert.deepEqual(cellKind("GHS 300"), { type: "number", value: 300, format: "money" });
  assert.deepEqual(cellKind("-GH₵ 40"), { type: "number", value: -40, format: "money" });
  assert.deepEqual(cellKind("1,200"), { type: "number", value: 1200, format: "thousands" });
  assert.equal(cellValue("(500)"), -500);
  assert.equal(cellValue("12.5%"), 0.125);
  assert.equal(cellValue("0244123456"), "0244123456");
  // 12 March 2025 is Excel day 45728, written day-first as in Ghana.
  assert.equal(parseDate("12/03/2025"), 45728);
  assert.equal(parseDate("12-Mar-2025"), 45728);
  assert.equal(parseDate("12 March 2025"), 45728);
  assert.equal(parseDate("2025-03-12"), 45728);
  assert.equal(parseDate("31/02/2025"), null);
  assert.equal(cellKind("12/03/2025").type, "date");
  assert.equal(cellValue("12/03/2025"), "12/03/2025");
});

test("tables: a table carried over the page break is joined, repeated headings dropped", () => {
  const head = ["Species", "Volume"];
  const joined = joinContinued([
    { page: 1, rows: [["Title", "x"], ["a", "b"]] },
    { page: 2, rows: [head, ["Teak", "10"]] },
    { page: 3, rows: [head, ["Wawa", "5"]] },
    { page: 3, rows: [["Other", "table", "3 cols"]] },
    { page: 5, rows: [head, ["Odum", "2"]] },
  ]);
  assert.equal(joined.length, 3 + 0); // p1+p2+p3 join (same 2 columns), 3-col table separate, p5 separate
  assert.equal(joined[0].page, 1); assert.equal(joined[0].toPage, 3);
  assert.deepEqual(joined[0].rows.map((r) => r[0]), ["Title", "a", "Species", "Teak", "Wawa"]);
});

test("tables: totals that don't add up are flagged", () => {
  const rows = [["Item", "Qty", "Amount"], ["Teak", "10", "1,000"], ["Wawa", "5", "250"], ["Total", "15", "1,350"], ["Odum", "1", "10"], ["Odum", "2", "20"], ["Sub-total", "3", "30"]];
  const p = checkTotals(rows);
  assert.deepEqual(p, [{ row: 3, col: 2, stated: 1350, added: 1250 }]);
});

test("tables: a box drawn around a table picks only the text inside", () => {
  const piece = (text: string, x: number, y: number): TextPiece => ({ text, x, right: x + text.length * 5, y, size: 10 });
  const pieces = [piece("Heading outside", 50, 40), piece("Name", 50, 100), piece("Qty", 200, 100), piece("Teak", 50, 115), piece("12", 200, 115), piece("Footer", 50, 700)];
  const t = tableInBox(pieces, 4, { x0: 40, y0: 85, x1: 260, y1: 120 })!;
  assert.equal(t.page, 4);
  assert.deepEqual(t.rows, [["Name", "Qty"], ["Teak", "12"]]);
  assert.equal(tableInBox(pieces, 4, { x0: 300, y0: 300, x1: 400, y1: 400 }), null);
});

test("xlsx: money, dates and percentages get formats; heading row is frozen", async () => {
  const blob = await writeXlsx([{ name: "S", rows: [["Date", "Amount", "Share"], ["12/03/2025", "GH₵ 1,250.00", "12.5%"]], boldFirstRow: true }]);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const sheet = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
  const styles = await zip.file("xl/styles.xml")!.async("string");
  assert.match(sheet, /<pane ySplit="1"[^>]*state="frozen"/);
  assert.match(sheet, /<c r="A2" s="8"><v>45728<\/v>/); // date style
  assert.match(sheet, /<c r="B2" s="4"><v>1250<\/v>/); // money style
  assert.match(sheet, /<c r="C2" s="6"><v>0.125<\/v>/); // percent style
  assert.match(sheet, /<c r="A1" t="inlineStr" s="1">/); // bold heading
  assert.match(styles, /formatCode="dd\/mm\/yyyy"/);
  assert.match(styles, /<cellXfs count="10">/);
});

test("headers: numbering can start anywhere, skip the cover and pad with zeros", () => {
  const o = { ...DEFAULT_HEADER_FOOTER };
  assert.deepEqual(pageNumbering(o, 1, 10), { page: 1, pages: 10 });
  assert.deepEqual(pageNumbering({ ...o, startAt: 45 }, 3, 10), { page: 47, pages: 54 });
  assert.deepEqual(pageNumbering({ ...o, skipFirst: true, countCover: false }, 2, 10), { page: 1, pages: 9 });
  assert.equal(fillTokens("FC/REF/{page}", { page: 7, pages: 9, date: new Date(), fileName: "a.pdf", digits: 4 }), "FC/REF/0007");
});

test("headers: overlaps with the page's own content are found", async () => {
  const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
  const blank = () => ({ lum: new Uint8Array(100 * 141).fill(255), px: 100, py: 141, width: 600, height: 846 });
  const busy = blank();
  // Ink across the bottom strip, where a footer goes.
  for (let y = 132; y < 138; y++) for (let x = 10; x < 90; x++) busy.lum[y * 100 + x] = 0;
  const o = { ...DEFAULT_HEADER_FOOTER, footer: { left: "", center: "Page {page} of {pages}", right: "" } };
  assert.deepEqual(findOverlaps(o, [blank(), busy, blank()], font, "x.pdf", 3), [2]);
  assert.deepEqual(findOverlaps({ ...o, skipFirst: true }, [busy], font, "x.pdf", 1), []);
});

test("crop: content box ignores dust and scanner-edge shadows; common trim", () => {
  const w = 200, h = 280;
  const lum = new Uint8Array(w * h).fill(225); // greyish scanned paper
  for (let y = 0; y < h; y++) for (let x = 0; x < 6; x++) lum[y * w + x] = 40; // dark left-edge shadow
  for (let y = 60; y < 200; y++) for (let x = 50; x < 150; x++) if ((x + y) % 3 === 0) lum[y * w + x] = 30; // text block
  lum[10 * w + 190] = 0; lum[270 * w + 20] = 0; // dust
  assert.deepEqual(contentBox(lum, w, h), { minX: 50, minY: 60, maxX: 149, maxY: 199 });
  assert.equal(contentBox(new Uint8Array(w * h).fill(250), w, h), null);
  assert.deepEqual(commonTrim([{ top: 10, right: 20, bottom: 30, left: 40 }, null, { top: 15, right: 5, bottom: 35, left: 45 }]), { top: 10, right: 5, bottom: 30, left: 40 });
});

test("crop: 2 and 4 pages per sheet", async () => {
  const src = await PDFDocument.create();
  for (let i = 0; i < 5; i++) src.addPage([595, 842]);
  const two = await pagesPerSheet(src, "a4", 2);
  assert.equal(two.getPageCount(), 3);
  assert.deepEqual([Math.round(two.getPage(0).getWidth()), Math.round(two.getPage(0).getHeight())], [Math.round(PAPER.a4.h), Math.round(PAPER.a4.w)]);
  const four = await pagesPerSheet(src, "a4", 4);
  assert.equal(four.getPageCount(), 2);
  assert.equal(Math.round(four.getPage(0).getHeight()), Math.round(PAPER.a4.h));
});

test("handoff: only the intended page takes it", () => {
  const f = new File(["x"], "a.pdf", { type: "application/pdf" });
  handOff({ files: [f], to: "/sign-pdf", via: "next" });
  assert.equal(takeHandoff("/compress-pdf", "next"), null);
  assert.equal(takeHandoff("/sign-pdf", "next")?.files[0], f);
  assert.equal(takeHandoff("/sign-pdf", "next"), null);
});
