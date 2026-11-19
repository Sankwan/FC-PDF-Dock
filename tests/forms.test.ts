import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFName } from "pdf-lib";
import { inkShare, isBlank, textSignal, LIMITS, type PageCheck } from "../client/src/lib/blankPages.ts";
import { fieldLabel, fillForm } from "../client/src/lib/fillForm.ts";

// ---- blank pages ----
const W = 300, H = 420;
const paper = (v = 240) => new Uint8Array(W * H).fill(v);
const rect = (lum: Uint8Array, x: number, y: number, w: number, h: number, v: number) => {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) lum[j * W + i] = v;
};

test("blank: a clean or greyish scan has no ink", () => {
  assert.equal(inkShare(paper(), W, H), 0);
  assert.equal(inkShare(paper(205), W, H), 0); // dull grey scan paper
});

test("blank: show-through, dust and dark scanner edges don't count", () => {
  const lum = paper();
  for (let y = 60; y < 360; y += 14) rect(lum, 40, y, 220, 5, 205); // faint mirrored lines from the back
  for (let k = 0; k < 40; k++) lum[(50 + k * 8) * W + 30 + k * 6] = 20; // single-pixel specks
  rect(lum, 0, 0, 8, H, 10); // black edge where the scanner lid was open
  rect(lum, 0, H - 10, W, 10, 10);
  assert.ok(inkShare(lum, W, H) <= LIMITS.empty, `ink=${inkShare(lum, W, H)}`);
});

test("blank: a page of text is clearly not blank, a lone page number is only 'nearly'", () => {
  const text = paper();
  for (let y = 60; y < 360; y += 14) rect(text, 40, y, 220, 5, 30);
  assert.ok(inkShare(text, W, H) > LIMITS.nearly * 10);
  const num = paper();
  rect(num, 145, 380, 10, 7, 30);
  const ink = inkShare(num, W, H);
  assert.ok(ink > LIMITS.empty && ink <= LIMITS.nearly, `ink=${ink}`);
});

test("blank: text signal ignores page numbers and spots 'intentionally left blank'", () => {
  assert.deepEqual(textSignal("  12 "), { hasText: false, saysBlank: false, anyText: true });
  assert.deepEqual(textSignal("Page 4 of 20"), { hasText: false, saysBlank: false, anyText: true });
  assert.deepEqual(textSignal(""), { hasText: false, saysBlank: false, anyText: false });
  assert.equal(textSignal("This page is intentionally left blank. 14").saysBlank, true);
  assert.equal(textSignal("This page has been intentionally left blank").saysBlank, true);
  assert.equal(textSignal("Annex B: seedling allocation").hasText, true);
  const p = (o: Partial<PageCheck>): PageCheck => ({ page: 1, ink: 0, hasText: false, anyText: false, saysBlank: false, thumb: "", ...o });
  const numberOnly = p({ anyText: true, ink: 0.0005 });
  assert.equal(isBlank(numberOnly, "normal", true), false);
  assert.equal(isBlank(numberOnly, "nearly", true), true);
  assert.equal(isBlank(p({ saysBlank: true, ink: 0.02 }), "normal", true), true);
  assert.equal(isBlank(p({ saysBlank: true, ink: 0.02 }), "normal", false), false);
  assert.equal(isBlank(p({ hasText: true }), "nearly", true), false);
});

// ---- forms ----
test("forms: labels come from the tooltip or a tidied field name", () => {
  assert.equal(fieldLabel("topmostSubform[0].Page1[0].FirstName[0]"), "First name");
  assert.equal(fieldLabel("date_of_birth"), "Date of birth");
  assert.equal(fieldLabel("STAFF ID"), "Staff id");
  assert.equal(fieldLabel("f1_01[0]"), "");
  assert.equal(fieldLabel("Text3", "Ghana Card number"), "Ghana Card number");
});

async function sampleForm() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const form = doc.getForm();
  form.createTextField("name").addToPage(page, { x: 50, y: 700, width: 200, height: 20 });
  const notes = form.createTextField("notes"); notes.enableMultiline(); notes.addToPage(page, { x: 50, y: 600, width: 300, height: 60 });
  const id = form.createTextField("id"); id.setMaxLength(6); id.addToPage(page, { x: 50, y: 560, width: 100, height: 20 });
  form.createCheckBox("agree").addToPage(page, { x: 50, y: 520, width: 14, height: 14 });
  const grade = form.createRadioGroup("grade");
  grade.addOptionToPage("A", page, { x: 50, y: 480, width: 14, height: 14 });
  grade.addOptionToPage("B", page, { x: 80, y: 480, width: 14, height: 14 });
  const dept = form.createDropdown("dept"); dept.addOptions(["Forest Services", "Wildlife"]); dept.addToPage(page, { x: 50, y: 440, width: 150, height: 20 });
  return doc.save();
}

test("forms: answers are written into the form's own fields", async () => {
  const filled = await fillForm(await sampleForm(), {
    name: "Ama Mensah", notes: "Line one\nLine two", id: "ABC1234567", agree: "Yes", grade: "B", dept: "Wildlife",
  });
  const form = (await PDFDocument.load(filled.bytes)).getForm();
  assert.equal(form.getTextField("name").getText(), "Ama Mensah");
  assert.equal(form.getTextField("notes").getText(), "Line one\nLine two");
  assert.equal(form.getTextField("id").getText(), "ABC123"); // cut to the box's limit
  assert.equal(form.getCheckBox("agree").isChecked(), true);
  assert.equal(form.getRadioGroup("grade").getSelected(), "B");
  assert.deepEqual(form.getDropdown("dept").getSelected(), ["Wildlife"]);
  assert.equal(filled.substituted, false);
});

test("forms: unticking and clearing work, and ₵ is written as GH¢", async () => {
  const once = await fillForm(await sampleForm(), { agree: "Yes", grade: "A", name: "x" });
  const twice = await fillForm(once.bytes, { agree: "Off", grade: "Off", name: "GH₵ 50, Kɔfi" });
  const form = (await PDFDocument.load(twice.bytes)).getForm();
  assert.equal(form.getCheckBox("agree").isChecked(), false);
  assert.equal(form.getRadioGroup("grade").getSelected(), undefined);
  assert.equal(form.getTextField("name").getText(), "GHGH¢ 50, Kofi");
  assert.equal(twice.substituted, true);
  // every radio button shows off
  for (const w of form.getRadioGroup("grade").acroField.getWidgets()) assert.equal(w.getAppearanceState(), PDFName.of("Off"));
});

test("forms: locking flattens the answers into the page", async () => {
  const filled = await fillForm(await sampleForm(), { name: "Kwame" }, { lock: true });
  const doc = await PDFDocument.load(filled.bytes);
  assert.equal(doc.getForm().getFields().length, 0);
});
