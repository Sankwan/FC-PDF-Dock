import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts, degrees } from "pdf-lib";
import { addPageNumbers, formatPageNumber } from "../client/src/lib/pageNumbers.ts";
import { rebuildWithPdfLib, repairPdf } from "../client/src/lib/repair.ts";

async function sample(pages = 3, rotate?: number) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Body ${i + 1}`, { x: 50, y: 700, font, size: 14 });
    if (rotate && i === 1) page.setRotation(degrees(rotate));
  }
  return doc.save();
}

/** Page content as text, so we can see what was drawn. */
async function contentOf(bytes: Uint8Array, index: number) {
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPage(index);
  const { PDFRawStream, PDFArray, decodePDFRawStream } = await import("pdf-lib");
  const contents = page.node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map((r) => doc.context.lookup(r)) : [contents];
  return streams.map((s) => Buffer.from(decodePDFRawStream(s as InstanceType<typeof PDFRawStream>).decode()).toString("latin1")).join("\n");
}

test("page number formats", () => {
  assert.equal(formatPageNumber("n", 3, 9), "3");
  assert.equal(formatPageNumber("page-n", 3, 9), "Page 3");
  assert.equal(formatPageNumber("n-of-total", 3, 9), "3 of 9");
  assert.equal(formatPageNumber("page-n-of-total", 3, 9), "Page 3 of 9");
});

test("page numbers skip pages before fromPage and count from startAt", async () => {
  const out = await addPageNumbers(await sample(4), { fromPage: 2, startAt: 1, format: "n-of-total" });
  const doc = await PDFDocument.load(out);
  assert.equal(doc.getPageCount(), 4);
  // Text is hex-encoded by pdf-lib: "1 of 3" -> <31206F662033>
  const hex = (s: string) => Buffer.from(s, "latin1").toString("hex").toUpperCase();
  assert.ok(!(await contentOf(out, 0)).includes(hex("of 3")), "cover page stays unnumbered");
  assert.ok((await contentOf(out, 1)).includes(hex("1 of 3")));
  assert.ok((await contentOf(out, 3)).includes(hex("3 of 3")));
});

test("numbers on a rotated page are rotated to read upright", async () => {
  const out = await addPageNumbers(await sample(3, 90));
  const content = await contentOf(out, 1);
  // A 90° text matrix (cos ≈ 0, sin = 1), placed at x = 567: the right edge
  // of the unrotated page, which is the bottom of the page as displayed.
  assert.match(content, /0\.0+6\d* 1 -1 0\.0+6\d* 567 \d/);
});

test("pdf-lib rebuild recovers a file with a corrupted cross-reference table", async () => {
  const good = Buffer.from(await sample(3));
  const text = good.toString("latin1");
  // Point every xref entry at the wrong offset.
  const broken = text.replace(/(\d{10}) (\d{5}) n/g, (_m, _o, g) => `0000000001 ${g} n`);
  const out = await rebuildWithPdfLib(new Uint8Array(Buffer.from(broken, "latin1")));
  assert.equal((await PDFDocument.load(out)).getPageCount(), 3);
});

test("repair keeps going when a step fails, and prefers lossless results", async () => {
  const bytes = await sample(2);
  const count = async (b: Uint8Array) => (await PDFDocument.load(b)).getPageCount();
  const result = await repairPdf(bytes, {
    countPages: count,
    structure: async () => { throw new Error("qpdf unavailable"); },
    images: async () => { throw new Error("should not be needed"); },
  });
  assert.equal(result.method, "rebuild");
  assert.equal(result.pages, 2);
});

test("repair reports a clear error when nothing can be recovered", async () => {
  await assert.rejects(
    repairPdf(new TextEncoder().encode("not a pdf at all"), { countPages: async (b) => (await PDFDocument.load(b)).getPageCount() }),
    /too badly damaged/,
  );
});
