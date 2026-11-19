import { useState } from "react";
import { CheckCircle2, Download, FileArchive, FileText, Loader2 } from "lucide-react";
import SaveShareButtons, { SAVE_HINT } from "@/components/SaveShareButtons";
import { downloadFile, formatFileSize } from "@/lib/fileUtils";

/** Puts several files into one ZIP so phones get a single download. */
export async function zipFiles(files: File[], name: string): Promise<File> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const used = new Set<string>();
  for (const f of files) {
    let n = f.name, i = 2;
    while (used.has(n)) n = f.name.replace(/(\.[^.]+)?$/, ` (${i++})$1`);
    used.add(n);
    zip.file(n, f);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  return new File([blob], name, { type: "application/zip" });
}

interface Props {
  files: File[];
  /** e.g. "3 files ready" — defaults to a sensible line */
  title?: string;
  detail?: React.ReactNode;
  /** extra notes (warnings, what changed) */
  children?: React.ReactNode;
  zipName?: string;
  /** Secondary actions such as "Try other settings" */
  actions?: React.ReactNode;
  pages?: (file: File) => number | undefined;
}

/** The finished state every tool ends with: what was made, and Save/Share. */
const ToolResult = ({ files, title, detail, children, zipName = "files.zip", actions, pages }: Props) => {
  const [zipping, setZipping] = useState(false);
  const single = files.length === 1;
  const saveAll = async () => {
    setZipping(true);
    try {
      const zip = await zipFiles(files, zipName);
      downloadFile(zip, zip.name, zip.type);
    } finally {
      setZipping(false);
    }
  };

  return (
    <div role="status" className="space-y-3 rounded-xl border border-brand/40 bg-brand-tint p-4">
      <div className="flex items-start gap-2.5">
        <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-brand" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title ?? (single ? `${files[0].name} is ready` : `${files.length} files ready`)}</p>
          {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
        </div>
      </div>
      {children}
      {single ? (
        <SaveShareButtons file={files[0]} saveLabel={files[0].type === "application/pdf" ? "Save PDF" : "Save file"} />
      ) : (
        <>
          <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-card">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-3 py-1.5 pl-3 pr-1">
                <FileText size={16} className="shrink-0 text-brand" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{f.name}</span>
                  <span className="text-xs text-muted-foreground">{pages?.(f) ? `${pages(f)} page${pages(f) === 1 ? "" : "s"} · ` : ""}{formatFileSize(f.size)}</span>
                </span>
                <button type="button" onClick={() => downloadFile(f, f.name, f.type)} aria-label={`Save ${f.name}`}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-brand hover:bg-brand-tint"><Download size={17} /></button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={saveAll} disabled={zipping}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60 sm:w-auto">
            {zipping ? <Loader2 size={16} className="animate-spin" /> : <FileArchive size={16} />} Save all as one ZIP
          </button>
        </>
      )}
      <p className="text-xs text-muted-foreground">{SAVE_HINT}</p>
      {actions && <div className="flex flex-wrap gap-2 border-t border-brand/20 pt-3">{actions}</div>}
    </div>
  );
};

/** On phones the main button stays at the bottom of the screen; on larger screens it sits in place. */
export const StickyAction = ({ children }: { children: React.ReactNode }) => (
  <div className="sticky bottom-0 z-20 -mx-4 border-t border-border bg-card/95 px-4 pt-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-0"
    style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
    {children}
  </div>
);

export const secondaryBtn = "inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-semibold text-foreground hover:border-brand hover:text-brand";
export const primaryBtn = "inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50 sm:h-11 sm:w-auto";
export const chipBtn = (active: boolean) =>
  `min-h-11 rounded-md border px-3 text-sm font-medium transition-colors ${active ? "border-brand bg-brand text-white" : "border-border bg-card text-foreground hover:border-brand"}`;

export default ToolResult;
