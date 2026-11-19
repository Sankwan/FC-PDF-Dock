/**
 * Fill in a PDF's own form fields (text boxes, tick boxes, choices), the way
 * Adobe Reader does, instead of placing text on top of the page.
 *
 * Fields and their positions are read with pdf.js (it gives each box's page
 * and rectangle); answers are written back with pdf-lib.
 */
import { PDFCheckBox, PDFDocument, PDFDropdown, PDFName, PDFOptionList, PDFRadioGroup, PDFTextField, StandardFonts, type PDFField } from "pdf-lib";
import { fitFontCharset } from "./pdfText";

export type FieldKind = "text" | "checkbox" | "radio" | "dropdown" | "list" | "signature";

export interface FormWidget {
  /** unique per box on the page */
  id: string;
  /** the field's full name; several boxes can share one (radio buttons, repeated fields) */
  name: string;
  kind: FieldKind;
  page: number;
  /** [x1, y1, x2, y2] in PDF points */
  rect: [number, number, number, number];
  /** where it sits on the page as shown (top-left origin, points), so rotated pages work */
  box: { x: number; y: number; w: number; h: number };
  /** the value this tick box or radio button stands for */
  onValue?: string;
  options?: { value: string; label: string }[];
  multiline?: boolean;
  maxLen?: number;
  readOnly?: boolean;
  /** 0 left, 1 centre, 2 right */
  align?: number;
  label: string;
}

/** text: string · tick box / radio: its on value or "Off" · dropdown: value · list: values */
export type FormValues = Record<string, string | string[]>;

const GENERIC = /^(c|f|fld|field|text|txt|check ?box|cb|chk|radio|button|untitled|t)\s*[\d\s]*$/i;

/** A readable label from the form's tooltip or field name ("Page1[0].FirstName[0]" → "First name"). */
export function fieldLabel(name: string, tooltip?: string): string {
  const tip = tooltip?.replace(/\s+/g, " ").trim();
  if (tip) return tip.length > 140 ? tip.slice(0, 137) + "…" : tip;
  let s = (name.split(".").pop() ?? name).replace(/\[\d+\]/g, "");
  s = s.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Za-z])(\d)/g, "$1 $2").replace(/\s+/g, " ").trim();
  if (!s || GENERIC.test(s)) return "";
  const lower = s === s.toUpperCase() ? s.toLowerCase() : s.replace(/\b([A-Z])([a-z]+)/g, (_, a, b) => a.toLowerCase() + b);
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Reads every visible form box from a pdf.js document. */
export interface FormPage { page: number; width: number; height: number }

export async function readForm(pdf: any, tooltips: Map<string, string> = new Map()): Promise<{ widgets: FormWidget[]; values: FormValues; pages: FormPage[] }> {
  const widgets: FormWidget[] = [];
  const values: FormValues = {};
  const pages: FormPage[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    pages.push({ page: n, width: vp.width, height: vp.height });
    const annots: any[] = await page.getAnnotations({ intent: "display" });
    for (const a of annots) {
      if (a.subtype !== "Widget" || !a.fieldName || a.hidden || a.pushButton) continue;
      let kind: FieldKind | null = null;
      if (a.fieldType === "Tx") kind = "text";
      else if (a.fieldType === "Btn") kind = a.radioButton ? "radio" : a.checkBox ? "checkbox" : null;
      else if (a.fieldType === "Ch") kind = a.combo ? "dropdown" : "list";
      else if (a.fieldType === "Sig") kind = "signature";
      if (!kind) continue;
      const w: FormWidget = {
        id: `${n}:${a.id}`,
        name: a.fieldName,
        kind,
        page: n,
        rect: a.rect,
        box: (() => {
          // Apply the page's transform to two corners (handles rotation and offset crop boxes).
          const [ta, tb, tc, td, te, tf] = vp.transform as number[];
          const pt = (x: number, y: number) => [ta * x + tc * y + te, tb * x + td * y + tf];
          const [x1, y1] = pt(a.rect[0], a.rect[1]);
          const [x2, y2] = pt(a.rect[2], a.rect[3]);
          return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
        })(),
        readOnly: !!a.readOnly,
        label: fieldLabel(a.fieldName, a.alternativeText || tooltips.get(a.fieldName)),
      };
      if (kind === "text") {
        w.multiline = !!a.multiLine;
        if (a.maxLen) w.maxLen = a.maxLen;
        w.align = a.textAlignment ?? 0;
        if (!(a.fieldName in values)) values[a.fieldName] = typeof a.fieldValue === "string" ? a.fieldValue : "";
      } else if (kind === "checkbox" || kind === "radio") {
        w.onValue = String(kind === "radio" ? a.buttonValue : a.exportValue ?? "Yes");
        const v = a.fieldValue;
        if (v && v !== "Off" && String(v) === w.onValue) values[a.fieldName] = w.onValue;
        else if (!(a.fieldName in values)) values[a.fieldName] = "Off";
      } else if (kind === "dropdown" || kind === "list") {
        // Answers are kept as the text shown, which is what pdf-lib selects by.
        const raw: { e: string; d: string }[] = (a.options ?? []).map((o: any) => ({ e: String(o.exportValue ?? o.displayValue), d: String(o.displayValue ?? o.exportValue) }));
        w.options = raw.map((o) => ({ value: o.d, label: o.d }));
        const v = a.fieldValue;
        const shown = (x: unknown) => raw.find((o) => o.e === String(x))?.d ?? String(x);
        const arr = Array.isArray(v) ? v.map(shown) : v ? [shown(v)] : [];
        values[a.fieldName] = kind === "list" ? arr : arr[0] ?? "";
      }
      widgets.push(w);
    }
    page.cleanup();
  }
  // Boxes with no usable name get "Box 3" style labels, numbered in page order.
  let k = 0;
  for (const w of widgets) if (!w.label) w.label = `Box ${++k}`;
  return { widgets, values, pages };
}

