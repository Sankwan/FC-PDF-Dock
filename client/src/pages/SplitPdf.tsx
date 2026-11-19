import { useEffect, useMemo, useState } from "react";
import { Check, FileText, Loader2, Scissors } from "lucide-react";
import ToolHeader from "@/components/ToolHeader";
import FileUpload from "@/components/FileUpload";
import ToolResult, { StickyAction, chipBtn, primaryBtn, secondaryBtn } from "@/components/ToolResult";
import { useToast } from "@/hooks/use-toast";
import { useFileVault } from "@/context/FileVault";
import { formatFileSize } from "@/lib/fileUtils";
import { getPdfPageCount } from "@/lib/pdfUtils";
import { newKey, readPages, type PageItem } from "@/lib/organize";
import { parseRanges, planEvery, planFromGroups, runSplit, splitBySize, type SplitPart } from "@/lib/split";

type Mode = "ranges" | "pick" | "every" | "size";
const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "pick", label: "Pick pages", hint: "Tap the pages you want" },
  { id: "ranges", label: "Type ranges", hint: "e.g. 1-3, 7, 12-" },
  { id: "every", label: "Every N pages", hint: "Equal chunks" },
  { id: "size", label: "By file size", hint: "Each file under a limit" },
];
const SIZE_LIMITS = [{ label: "1 MB", mb: 1 }, { label: "2 MB", mb: 2 }, { label: "5 MB", mb: 5 }, { label: "10 MB", mb: 10 }, { label: "20 MB", mb: 20 }];

