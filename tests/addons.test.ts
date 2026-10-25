import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFName, PDFHexString, StandardFonts } from "pdf-lib";
import {
  readProperties,
  editProperties,
} from "../client/src/lib/addons/metadata.ts";
import {
  readForm,
  fillForm,
  exportFormValues,
} from "../client/src/lib/addons/forms.ts";
import { qrPixels, readQr } from "../client/src/lib/addons/qr.ts";
import {
  checkDimensions,
  decodeImagePages,
} from "../client/src/lib/addons/images.ts";

async function fixture() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 500]);
  page.drawText("FC fixture", {
    font: await doc.embedFont(StandardFonts.Helvetica),
  });
  doc.setTitle("Original title");
  doc.setAuthor("Original author");
  doc.setKeywords(["forest, annual report"]);
  const form = doc.getForm();
  const text = form.createTextField("employee");
  text.setText("Alice");
  text.addToPage(page, { x: 20, y: 400, width: 150, height: 25 });
  const check = form.createCheckBox("approved");
  check.addToPage(page, { x: 20, y: 350, width: 20, height: 20 });
  const radio = form.createRadioGroup("division");
  radio.addOptionToPage("FSD", page, { x: 20, y: 300, width: 20, height: 20 });
  radio.addOptionToPage("WD", page, { x: 60, y: 300, width: 20, height: 20 });
  radio.select("FSD");
  const drop = form.createDropdown("office");
  drop.addOptions(["Accra", "Kumasi"]);
  drop.select("Accra");
  drop.addToPage(page, { x: 20, y: 250, width: 150, height: 25 });
  const list = form.createOptionList("tags");
  list.addOptions(["Forest", "Wildlife", "Timber"]);
  list.enableMultiselect();
  list.select(["Forest"]);
  list.addToPage(page, { x: 20, y: 140, width: 150, height: 80 });
  const ro = form.createTextField("reference");
  ro.setText("FC-001");
  ro.enableReadOnly();
  ro.addToPage(page, { x: 20, y: 100, width: 150, height: 25 });
  return doc;
}