/**
 * Tooltips by field name. pdf.js only sees a tooltip stored on the box itself;
 * many forms keep it on the parent field, so read those with pdf-lib.
 */
export async function readTooltips(bytes: ArrayBuffer | Uint8Array): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    for (const f of doc.getForm().getFields()) {
      const tu = f.acroField.dict.lookup(PDFName.of("TU"));
      const text = tu && "decodeText" in tu ? (tu as any).decodeText() : "";
      if (text.trim()) map.set(f.getName(), text);
    }
  } catch { /* labels fall back to field names */ }
  return map;
}

/** Whether a field has an answer (for the "8 of 12 filled" count). */
export const isAnswered = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v.length > 0 : !!v && v !== "Off";

const OFF = PDFName.of("Off");

/** Turns a tick box or radio group on at `value` (its on value) or off, on every box it has. */
function setButton(field: PDFCheckBox | PDFRadioGroup, value: string, markDirty: () => void) {
  const acro = field.acroField;
  const widgets = acro.getWidgets();
  const ons = widgets.map((w) => w.getOnValue());
  // Usually the on value is the answer itself; some forms list answers in /Opt and number the boxes instead.
  const optIndex = (acro.getExportValues() ?? []).findIndex((o) => o.decodeText() === value);
  const match = ons.find((on) => on && on.decodeText() === value) ?? (optIndex >= 0 ? ons[optIndex] : undefined);
  const on = value !== "Off" && match ? match : OFF;
  acro.dict.set(PDFName.of("V"), on);
  for (const w of widgets) {
    w.setAppearanceState(on !== OFF && w.getOnValue() === on ? on : OFF);
  }
  // Only draw new tick boxes if the form didn't come with its own.
  if (widgets.some((w) => !w.getAppearances()?.normal)) markDirty();
}

/**
 * Writes the answers into the form and returns the new PDF.
 * `lock` flattens the form so answers become part of the page.
 */
export async function fillForm(bytes: ArrayBuffer | Uint8Array, values: FormValues, { lock = false } = {}): Promise<{ bytes: Uint8Array; substituted: boolean }> {
  const doc = await PDFDocument.load(bytes);
  const form = doc.getForm();
  // Some forms also carry an XFA copy that Adobe prefers; remove it so it shows these answers.
  if (form.hasXFA()) form.deleteXFA();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let substituted = false;

  for (const field of form.getFields() as PDFField[]) {
    const name = field.getName();
    if (!(name in values) || field.isReadOnly()) continue;
    const v = values[name];
    try {
      if (field instanceof PDFTextField) {
        let text = String(v ?? "");
        if (!field.isMultiline()) text = text.replace(/\s*\n\s*/g, " ");
        text = text.split("\n").map((line) => {
          const r = fitFontCharset(font, line);
          substituted ||= r.changed;
          return r.text;
        }).join("\n");
        const max = field.getMaxLength();
        if (max !== undefined) text = text.slice(0, max);
        field.setText(text || undefined);
      } else if (field instanceof PDFCheckBox || field instanceof PDFRadioGroup) {
        setButton(field, typeof v === "string" ? v : "Off", () => form.markFieldAsDirty(field.ref));
      } else if (field instanceof PDFDropdown) {
        const choice = typeof v === "string" ? v : v[0];
        const opts = field.getOptions();
        if (!choice) field.clear();
        else if (opts.includes(choice)) field.select(choice);
        else if (field.isEditable()) field.select(fitFontCharset(font, choice).text);
      } else if (field instanceof PDFOptionList) {
        const list = (Array.isArray(v) ? v : [v]).filter((x) => x && field.getOptions().includes(x));
        if (list.length) field.select(list); else field.clear();
      }
    } catch (err) {
      // One odd field shouldn't stop the rest being saved.
      console.warn(`Couldn't fill "${name}"`, err);
    }
  }

  form.updateFieldAppearances(font);
  if (lock) form.flatten();
  return { bytes: await doc.save(), substituted };
}
