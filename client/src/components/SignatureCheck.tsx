import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSearch, HelpCircle, Loader2 } from "lucide-react";
import { checkSignRecord, formatDateTime, type SignCheck } from "@/lib/signRecord";

/**
 * "Was this changed after it was signed?" Reads the signing record written
 * by Sign PDF and reports the signing time, and the modified time when the
 * pages no longer match.
 */
const SignatureCheck = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SignCheck | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = async (file: File | undefined) => {
    if (!file) return;
    setName(file.name);
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      setResult(await checkSignRecord(file));
    } catch {
      setError("This file couldn't be read as a PDF.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-brand-tint text-brand">
          <FileSearch size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">Check a signed PDF</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">See whether a PDF signed here was changed afterwards.</p>
          <input ref={inputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={(e) => check(e.target.files?.[0])} />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="mt-3 inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold text-foreground hover:border-brand hover:text-brand disabled:opacity-60"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <FileSearch size={15} />}
            Choose a signed PDF
          </button>

          {error && <p className="mt-3 text-sm font-medium text-destructive">{error}</p>}

          {result && (
            <div
              role="status"
              className={`mt-4 flex gap-3 rounded-md border p-3 text-sm ${
                result.status === "unchanged"
                  ? "border-brand/40 bg-brand-tint"
                  : result.status === "changed"
                    ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50"
                    : "border-border bg-muted"
              }`}
            >
              {result.status === "unchanged" && <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-brand" />}
              {result.status === "changed" && <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-300" />}
              {result.status === "no-record" && <HelpCircle size={18} className="mt-0.5 shrink-0 text-muted-foreground" />}
              <div className="min-w-0">
                <p className="truncate font-semibold">{name}</p>
                {result.status === "unchanged" && (
                  <>
                    <p className="mt-0.5">The pages match the record made when this was signed in PDFDock.</p>
                    <p className="mt-0.5">
                      {result.timeCovered
                        ? `Signing time recorded in the file: ${formatDateTime(result.signedAt)}.`
                        : `Signing time written in the file: ${formatDateTime(result.signedAt)}. This file is from an older version of PDFDock, so that time can't be checked.`}
                    </p>
                  </>
                )}
                {result.status === "changed" && (
                  <>
                    <p className="mt-0.5">Signed {formatDateTime(result.signedAt)}.</p>
                    <p className="mt-0.5 font-semibold">
                      {result.modifiedAt ? `Changed after signing, on ${formatDateTime(result.modifiedAt)}.` : "Changed after signing. The program that changed it didn't record when."}
                    </p>
                  </>
                )}
                {result.status === "no-record" && (
                  <p className="mt-0.5">
                    This PDF wasn't signed with PDFDock, so there's no signing record to compare.
                    {result.modifiedAt ? ` The file says it was last modified ${formatDateTime(result.modifiedAt)}.` : ""}
                  </p>
                )}
              </div>
            </div>
          )}
          {result && result.status !== "no-record" && (
            <details className="mt-3 text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium">What this check can and can't tell you</summary>
              <p className="mt-1.5 leading-relaxed">It spots everyday changes made after signing, such as edited text, added or removed pages, or a changed signing time. It does not prove who signed, and someone determined to hide a change could rewrite the record. For legally binding signatures, use a certificate-based digital signature.</p>
            </details>
          )}
        </div>
      </div>
    </div>
  );
};

export default SignatureCheck;
