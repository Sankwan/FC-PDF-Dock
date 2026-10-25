import test from "node:test";
import assert from "node:assert/strict";
import { reconstructPage, spanText, type WordSpan } from "../client/src/lib/pdfToWord/layout.ts";
import { parseToolPreferences, recordToolVisit, matchesTool } from "../client/src/lib/toolPreferences.ts";
const span = (text: string, x: number, y: number, width = 50, size = 11): WordSpan => ({ text, x, y, width, size });
test("reconstructs numeric tables without changing values", () => {
  const rows = [["Species", "Seedlings", "Status"], ["Teak", "1,200", "Ready"], ["Mahogany", "350", "Growing"]];
  const blocks = reconstructPage(rows.flatMap((row, i) => row.map((text, j) => span(text, 30 + j * 150, 80 + i * 24))));
  assert.equal(blocks.length, 1); assert.equal(blocks[0].type, "table");
  if (blocks[0].type === "table") assert.deepEqual(blocks[0].rows.map(row => row.map(spanText)), rows);
});
test("keeps two prose columns out of tables and reads left column first", () => {
  const blocks = reconstructPage([0, 1, 2].flatMap(i => [span(`Left ${i}`, 30, 80 + i * 45, 170), span(`Right ${i}`, 300, 80 + i * 45, 180)]));
  assert.ok(blocks.every(b => b.type === "paragraph"));
  assert.deepEqual(blocks.flatMap(b => b.type === "paragraph" ? b.lines.map(l => spanText(l.spans)) : []), ["Left 0", "Left 1", "Left 2", "Right 0", "Right 1", "Right 2"]);
});
test("joins wrapped lines but preserves list items", () => {
  const blocks = reconstructPage([span("The forest report continues", 30, 80, 190), span("on the next line.", 30, 94, 110), span("• Visit site", 30, 110), span("• Check count", 30, 124)]);
  assert.equal(blocks.length, 3); if (blocks[0].type === "paragraph") assert.equal(blocks[0].lines.length, 2);
});
test("damaged stored preferences recover safely and legacy favorites are ignored", () => {
  assert.deepEqual(parseToolPreferences("bad"), { visits: {} });
  const p = parseToolPreferences(JSON.stringify({ favorites: ["scan", "scan", 42], visits: { scan: 2, bad: -1, overflow: Infinity } }));
  assert.deepEqual(p, { visits: { scan: 2 } });
  const next = recordToolVisit(p, "pdf-to-word");
  assert.equal(next.visits["pdf-to-word"], 1); assert.equal(p.visits["pdf-to-word"], undefined);
});
test("tool search handles tasks, aliases and punctuation", () => {
  const tool = { id: "pdf-to-word", title: "PDF to Word", description: "Convert on this device" };
  assert.ok(matchesTool(tool, "PDF-to-word")); assert.ok(matchesTool(tool, "docx")); assert.ok(matchesTool(tool, "editable word")); assert.equal(matchesTool(tool, "camera"), false);
  assert.equal(matchesTool({ id: "protect-pdf", title: "Protect PDF", description: "Add a password or stop others editing" }, "word"), false);
});


test("cancellation rejects even when a terminated OCR job never settles", async () => {
  const { withAbort } = await import("../client/src/lib/pdfToWord/cancellation.ts");
  const controller = new AbortController();
  const result = withAbort(new Promise<never>(() => {}), controller.signal);
  controller.abort();
  await assert.rejects(result, { name: "AbortError" });
  assert.equal(await withAbort(Promise.resolve("restarted"), new AbortController().signal), "restarted");
});
