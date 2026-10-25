import {
  PDFDocument,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
  StandardFonts,
} from "pdf-lib";

export type FieldValue = string | boolean | string[];
export interface FormField {
  name: string;
  kind: "text" | "checkbox" | "radio" | "dropdown" | "list" | "unsupported";
  value: FieldValue;
  options: string[];
  readOnly: boolean;
  multiline?: boolean;
  maxLength?: number;
  multiSelect?: boolean;
}
export async function readForm(bytes: Uint8Array): Promise<FormField[]> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  if (doc.getForm().hasXFA())
    throw new Error(
      "This PDF uses an XFA form. Open it in a PDF reader that supports XFA instead.",
    );
  return doc
    .getForm()
    .getFields()
    .map((field) => {
      const common = {
        name: field.getName(),
        readOnly: field.isReadOnly(),
        options: [],
      };
      if (field instanceof PDFTextField)
        return {
          ...common,
          kind: "text",
          value: field.getText() ?? "",
          multiline: field.isMultiline(),
          maxLength: field.getMaxLength(),
        };
      if (field instanceof PDFCheckBox)
        return { ...common, kind: "checkbox", value: field.isChecked() };
      if (field instanceof PDFRadioGroup)
        return {
          ...common,
          kind: "radio",
          value: field.getSelected() ?? "",
          options: field.getOptions(),
        };
      if (field instanceof PDFDropdown || field instanceof PDFOptionList)
        return {
          ...common,
          kind: field instanceof PDFDropdown ? "dropdown" : "list",
          value: field.getSelected(),
          options: field.getOptions(),
          multiSelect: field.isMultiselect(),
        };
      return { ...common, kind: "unsupported", value: "", readOnly: true };
    });
}

/** Validate the entire edit set before writing; unsupported edits never silently succeed. */
export async function fillForm(
  bytes: Uint8Array,
  values: Record<string, FieldValue>,
) {
  const descriptions = await readForm(bytes);
  const known = new Map(descriptions.map((f) => [f.name, f]));
  for (const [name, value] of Object.entries(values)) {
    const f = known.get(name);
    if (!f || f.readOnly || f.kind === "unsupported")
      throw new Error(`Cannot edit form field “${name}”.`);
    if (
      f.kind === "text" &&
      (typeof value !== "string" ||
        (f.maxLength !== undefined && value.length > f.maxLength))
    )
      throw new Error(`Invalid text for “${name}”.`);
    if (f.kind === "checkbox" && typeof value !== "boolean")
      throw new Error(`Invalid checkbox value for “${name}”.`);
    if (
      f.kind === "radio" &&
      (typeof value !== "string" ||
        (value !== "" && !f.options.includes(value)))
    )
      throw new Error(`Choose a listed option for “${name}”.`);
    if (f.kind === "dropdown" || f.kind === "list") {
      if (
        !Array.isArray(value) ||
        (!f.multiSelect && value.length > 1) ||
        value.some((v) => !f.options.includes(v))
      )
        throw new Error(`Choose listed options for “${name}”.`);
    }
  }
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const form = doc.getForm();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  try {
    for (const [name, value] of Object.entries(values)) {
      const field = form.getField(name);
      if (field instanceof PDFTextField) {
        field.setText(value as string);
        field.updateAppearances(font);
      } else if (field instanceof PDFCheckBox) {
        value ? field.check() : field.uncheck();
        field.updateAppearances();
      } else if (field instanceof PDFRadioGroup) {
        value ? field.select(value as string) : field.clear();
        field.updateAppearances();
      } else if (
        field instanceof PDFDropdown ||
        field instanceof PDFOptionList
      ) {
        (value as string[]).length
          ? field.select(value as string[])
          : field.clear();
        field.updateAppearances(font);
      }
    }
    return await doc.save({
      useObjectStreams: true,
      updateFieldAppearances: false,
    });
  } catch (err) {
    if (err instanceof Error && /WinAnsi|encode/i.test(err.message))
      throw new Error(
        "This form needs a font for those characters. Use a PDF reader with the document's original fonts.",
      );
    throw err;
  }
}

export function exportFormValues(
  fields: FormField[],
  edits: Record<string, FieldValue>,
) {
  return fields
    .filter((f) => f.kind !== "unsupported")
    .map((f) => ({
      name: f.name,
      type: f.kind,
      value: Object.hasOwn(edits, f.name) ? edits[f.name] : f.value,
    }));
}
