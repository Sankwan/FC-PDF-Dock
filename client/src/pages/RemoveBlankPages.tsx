import { useMemo, useState } from "react";
import { CheckCircle2, FileMinus2, Loader2, Trash2, Undo2 } from "lucide-react";
import ToolHeader from "@/components/ToolHeader";
import FileUpload from "@/components/FileUpload";
import SaveShareButtons, { SAVE_HINT } from "@/components/SaveShareButtons";
import { useToast } from "@/hooks/use-toast";
import { useFileVault } from "@/context/FileVault";
import { formatFileSize } from "@/lib/fileUtils";
import { checkPages, isBlank, removePages, type PageCheck, type Strictness } from "@/lib/blankPages";

const STRICTNESS: { id: Strictness; label: string; hint: string }[] = [
  { id: "empty", label: "Only empty pages", hint: "Completely clean pages" },
  { id: "normal", label: "Normal", hint: "Allows dust and faint show-through" },
  { id: "nearly", label: "Nearly empty too", hint: "Also pages with a stray mark or page number" },
];

const RemoveBlankPages = () => {
  const { toast } = useToast();
  const { files: vaultFiles, removeFile } = useFileVault();
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [pages, setPages] = useState<PageCheck[] | null>(null);
  const [strictness, setStrictness] = useState<Strictness>("normal");
  const [notes, setNotes] = useState(true);
  /** pages the user switched from what was detected */
  const [flipped, setFlipped] = useState<Set<number>>(new Set());
  const [onlyBlank, setOnlyBlank] = useState(false);
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<{ file: File; removed: number } | null>(null);

  const detected = useMemo(() => new Set((pages ?? []).filter((p) => isBlank(p, strictness, notes)).map((p) => p.page)), [pages, strictness, notes]);
  const selected = useMemo(() => {
    const s = new Set(detected);
    flipped.forEach((n) => (s.has(n) ? s.delete(n) : s.add(n)));
    return s;
  }, [detected, flipped]);
  const hasNotes = pages?.some((p) => p.saysBlank);

  const open = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f); setPages(null); setResult(null); setFlipped(new Set());
    setProgress({ done: 0, total: 0 });
    try {
      setPages(await checkPages(f, (done, total) => setProgress({ done, total })));
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Couldn't read this PDF", description: err instanceof Error ? err.message : undefined });
      setFile(null);
    } finally {
      setProgress(null);
    }
  };

  const reset = () => {
    vaultFiles.filter((vf) => vf.file === file).forEach((vf) => removeFile(vf.id));
    setFile(null); setPages(null); setResult(null); setFlipped(new Set());
  };

  const toggle = (n: number) => setFlipped((s) => { const x = new Set(s); x.has(n) ? x.delete(n) : x.add(n); return x; });
  const changeStrictness = (s: Strictness) => { setStrictness(s); setFlipped(new Set()); };

  const run = async () => {
    if (!file || !pages) return;
    if (selected.size >= pages.length) {
      toast({ variant: "destructive", title: "That's every page", description: "Keep at least one page." });
      return;
    }
    setWorking(true);
    try {
      setResult({ file: await removePages(file, [...selected]), removed: selected.size });
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Couldn't remove the pages", description: err instanceof Error ? err.message : undefined });
    } finally {
      setWorking(false);
    }
  };

  const shown = (pages ?? []).filter((p) => !onlyBlank || selected.has(p.page));

  return (
    <section className="min-h-[60vh] bg-background py-10">
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <ToolHeader category="Organise" title="Remove blank pages"
          description="Find the empty pages left by double-sided scanning, check them, and remove them in one tap. Everything else stays exactly as it was." />

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
          {!file ? (
            <div className="max-w-2xl">
              <FileUpload accept=".pdf,application/pdf" maxSizeInMB={150} onFilesSelected={open} title="Choose a PDF"
                description="Drag & drop or click to browse" buttonText="Select PDF" icon={<FileMinus2 size={34} />} />
            </div>
          ) : progress ? (
            <div role="status" className="max-w-md space-y-2">
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Checking page {progress.done || 1}{progress.total ? ` of ${progress.total}` : ""}…</p>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-brand transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 3}%` }} /></div>
            </div>
          ) : result ? (
            <div className="max-w-2xl space-y-3">
              <div role="status" className="rounded-lg border border-brand/40 bg-brand-tint p-4">
                <p className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 size={17} className="text-brand" /> Removed {result.removed} page{result.removed === 1 ? "" : "s"} · {pages!.length - result.removed} left · {formatFileSize(result.file.size)}</p>
                <p className="mt-1 text-sm text-muted-foreground">Text, links and quality are unchanged. Your original file isn't touched.</p>
              </div>
              <SaveShareButtons file={result.file} />
              <p className="text-xs text-muted-foreground">{SAVE_HINT}</p>
              <div className="flex flex-wrap gap-x-4 border-t border-border pt-2 text-sm">
                <button type="button" onClick={() => setResult(null)} className="inline-flex min-h-11 items-center gap-1.5 font-medium text-muted-foreground hover:text-brand"><Undo2 size={15} /> Change which pages</button>
                <button type="button" onClick={reset} className="min-h-11 font-medium text-muted-foreground hover:text-brand">Check another file</button>
              </div>
            </div>
          ) : pages ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 text-sm">
                  <span className="block truncate font-medium">{file.name}</span>
                  <span className="text-muted-foreground" aria-live="polite">
                    {selected.size ? `${selected.size} of ${pages.length} pages will be removed` : `No blank pages found in ${pages.length} pages`}
                  </span>
                </p>
                <button type="button" onClick={reset} className="min-h-11 text-sm font-medium text-muted-foreground hover:text-brand">Choose another file</button>
              </div>

              <fieldset>
                <legend className="mb-1.5 text-sm font-medium">What counts as blank</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {STRICTNESS.map((s) => (
                    <button key={s.id} type="button" aria-pressed={strictness === s.id} onClick={() => changeStrictness(s.id)}
                      className={`min-h-11 rounded-md border px-3 py-2 text-left text-sm ${strictness === s.id ? "border-brand bg-brand-tint" : "border-input hover:border-brand/60"}`}>
                      <span className="block font-medium">{s.label}</span>
                      <span className="block text-xs text-muted-foreground">{s.hint}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              {hasNotes && (
                <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                  <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[hsl(var(--brand))]" checked={notes} onChange={(e) => { setNotes(e.target.checked); setFlipped(new Set()); }} />
                  <span>Also remove pages that say "This page is intentionally left blank"</span>
                </label>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">Tap a page to keep or remove it.</p>
                {selected.size > 0 && (
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--brand))]" checked={onlyBlank} onChange={(e) => setOnlyBlank(e.target.checked)} /> Show only pages to remove
                  </label>
                )}
              </div>

              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-6">
                {shown.map((p) => {
                  const out = selected.has(p.page);
                  return (
                    <li key={p.page}>
                      <button type="button" onClick={() => toggle(p.page)} aria-pressed={out} aria-label={`Page ${p.page}: ${out ? "will be removed" : "kept"}`}
                        className={`group relative block w-full overflow-hidden rounded-md border-2 bg-white ${out ? "border-destructive" : "border-transparent ring-1 ring-border hover:ring-brand/60"}`}>
                        <img src={p.thumb} alt="" className={`block w-full ${out ? "opacity-40" : ""}`} draggable={false} />
                        {out && <span className="absolute inset-0 grid place-items-center"><span className="flex items-center gap-1 rounded bg-destructive px-1.5 py-0.5 text-[11px] font-semibold text-white"><Trash2 size={12} /> Remove</span></span>}
                      </button>
                      <p className="mt-1 text-center text-xs text-muted-foreground">{p.page}{p.saysBlank ? " · says blank" : ""}</p>
                    </li>
                  );
                })}
              </ul>

              <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-border bg-card/95 p-3 backdrop-blur sm:-mx-6 sm:flex-row sm:items-center sm:justify-end">
                {flipped.size > 0 && <button type="button" onClick={() => setFlipped(new Set())} className="min-h-11 px-3 text-sm font-medium text-muted-foreground hover:text-brand">Back to what was found</button>}
                <button type="button" onClick={run} disabled={!selected.size || working}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
                  {working ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} Remove {selected.size || ""} page{selected.size === 1 ? "" : "s"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <p className="mt-4 max-w-2xl text-xs text-muted-foreground">Pages are checked on this device. Always glance over the pages marked for removal: a page with only a faint pencil note can look blank.</p>
      </div>
    </section>
  );
};

export default RemoveBlankPages;
