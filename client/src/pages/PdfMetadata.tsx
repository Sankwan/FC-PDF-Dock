import { useState } from "react";
import ToolHeader from "@/components/ToolHeader";
import FileUpload from "@/components/FileUpload";
import SaveShareButtons from "@/components/SaveShareButtons";
import { Input } from "@/components/ui/input";
import {
  PROPERTY_LABELS,
  readProperties,
  editProperties,
  type Properties,
} from "@/lib/addons/metadata";

export default function PdfMetadata() {
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<Awaited<
    ReturnType<typeof readProperties>
  > | null>(null);
  const [values, setValues] = useState<Properties | null>(null);
  const [clearAll, setClearAll] = useState(false);
  const [removeExtended, setRemoveExtended] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<File | null>(null);
  const open = async ([source]: File[]) => {
    if (!source) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const data = await readProperties(
        new Uint8Array(await source.arrayBuffer()),
      );
      setFile(source);
      setInfo(data);
      setValues(data.properties);
      setClearAll(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read this PDF.");
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!file || !values) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const bytes = await editProperties(
        new Uint8Array(await file.arrayBuffer()),
        values,
        { clearAll, removeExtended },
      );
      setResult(
        new File(
          [new Uint8Array(bytes).buffer],
          file.name.replace(/\.pdf$/i, "") + "_properties.pdf",
          { type: "application/pdf" },
        ),
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save these properties.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="min-h-[70vh] bg-background py-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <ToolHeader
          category="Official documents"
          title="PDF properties"
          description="View, edit or clear document properties on this device."
        />
        <div className="max-w-2xl space-y-4 rounded-xl border border-border bg-card p-5 sm:p-6">
          {!file ? (
            busy ? (
              <p role="status" className="text-sm">
                Reading PDF…
              </p>
            ) : (
              <FileUpload
                title="Choose a PDF"
                accept=".pdf,application/pdf"
                multiple={false}
                maxSizeInMB={50}
                onFilesSelected={open}
              />
            )
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="break-all font-semibold">{file.name}</p>
                <button
                  className="text-sm font-semibold text-brand underline"
                  disabled={busy}
                  onClick={() => {
                    setFile(null);
                    setResult(null);
                    setError("");
                  }}
                >
                  Choose another PDF
                </button>
              </div>
              <p className="text-sm text-muted-foreground">
                {info?.pages} pages · Created:{" "}
                {info?.created?.toLocaleDateString() ?? "Not recorded"} ·
                Modified:{" "}
                {info?.modified?.toLocaleDateString() ?? "Not recorded"}
              </p>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={clearAll}
                  disabled={busy}
                  onChange={(e) => {
                    setClearAll(e.target.checked);
                    setResult(null);
                  }}
                  className="mt-1 accent-brand"
                />
                Clear all document properties, including dates and custom
                properties
              </label>
              {values && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {(Object.keys(PROPERTY_LABELS) as (keyof Properties)[]).map(
                    (key) => (
                      <label
                        key={key}
                        className="text-sm font-medium"
                        htmlFor={`property-${key}`}
                      >
                        {PROPERTY_LABELS[key]}
                        <Input
                          id={`property-${key}`}
                          className="mt-1"
                          maxLength={4000}
                          disabled={busy || clearAll}
                          value={clearAll ? "" : values[key]}
                          onChange={(e) => {
                            setValues({ ...values, [key]: e.target.value });
                            setResult(null);
                          }}
                        />
                      </label>
                    ),
                  )}
                </div>
              )}
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={removeExtended || clearAll}
                  disabled={busy || clearAll}
                  onChange={(e) => {
                    setRemoveExtended(e.target.checked);
                    setResult(null);
                  }}
                  className="mt-1 accent-brand"
                />
                Remove extended metadata to avoid keeping a second, outdated set
                of properties
              </label>
              <p className="text-xs text-muted-foreground">
                This changes document properties only. Text, comments,
                attachments and form values remain. Saving can invalidate
                digital signatures.
              </p>
              <button
                disabled={busy}
                className="h-11 rounded-md bg-brand px-5 text-sm font-semibold text-white disabled:opacity-50"
                onClick={save}
              >
                {busy ? "Saving…" : "Create updated PDF"}
              </button>
              {result && (
                <div className="space-y-3 border-t border-border pt-4">
                  <p role="status" className="text-sm">
                    Updated PDF ready. Your original file is unchanged.
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