const SplitPdf = () => {
  const { toast } = useToast();
  const { files: vaultFiles, removeFile } = useFileVault();
  const [file, setFile] = useState<File | null>(null);
  const [total, setTotal] = useState(0);
  const [mode, setMode] = useState<Mode>("pick");
  const [ranges, setRanges] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [combine, setCombine] = useState(true);
  const [every, setEvery] = useState(1);
  const [limitMb, setLimitMb] = useState(5);
  const [thumbs, setThumbs] = useState<PageItem[]>([]);
  const [busy, setBusy] = useState(0);
  const [result, setResult] = useState<{ files: File[]; parts: SplitPart[]; oversized?: number[] } | null>(null);
  const base = file?.name.replace(/\.pdf$/i, "") ?? "document";

  useEffect(() => {
    if (!file) return;
    let alive = true;
    getPdfPageCount(file).then((n) => alive && setTotal(n)).catch(() => toast({ variant: "destructive", title: "Couldn't open this PDF", description: "Try Repair PDF first." }));
    readPages({ id: newKey(), file }, (key, url) => alive && setThumbs((t) => t.map((p) => (p.key === key ? { ...p, thumb: url } : p))))
      .then((items) => alive && setThumbs((prev) => (prev.length ? prev : items)))
      .catch(() => undefined);
    return () => { alive = false; };
  }, [file, toast]);

  const { plan, error } = useMemo((): { plan: SplitPart[]; error?: string } => {
    if (!total) return { plan: [] };
    if (mode === "pick") {
      const pages = [...picked].sort((a, b) => a - b);
      if (!pages.length) return { plan: [], error: "Tap the pages you want to keep." };
      return { plan: planFromGroups(combine ? [pages] : pages.map((p) => [p]), base, combine) };
    }
    if (mode === "ranges") {
      const r = parseRanges(ranges, total);
      return r.error ? { plan: [], error: r.error } : { plan: planFromGroups(r.groups, base, combine) };
    }
    if (mode === "every") return { plan: planEvery(total, every, base) };
    return { plan: [] };
  }, [total, mode, picked, ranges, combine, every, base]);

  const change = () => setResult(null);
  const togglePage = (n: number) => { setPicked((s) => { const next = new Set(s); next.has(n) ? next.delete(n) : next.add(n); return next; }); change(); };

  const run = async () => {
    if (!file) return;
    setBusy(1);
    try {
      if (mode === "size") {
        const r = await splitBySize(file, limitMb * 1024 * 1024, (d, t) => setBusy(Math.max(1, Math.round((d / t) * 100))));
        setResult(r);
      } else {
        const files = await runSplit(file, plan, (d, t) => setBusy(Math.max(1, Math.round((d / t) * 100))));
        setResult({ files, parts: plan });
      }
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Couldn't split this PDF", description: "The file may be damaged. Try Repair PDF first." });
    } finally {
      setBusy(0);
    }
  };

  const reset = () => {
    vaultFiles.filter((vf) => vf.file === file).forEach((vf) => removeFile(vf.id));
    setFile(null); setTotal(0); setThumbs([]); setPicked(new Set()); setRanges(""); setResult(null);
  };

  const pagesOf = (f: File) => result?.parts[result.files.indexOf(f)]?.pages.length;

  return (
    <section className="min-h-[60vh] bg-background py-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <ToolHeader category="Organise" title="Split PDF" description="Pull out the pages you need, cut a long PDF into parts, or make files small enough to email." />

        {!file ? (
          <div className="max-w-2xl rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
            <FileUpload accept=".pdf,application/pdf" maxSizeInMB={200} onFilesSelected={(f) => { setFile(f[0] ?? null); setResult(null); }}
              title="Choose a PDF" description="Drag & drop or click to browse" buttonText="Select PDF" icon={<Scissors size={34} />} />
          </div>
        ) : (
          <div className="max-w-3xl space-y-5 rounded-xl border border-border bg-card p-4 pb-0 shadow-sm sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{file.name}</span>
                <span className="text-xs text-muted-foreground">{total ? `${total} page${total === 1 ? "" : "s"} · ` : ""}{formatFileSize(file.size)}</span>
              </span>
              <button type="button" onClick={reset} className="min-h-11 shrink-0 text-sm text-muted-foreground hover:text-brand">Change file</button>
            </div>

            {!result && (
              <>
                <div role="radiogroup" aria-label="How to split" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {MODES.map((m) => (
                    <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} onClick={() => { setMode(m.id); change(); }}
                      className={`rounded-lg border p-3 text-left ${mode === m.id ? "border-brand bg-brand-tint" : "border-border hover:border-brand/50"}`}>
                      <span className="block text-sm font-semibold">{m.label}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{m.hint}</span>
                    </button>
                  ))}
                </div>

                {mode === "pick" && (
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-muted-foreground tabular-nums">{picked.size} of {total} selected</span>
                      <button type="button" className="min-h-9 px-2 font-medium text-brand" onClick={() => { setPicked(new Set(Array.from({ length: total }, (_, i) => i + 1))); change(); }}>All</button>
                      <button type="button" className="min-h-9 px-2 font-medium text-brand" onClick={() => { setPicked(new Set()); change(); }}>None</button>
                    </div>
                    <ol className="grid max-h-[26rem] grid-cols-3 gap-2 overflow-y-auto rounded-lg border border-border bg-muted p-2 sm:grid-cols-5 md:grid-cols-6">
                      {Array.from({ length: total }, (_, i) => i + 1).map((n) => {
                        const on = picked.has(n);
                        const t = thumbs[n - 1];
                        return (
                          <li key={n}>
                            <button type="button" onClick={() => togglePage(n)} aria-pressed={on} aria-label={`Page ${n}`}
                              className={`relative flex w-full flex-col items-center rounded-md border-2 bg-card p-1 ${on ? "border-brand" : "border-transparent"}`}>
                              <span className="grid aspect-[3/4] w-full place-items-center overflow-hidden">
                                {t?.thumb ? <img src={t.thumb} alt="" className="max-h-full max-w-full shadow-sm" style={{ transform: `rotate(${t.baseRotation}deg)` }} /> : <FileText size={18} className="text-muted-foreground" />}
                              </span>
                              <span className="mt-1 text-xs tabular-nums">{n}</span>
                              {on && <span className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-brand text-white"><Check size={14} /></span>}
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}

                {mode === "ranges" && (
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold">Pages</span>
                    <input value={ranges} onChange={(e) => { setRanges(e.target.value); change(); }} placeholder="e.g. 1-3, 7, 12-" inputMode="numeric" autoComplete="off"
                      aria-invalid={!!error && !!ranges} className={`h-11 w-full rounded-md border bg-card px-3 text-sm ${error && ranges ? "border-destructive" : "border-input"}`} />
                    <span className={`mt-1 block text-xs ${error && ranges ? "text-destructive" : "text-muted-foreground"}`}>
                      {error && ranges ? error : `Commas separate parts. "12-" means page 12 to the end (page ${total}).`}
                    </span>
                  </label>
                )}

                {(mode === "pick" || mode === "ranges") && (
                  <fieldset>
                    <legend className="mb-2 text-sm font-semibold">Make</legend>
                    <div className="flex flex-wrap gap-2" role="radiogroup">
                      <button type="button" role="radio" aria-checked={combine} className={chipBtn(combine)} onClick={() => { setCombine(true); change(); }}>One PDF with these pages</button>
                      <button type="button" role="radio" aria-checked={!combine} className={chipBtn(!combine)} onClick={() => { setCombine(false); change(); }}>{mode === "pick" ? "A PDF for each page" : "A PDF for each part"}</button>
                    </div>
                  </fieldset>
                )}

                {mode === "every" && (
                  <label className="block max-w-xs">
                    <span className="mb-1.5 block text-sm font-semibold">Pages in each file</span>
                    <input type="number" min={1} max={total || 1} inputMode="numeric" value={every}
                      onChange={(e) => { setEvery(Math.min(Math.max(1, Number(e.target.value) || 1), total || 1)); change(); }}
                      className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm" />
                  </label>
                )}

                {mode === "size" && (
                  <fieldset>
                    <legend className="mb-2 text-sm font-semibold">Keep each file under</legend>
                    <div className="flex flex-wrap gap-2" role="radiogroup">
                      {SIZE_LIMITS.map((s) => <button key={s.mb} type="button" role="radio" aria-checked={limitMb === s.mb} className={chipBtn(limitMb === s.mb)} onClick={() => { setLimitMb(s.mb); change(); }}>{s.label}</button>)}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {file.size <= limitMb * 1024 * 1024
                        ? `This file is already ${formatFileSize(file.size)}, under ${limitMb} MB. Splitting will make one file.`
                        : `Pages stay in order. Expect about ${Math.ceil(file.size / (limitMb * 1024 * 1024))} files or a few more. If one page alone is bigger, it gets its own file; try Compress PDF on that one.`}
                    </p>
                  </fieldset>
                )}

                {plan.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-semibold">Will make {plan.length} file{plan.length === 1 ? "" : "s"}</p>
                    <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                      {plan.slice(0, 200).map((p, i) => (
                        <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                          <span className="min-w-0 truncate">{p.name}</span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{p.pages.length} page{p.pages.length === 1 ? "" : "s"}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            <StickyAction>
              {result ? (
                <ToolResult files={result.files} zipName={`${base}_split.zip`} pages={pagesOf}
                  detail={mode === "size" ? `Each file is under ${limitMb} MB${result.oversized?.length ? ", except as noted below" : ""}.` : "Pages are copied exactly; text and quality are unchanged."}
                  actions={<><button type="button" className={secondaryBtn} onClick={() => setResult(null)}>Split differently</button><button type="button" className={secondaryBtn} onClick={reset}>Split another file</button></>}>
                  {!!result.oversized?.length && (
                    <p className="text-xs text-amber-800 dark:text-amber-200">
                      Page{result.oversized.length === 1 ? "" : "s"} {result.oversized.join(", ")} {result.oversized.length === 1 ? "is" : "are"} bigger than {limitMb} MB on {result.oversized.length === 1 ? "its" : "their"} own, so {result.oversized.length === 1 ? "it's" : "each is"} in a separate file over the limit. Compress PDF can shrink {result.oversized.length === 1 ? "it" : "them"}.
                    </p>
                  )}
                </ToolResult>
              ) : (
                <button type="button" onClick={run} disabled={!!busy || !total || (mode !== "size" && (!plan.length || !!error))} className={primaryBtn}>
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Scissors size={16} />}
                  {busy ? `Splitting… ${busy}%` : mode === "size" ? `Split into files under ${limitMb} MB` : plan.length === 1 ? "Make the PDF" : `Make ${plan.length || ""} PDFs`}
                </button>
              )}
            </StickyAction>
          </div>
        )}
      </div>
    </section>
  );
};

export default SplitPdf;