test("metadata edit preserves page and form content, including Unicode properties", async () => {
  const doc = await fixture();
  const original = await doc.save();
  const read = await readProperties(original);
  const bytes = await editProperties(original, {
    ...read.properties,
    title: "Forestry — 年報",
    keywords: "forest, annual report",
  });
  const result = await readProperties(bytes);
  assert.equal(result.properties.title, "Forestry — 年報");
  assert.equal(result.properties.keywords, "forest, annual report");
  assert.equal(result.pages, 1);
  assert.equal(
    (await PDFDocument.load(bytes))
      .getForm()
      .getTextField("employee")
      .getText(),
    "Alice",
  );
});
test("clear properties removes dates, custom info and extended metadata while retaining the page", async () => {
  const doc = await fixture();
  const info = doc.context.lookup(doc.context.trailerInfo.Info) as any;
  info.set(
    PDFName.of("InternalReference"),
    doc.context.register(PDFHexString.fromText("PRIVATE_CUSTOM")),
  );
  doc.catalog.set(
    PDFName.of("Metadata"),
    doc.context.register(doc.context.stream("<metadata>PRIVATE</metadata>")),
  );
  const original = await doc.save();
  const { properties } = await readProperties(original);
  const result = await editProperties(original, properties, { clearAll: true });
  const loaded = await PDFDocument.load(result, { updateMetadata: false });
  assert.equal(loaded.getTitle(), undefined);
  assert.equal(loaded.getCreationDate(), undefined);
  assert.equal(loaded.getModificationDate(), undefined);
  assert.equal(loaded.catalog.has(PDFName.of("Metadata")), false);
  assert.equal(
    Buffer.from(result).includes(Buffer.from("<metadata>PRIVATE</metadata>")),
    false,
  );
  assert.equal(
    loaded.context
      .enumerateIndirectObjects()
      .some(
        ([, obj]) =>
          obj instanceof PDFHexString && obj.decodeText() === "PRIVATE_CUSTOM",
      ),
    false,
  );
  assert.equal(
    (loaded.context.lookup(loaded.context.trailerInfo.Info) as any).keys()
      .length,
    0,
  );
  assert.equal(loaded.getPageCount(), 1);
});
test("form extraction returns actual values and field choices", async () => {
  const fields = await readForm(await (await fixture()).save());
  assert.equal(fields.find((f) => f.name === "employee")?.value, "Alice");
  assert.equal(fields.find((f) => f.name === "approved")?.value, false);
  assert.deepEqual(fields.find((f) => f.name === "office")?.value, ["Accra"]);
  assert.equal(fields.find((f) => f.name === "reference")?.readOnly, true);
});
test("text, checkbox, radio, dropdown and multi-select values round-trip in an interactive PDF", async () => {
  const values = {
    employee: "Bob",
    approved: true,
    division: "WD",
    office: ["Kumasi"],
    tags: ["Wildlife", "Timber"],
  };
  const result = await fillForm(await (await fixture()).save(), values);
  const fields = await readForm(result);
  for (const [name, value] of Object.entries(values))
    assert.deepEqual(fields.find((f) => f.name === name)?.value, value);
  assert.equal(fields.find((f) => f.name === "reference")?.value, "FC-001");
  assert.equal(fields.length, 6);
});
test("choices can be cleared and a checkbox unchecked", async () => {
  const src = await (await fixture()).save();
  const changed = await fillForm(src, { approved: true });
  const fields = await readForm(
    await fillForm(changed, {
      approved: false,
      division: "",
      office: [],
      tags: [],
    }),
  );
  assert.equal(fields.find((f) => f.name === "approved")?.value, false);
  assert.equal(fields.find((f) => f.name === "division")?.value, "");
  assert.deepEqual(fields.find((f) => f.name === "office")?.value, []);
});
test("unknown, read-only and invalid form edits are rejected instead of silently saved", async () => {
  const src = await (await fixture()).save();
  await assert.rejects(fillForm(src, { missing: "x" }), /Cannot edit/);
  await assert.rejects(fillForm(src, { reference: "x" }), /Cannot edit/);
  await assert.rejects(
    fillForm(src, { office: ["Unknown"] }),
    /listed options/,
  );
  await assert.rejects(fillForm(src, { approved: "yes" }), /checkbox/);
  assert.equal(
    (await readForm(src)).find((f) => f.name === "employee")?.value,
    "Alice",
  );
});
test("JSON export includes current edits and preserves false checkbox values", async () => {
  const fields = await readForm(await (await fixture()).save());
  const values = exportFormValues(fields, { employee: "Bob", approved: false });
  assert.equal(values.find((f) => f.name === "employee")?.value, "Bob");
  assert.equal(values.find((f) => f.name === "approved")?.value, false);
});
test("QR pixels decode without altering Unicode text or links", () => {
  for (const text of [
    "FC-REG-2026-001",
    "https://fc.gov.gh/doc?id=123",
    "Forestry — 森林",
  ]) {
    const { pixels, size } = qrPixels(text);
    assert.equal(readQr(pixels, size, size), text);
  }
});
test("empty/oversized QR content and missing codes fail clearly", () => {
  assert.throws(() => qrPixels(" "), /Enter/);
  assert.throws(() => qrPixels("a".repeat(2001)), /2,000/);
  assert.throws(() => qrPixels("森".repeat(700)), /2,000/);
  assert.throws(
    () => readQr(new Uint8ClampedArray(40 * 40 * 4).fill(255), 40, 40),
    /No QR/,
  );
});
test("image limits reject oversized dimensions and empty selections before decoding", async () => {
  assert.throws(() => checkDimensions(100_000, 100_000), /25 megapixels/);
  assert.throws(() => checkDimensions(0, 10), /25 megapixels/);
  await assert.rejects(decodeImagePages([]), /between 1 and 100/);
});
