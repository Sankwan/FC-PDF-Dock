import { useState } from "react";
import ToolHeader from "@/components/ToolHeader";
import FileUpload from "@/components/FileUpload";
import SaveShareButtons from "@/components/SaveShareButtons";
import { Input } from "@/components/ui/input";
import {
  readForm,
  fillForm,
  exportFormValues,
  type FormField,
  type FieldValue,
} from "@/lib/addons/forms";

export default function PdfForms() {
  const [file, setFile] = useState<File | null>(null);
  const [fields, setFields] = useState<FormField[]>([]);
  const [edits, setEdits] = useState<Record<string, FieldValue>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<File | null>(null);
  const open = async ([source]: File[]) => {
    if (!source) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setFields(await readForm(new Uint8Array(await source.arrayBuffer())));
      setFile(source);
      setEdits({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read this form.");
    } finally {
      setBusy(false);
    }
  };
  const update = (name: string, value: FieldValue) => {
    setEdits({ ...edits, [name]: value });
    setResult(null);
  };
  const save = async () => {
    if (!file) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const bytes = await fillForm(
        new Uint8Array(await file.arrayBuffer()),
        edits,
      );
      setResult(
        new File(
          [new Uint8Array(bytes).buffer],
          file.name.replace(/\.pdf$/i, "") + "_filled.pdf",
          { type: "application/pdf" },
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not fill this PDF.");
    } finally {
      setBusy(false);
    }
  };
  const json =
    file &&
    new File(
      [JSON.stringify(exportFormValues(fields, edits), null, 2)],
      file.name.replace(/\.pdf$/i, "") + "_fields.json",
      { type: "application/json" },
    );
  return (
    <section className="min-h-[70vh] bg-background py-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <ToolHeader
          category="Official documents"
          title="PDF forms"
          description="Fill existing form fields and export their values. Everything stays on this device."
        />
        <div className="max-w-2xl space-y-5 rounded-xl border border-border bg-card p-5 sm:p-6">
          {!file ? (
            busy ? (
              <p role="status" className="text-sm">
                Reading PDF…
              </p>
            ) : (
              <FileUpload
                title="Choose a PDF form"
                accept=".pdf,application/pdf"
                multiple={false}
                maxSizeInMB={50}
                onFilesSelected={open}
              />
            )
          ) : (
            <>
              <div className="flex flex-wrap justify-between gap-3">
                <p className="break-all font-semibold">{file.name}</p>
                <button
                  disabled={busy}
                  className="text-sm font-semibold text-brand underline"
                  onClick={() => {
                    setFile(null);
                    setError("");
                    setResult(null);
                  }}
                >
                  Choose another PDF
                </button>
              </div>
              {!fields.length && (
                <p role="status" className="text-sm text-muted-foreground">
                  No interactive form fields found. A scanned or printed form
                  must be converted to a fillable form in a PDF editor first.
                </p>
              )}
              {fields.map((field, index) => {
                const value = Object.hasOwn(edits, field.name)
                  ? edits[field.name]
                  : field.value;
                const id = `field-${index}`;
                const disabled = busy || field.readOnly;
                return (
                  <div key={field.name} className="space-y-1">
                    <label
                      htmlFor={id}
                      className="block break-all text-sm font-semibold"
                    >
                      {field.name}
                      {field.readOnly ? " (read-only)" : ""}
                    </label>
                    {field.kind === "text" ? (
                      field.multiline ? (
                        <textarea
                          id={id}
                          disabled={disabled}
                          maxLength={field.maxLength}
                          rows={3}
                          className="w-full rounded-md border border-border bg-background p-3 text-sm"
                          value={String(value)}
                          onChange={(e) => update(field.name, e.target.value)}
                        />
                      ) : (
                        <Input
                          id={id}
                          disabled={disabled}
                          maxLength={field.maxLength}
                          value={String(value)}
                          onChange={(e) => update(field.name, e.target.value)}
                        />
                      )
                    ) : field.kind === "checkbox" ? (
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          id={id}
                          type="checkbox"
                          disabled={disabled}
                          checked={value === true}
                          onChange={(e) => update(field.name, e.target.checked)}
                          className="accent-brand"
                        />
                        Checked
                      </label>
                    ) : field.kind === "unsupported" ? (
                      <p id={id} className="text-sm text-muted-foreground">
                        This field type cannot be edited here. Signatures and
                        buttons are preserved.
                      </p>
                    ) : (
                      <select
                        id={id}
                        disabled={disabled}
                        multiple={Boolean(field.multiSelect)}
                        className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                        value={
                          field.multiSelect
                            ? (value as string[])
                            : Array.isArray(value)
                              ? (value[0] ?? "")
                              : String(value)
                        }
                        onChange={(e) =>
                          update(
                            field.name,
                            field.kind === "radio"
                              ? e.target.value
                              : field.multiSelect
                                ? Array.from(
                                    e.target.selectedOptions,
                                    (o) => o.value,
                                  )
                                : e.target.value
                                  ? [e.target.value]
                                  : [],
                          )
                        }
                      >
                        {!field.multiSelect && (
                          <option value="">No selection</option>
                        )}
                        {field.options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    )}
                    {field.multiSelect && (
                      <p className="text-xs text-muted-foreground">
                        Hold Ctrl (Windows) or Command (Mac) to select more than
                        one option.
                      </p>
                    )}
                  </div>
                );
              })}
              {fields.length > 0 && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Changes preserve the interactive fields. Saving can
                    invalidate digital signatures. Some characters need fonts
                    available only in your original PDF reader.
                  </p>
                  <button
                    disabled={busy || !Object.keys(edits).length}
                    className="h-11 rounded-md bg-brand px-5 text-sm font-semibold text-white disabled:opacity-50"
                    onClick={save}
                  >
                    {busy ? "Saving…" : "Create filled PDF"}
                  </button>
                  {json && (
                    <SaveShareButtons
                      file={json}
                      saveLabel="Export field values (JSON)"
                    />
                  )}
                </>
              )}
              {result && (
                <div className="space-y-3 border-t border-border pt-4">
                  <p role="status" className="text-sm">
                    Filled PDF ready.
                  </p>
                  <SaveShareButtons file={result} />
                </div>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
