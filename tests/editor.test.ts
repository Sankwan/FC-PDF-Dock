import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFArray, PDFRawStream, decodePDFRawStream, degrees } from "pdf-lib";
import { exportEditedPdf, pagePlacer } from "../client/src/lib/editor/exportPdf.ts";
import { moveObject, resizeObject, type EditorObject } from "../client/src/lib/editor/types.ts";

// A 1x1 transparent PNG.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

async function blank(rotate = 0) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  if (rotate) page.setRotation(degrees(rotate));
  return doc.save();
}

async function content(bytes: Uint8Array, index = 0) {
  const doc = await PDFDocument.load(bytes);
  const c = doc.getPage(index).node.Contents();
  const streams = c instanceof PDFArray ? c.asArray().map((r) => doc.context.lookup(r)) : [c];
  return streams.map((s) => Buffer.from(decodePDFRawStream(s as PDFRawStream).decode()).toString("latin1")).join("\n");
}

const text = (o: Partial<EditorObject> = {}): EditorObject => ({
  id: "t", page: 0, kind: "text", x: 100, y: 100, w: 120, h: 14.4, text: "Approved", font: "sans", size: 12, bold: false, italic: false, color: "#111827", ...o,
} as EditorObject);

test("placer maps displayed top-left coordinates on unrotated and rotated pages", async () => {
  const doc = await PDFDocument.load(await blank());
  assert.deepEqual(pagePlacer(doc.getPage(0)).at(0, 0), { x: 0, y: 800 });
  assert.deepEqual(pagePlacer(doc.getPage(0)).at(600, 800), { x: 600, y: 0 });
  const r = await PDFDocument.load(await blank(90));
  // Displayed as 800 wide x 600 tall. Its top-left is the page's own bottom-left.
  assert.deepEqual(pagePlacer(r.getPage(0)).at(0, 0), { x: 0, y: 0 });
  assert.deepEqual(pagePlacer(r.getPage(0)).at(800, 600), { x: 600, y: 800 });
});

test("text is written as real text at the right baseline", async () => {
  const { bytes, signed, covered } = await exportEditedPdf(await blank(), [text()]);
  assert.equal(signed, false);
  assert.equal(covered, false);
  const c = await content(bytes);
  assert.match(c, /<417070726F766564> Tj/); // "Approved"
  // baseline = 800 - (100 + 12 * 0.947) = 688.636
  assert.match(c, /1 0 0 1 100 688\.636 Tm/);
});

test("multi-line text draws one line per row", async () => {
  const c = await content((await exportEditedPdf(await blank(), [text({ text: "One\nTwo" } as any)])).bytes);
  assert.equal((c.match(/ Tj/g) || []).length, 2);
});

test("edited text paints over the original and reports it", async () => {
  const r = await exportEditedPdf(await blank(), [text({ cover: { x: 98, y: 98, w: 80, h: 16 } } as any)]);
  assert.equal(r.covered, true);
  assert.match(await content(r.bytes), /1 1 1 rg/);
});

test("a signature image marks the file as signed", async () => {
  const r = await exportEditedPdf(await blank(), [{ id: "s", page: 0, kind: "image", x: 50, y: 600, w: 150, h: 50, src: PNG, signature: true }]);
  assert.equal(r.signed, true);
  // Bottom-left of the image box: y = 800 - (600 + 50) = 150
  assert.match(await content(r.bytes), /1 0 0 1 50 150 cm[\s\S]*150 0 0 50 0 0 cm/);
});

test("objects on a rotated page are drawn rotated to read upright", async () => {
  const r = await exportEditedPdf(await blank(90), [text({ x: 0, y: 0 } as any)]);
  assert.match(await content(r.bytes), /0\.0+6\d* 1 -1 0\.0+6\d* \d/);
});

test("text the standard fonts can't encode needs the image fallback", async () => {
  const twi = text({ text: "Mɛda wo ase ɔdɔ" } as any);
  await assert.rejects(exportEditedPdf(await blank(), [twi]), /standard PDF fonts/);
  const r = await exportEditedPdf(await blank(), [twi], { rasterizeText: async () => Uint8Array.from(Buffer.from(PNG.split(",")[1], "base64")) });
  assert.match(await content(r.bytes), / Do/);
});

test("shapes, lines, ink, ticks and stamps all export", async () => {
  const objs: EditorObject[] = [
    { id: "a", page: 0, kind: "rect", x: 10, y: 10, w: 50, h: 30, color: "#b91c1c", stroke: 2 },
    { id: "b", page: 0, kind: "ellipse", x: 70, y: 10, w: 50, h: 30, color: "#b91c1c", stroke: 2 },
    { id: "c", page: 0, kind: "arrow", x: 10, y: 50, w: 100, h: 0, from: { x: 10, y: 50 }, to: { x: 110, y: 50 }, color: "#111827", stroke: 2 },
    { id: "d", page: 0, kind: "ink", x: 10, y: 60, w: 40, h: 20, strokes: [[{ x: 10, y: 60 }, { x: 50, y: 80 }]], color: "#111827", stroke: 2, highlighter: true },
    { id: "e", page: 0, kind: "check", x: 10, y: 90, w: 16, h: 16, color: "#15803d", stroke: 2 },
    { id: "f", page: 0, kind: "stamp", x: 200, y: 200, w: 160, h: 36, text: "RECEIVED", color: "#b91c1c" },
    { id: "g", page: 0, kind: "whiteout", x: 300, y: 300, w: 40, h: 10, color: "#ffffff", stroke: 0 },
  ];
  const r = await exportEditedPdf(await blank(), objs);
  const doc = await PDFDocument.load(r.bytes);
  assert.equal(doc.getPageCount(), 1);
  assert.match(await content(r.bytes), /<5245434549564544> Tj/); // RECEIVED
});

test("moving and resizing carry the points of lines and ink", () => {
  const line: EditorObject = { id: "l", page: 0, kind: "line", x: 0, y: 0, w: 10, h: 10, from: { x: 0, y: 0 }, to: { x: 10, y: 10 }, color: "#000", stroke: 1 };
  const moved = moveObject(line, 5, 5) as typeof line;
  assert.deepEqual(moved.to, { x: 15, y: 15 });
  const big = resizeObject(line, { x: 0, y: 0, w: 20, h: 20 }) as typeof line;
  assert.deepEqual(big.to, { x: 20, y: 20 });
});
