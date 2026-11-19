import test from "node:test";
import assert from "node:assert/strict";
import { PDFDict, PDFDocument, PDFName, PDFRef, PDFString, StandardFonts } from "pdf-lib";
import { addSignRecord, checkSignRecord, pageFingerprint } from "../client/src/lib/signRecord.ts";

const SIGNED_AT = new Date("2026-11-19T10:00:00.000Z");

async function signed() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  page.drawText("Signature: ______", { x: 50, y: 100, size: 12, font: await doc.embedFont(StandardFonts.Helvetica) });
  page.node.set(PDFName.of("Annots"), doc.context.obj([doc.context.obj({ Type: "Annot", Subtype: "Text", Rect: [10, 10, 20, 20], Contents: PDFString.of("ok") })]));
  return addSignRecord(await doc.save(), SIGNED_AT);
}

/** Loads, lets `edit` change the document, and saves without touching other metadata. */
async function edit(bytes: Uint8Array, change: (doc: PDFDocument, info: PDFDict) => void | Promise<void>) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const ref = doc.context.trailerInfo.Info;
  const info = (ref instanceof PDFRef ? doc.context.lookup(ref) : ref) as PDFDict;
  await change(doc, info);
  return doc.save();
}

const check = (bytes: Uint8Array) => checkSignRecord(new File([bytes], "x.pdf", { type: "application/pdf" }));

test("an untouched signed file is reported unchanged, with its time covered", async () => {
  const r = await check(await signed());
  assert.equal(r.status, "unchanged");
  assert.ok(r.status === "unchanged" && r.timeCovered);
});

test("changing only the recorded signing time is caught", async () => {
  const bytes = await edit(await signed(), (_doc, info) => info.set(PDFName.of("PDFDockSignedAt"), PDFString.of("2030-01-01T00:00:00.000Z")));
  assert.equal((await check(bytes)).status, "changed");
});

test("changing an annotation's text without changing the count is caught", async () => {
  const bytes = await edit(await signed(), (doc) => {
    const annots = doc.getPage(0).node.lookup(PDFName.of("Annots")) as any;
    (annots.lookup(0) as PDFDict).set(PDFName.of("Contents"), PDFString.of("changed"));
  });
  assert.equal((await check(bytes)).status, "changed");
});

test("adding a page is caught", async () => {
  const bytes = await edit(await signed(), (doc) => { doc.addPage(); });
  assert.equal((await check(bytes)).status, "changed");
});

test("removing the record version falls back to the older check, which flags the time as unconfirmed", async () => {
  // Older files: fingerprint over the pages only, no version entry.
  const bytes = await edit(await signed(), async (doc, info) => {
    info.delete(PDFName.of("PDFDockRecord"));
    info.set(PDFName.of("PDFDockFingerprint"), PDFString.of(await pageFingerprint(doc)));
  });
  const r = await check(bytes);
  assert.equal(r.status, "unchanged");
  assert.ok(r.status === "unchanged" && !r.timeCovered);
});

test("a file with no record says so", async () => {
  const doc = await PDFDocument.create();
  doc.addPage();
  assert.equal((await check(await doc.save())).status, "no-record");
});
