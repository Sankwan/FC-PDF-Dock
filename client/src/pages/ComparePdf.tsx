import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, FileDiff, FileText, Hash, Loader2, X } from "lucide-react";
import ToolHeader from "@/components/ToolHeader";
import ToolResult, { chipBtn, primaryBtn, secondaryBtn } from "@/components/ToolResult";
import { ensureUnlocked } from "@/components/UnlockPdfDialog";
import { useToast } from "@/hooks/use-toast";
import { formatFileSize } from "@/lib/fileUtils";
import { loadPdfDocument, renderPdfPageToCanvas } from "@/lib/pdfjs";
import { compareWords, extractWords, markWords, type Change, type PageSize, type Word } from "@/lib/compare";

type Side = "a" | "b";
type Filter = "all" | "changed" | "added" | "removed" | "numbers";
interface Data { a: { words: Word[]; pages: PageSize[] }; b: { words: Word[]; pages: PageSize[] }; changes: Change[] }

/** Renders pages of one file on demand and remembers them. */
function usePageImages(file: File | null) {
  const cache = useRef(new Map<number, string>());
  const doc = useRef<ReturnType<typeof loadPdfDocument> | null>(null);
  const [, bump] = useState(0);
  useEffect(() => {
    cache.current = new Map();
    const d = file ? loadPdfDocument(file) : null;
    doc.current = d;
    // Pages asked for before the file opened are drawn now.
    bump((n) => n + 1);
    return () => { d?.then((p) => p.destroy()).catch(() => undefined); };
  }, [file]);
  return (page: number) => {
    const hit = cache.current.get(page);
    if (hit !== undefined || !doc.current) return hit;
    cache.current.set(page, "");
    doc.current.then(async (pdf) => {
      const p = await pdf.getPage(page);
      const canvas = await renderPdfPageToCanvas(pdf, page, 760 / p.getViewport({ scale: 1 }).width);
      cache.current.set(page, canvas.toDataURL("image/jpeg", 0.8));
      canvas.width = canvas.height = 0;
      bump((n) => n + 1);
    }).catch(() => undefined);
    return "";
  };
}

const Picker = ({ label, hint, file, onFile }: { label: string; hint: string; file: File | null; onFile: (f: File | null) => void }) => {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className={`rounded-xl border-2 border-dashed p-4 ${file ? "border-brand/50 bg-brand-tint" : "border-border bg-card"}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-brand">{label}</p>
      <input ref={input} type="file" accept=".pdf,application/pdf" className="hidden"
        onChange={async (e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; const [ok] = await ensureUnlocked(f); if (ok) onFile(ok); }} />
      {file ? (
        <div className="mt-2 flex items-center gap-3">
          <FileText size={20} className="shrink-0 text-brand" />
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{file.name}</span><span className="text-xs text-muted-foreground">{formatFileSize(file.size)}</span></span>
          <button type="button" onClick={() => onFile(null)} aria-label={`Remove ${file.name}`} className="grid h-11 w-11 place-items-center rounded-md text-muted-foreground hover:bg-card"><X size={16} /></button>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
          <button type="button" onClick={() => input.current?.click()} className={`${secondaryBtn} mt-3 w-full`}>Choose PDF</button>
        </>
      )}
    </div>
  );
};

const PageView = ({ src, size, words, focus, colour, label }: { src?: string; size?: PageSize; words: Word[]; focus: Word[]; colour: "red" | "green"; label: string }) => {
  const focusSet = new Set(focus);
  const tone = colour === "red" ? "rgba(239,68,68," : "rgba(34,197,94,";
  return (
    <figure className="min-w-0">
      <figcaption className="mb-1 text-xs font-semibold text-muted-foreground">{label}</figcaption>
      <div className="relative w-full overflow-hidden border border-border bg-white shadow-sm" style={{ aspectRatio: size ? `${size.width} / ${size.height}` : "1 / 1.414" }}>
        {src ? <img src={src} alt="" className="h-full w-full" /> : <Loader2 className="absolute inset-0 m-auto animate-spin text-muted-foreground" size={18} />}
        {size && words.map((w, i) => {
          const on = focusSet.has(w);
          return (
            <span key={i} data-focus={on || undefined} className="absolute rounded-[1px]"
              style={{ left: `${(w.x / size.width) * 100}%`, top: `${(w.y / size.height) * 100}%`, width: `${(w.w / size.width) * 100}%`, height: `${(w.h / size.height) * 100}%`,
                background: `${tone}${on ? 0.45 : 0.2})`, outline: on ? `2px solid ${tone}0.9)` : undefined }} />
          );
        })}
      </div>
    </figure>
  );
};

const ComparePdf = () => {
  const { toast } = useToast();
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [data, setData] = useState<Data | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [active, setActive] = useState(0);
  const [side, setSide] = useState<Side>("b");
  const [marked, setMarked] = useState<File[] | null>(null);
  const [marking, setMarking] = useState(false);
  const viewer = useRef<HTMLDivElement>(null);
  const imgA = usePageImages(data ? fileA : null);
  const imgB = usePageImages(data ? fileB : null);

  const run = async () => {
    if (!fileA || !fileB) return;
    setProgress(1); setData(null); setMarked(null);
    try {
      const a = await extractWords(fileA, (d, t) => setProgress(Math.max(1, Math.round((d / t) * 45))));
      const b = await extractWords(fileB, (d, t) => setProgress(45 + Math.round((d / t) * 45)));
      const empty = [a.words.length < 5 && fileA.name, b.words.length < 5 && fileB.name].filter(Boolean);
      if (empty.length) {
        toast({ variant: "destructive", title: "No text to compare", description: `${empty.join(" and ")} ${empty.length > 1 ? "have" : "has"} no readable text. If it's a scan, run OCR PDF on it first.` });
        return;
      }
      await new Promise((r) => setTimeout(r, 0));
      const changes = compareWords(a.words, b.words);
      setData({ a, b, changes });
      setActive(0); setFilter("all");
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Couldn't compare these files", description: "One of them may be damaged. Try Repair PDF first." });
    } finally {
      setProgress(0);
    }
  };

  const shown = useMemo(() => (data?.changes ?? []).filter((c) => filter === "all" || (filter === "numbers" ? c.numbers : c.kind === filter)), [data, filter]);
  const current = data?.changes[active];
  const counts = useMemo(() => {
    const c = { changed: 0, added: 0, removed: 0, numbers: 0 };
    data?.changes.forEach((x) => { c[x.kind]++; if (x.numbers) c.numbers++; });
    return c;
  }, [data]);

  const pick = (c: Change) => {
    setActive(c.id);
    if (c.kind === "removed") setSide("a"); else if (c.kind === "added") setSide("b");
    if (window.matchMedia("(max-width: 767px)").matches) viewer.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const saveMarked = async () => {
    if (!data || !fileA || !fileB) return;
    setMarking(true);
    try {
      const removed = data.changes.flatMap((c) => c.removed), added = data.changes.flatMap((c) => c.added);
      setMarked([await markWords(fileA, removed, "red", "_marked_removed"), await markWords(fileB, added, "green", "_marked_added")]);
    } finally {
      setMarking(false);
    }
  };

  const pageA = current?.pageA ?? 1, pageB = current?.pageB ?? 1;
  const removedOn = (p: number) => data?.changes.flatMap((c) => c.removed).filter((w) => w.page === p) ?? [];
  const addedOn = (p: number) => data?.changes.flatMap((c) => c.added).filter((w) => w.page === p) ?? [];
  const words = (list: Word[]) => list.map((w) => w.text).join(" ");

  return (
    <section className="min-h-[60vh] bg-background py-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <ToolHeader category="Official documents" title="Compare PDFs" description="See every word that changed between two versions of a letter, report or schedule. Changed numbers are flagged. Nothing is uploaded." />

        {!data ? (
          <div className="max-w-3xl space-y-4">
            <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
              <Picker label="Original" hint="The older version" file={fileA} onFile={setFileA} />
              <ArrowRight className="mx-auto hidden text-muted-foreground md:block" size={20} />
              <Picker label="Revised" hint="The newer version" file={fileB} onFile={setFileB} />
            </div>
            <button type="button" onClick={run} disabled={!fileA || !fileB || !!progress} className={primaryBtn}>
              {progress ? <Loader2 size={16} className="animate-spin" /> : <FileDiff size={16} />} {progress ? `Comparing… ${progress}%` : "Compare"}
            </button>
            <p className="text-xs text-muted-foreground">Compares the words, not the look of the page. Scanned PDFs need OCR PDF first. Always check important changes yourself.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {data.changes.length ? `${data.changes.length} change${data.changes.length === 1 ? "" : "s"} found` : "No changes in the text"}
                </p>
                <p className="truncate text-xs text-muted-foreground">{fileA?.name} → {fileB?.name}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {data.changes.length > 0 && !marked && (
                  <button type="button" className={secondaryBtn} onClick={saveMarked} disabled={marking}>{marking && <Loader2 size={15} className="animate-spin" />} Save highlighted copies</button>
                )}
                <button type="button" className={secondaryBtn} onClick={() => { setData(null); setMarked(null); }}>Compare other files</button>
              </div>
            </div>
            {marked && <ToolResult files={marked} zipName="comparison.zip" title="Highlighted copies ready" detail="The original with removed words in red, and the revised file with added words in green." />}

            {data.changes.length > 0 && (
              <div className="grid items-start gap-4 md:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
                <div className="order-2 space-y-3 md:order-none">
                  <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Show">
                    {([["all", `All ${data.changes.length}`], ["changed", `Changed ${counts.changed}`], ["added", `Added ${counts.added}`], ["removed", `Removed ${counts.removed}`], ["numbers", `Numbers & "not" ${counts.numbers}`]] as const).map(([id, name]) => (
                      <button key={id} type="button" role="radio" aria-checked={filter === id} onClick={() => setFilter(id)} className={`${chipBtn(filter === id)} min-h-9 text-xs`}>{name}</button>
                    ))}
                  </div>
                  <ol className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
                    {shown.map((c) => (
                      <li key={c.id}>
                        <button type="button" onClick={() => pick(c)} aria-current={c.id === active}
                          className={`w-full rounded-lg border p-3 text-left text-sm ${c.id === active ? "border-brand bg-brand-tint" : "border-border bg-card hover:border-brand/50"}`}>
                          <span className="mb-1 flex items-center gap-2 text-xs">
                            <span className={`rounded px-1.5 py-0.5 font-semibold ${c.kind === "added" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100" : c.kind === "removed" ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100" : "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100"}`}>
                              {c.kind === "added" ? "Added" : c.kind === "removed" ? "Removed" : "Changed"}
                            </span>
                            {c.numbers && <span className="inline-flex items-center gap-0.5 font-semibold text-amber-700 dark:text-amber-300"><Hash size={12} />Check</span>}
                            <span className="ml-auto tabular-nums text-muted-foreground">p.{c.pageA}{c.pageA !== c.pageB ? ` → p.${c.pageB}` : ""}</span>
                          </span>
                          <span className="line-clamp-4 break-words">
                            {c.before && <span className="text-muted-foreground">…{c.before} </span>}
                            {c.removed.length > 0 && <del className="bg-red-100 text-red-900 decoration-red-500 dark:bg-red-950 dark:text-red-100">{words(c.removed)}</del>}
                            {c.removed.length > 0 && c.added.length > 0 && " "}
                            {c.added.length > 0 && <ins className="bg-green-100 text-green-900 no-underline dark:bg-green-950 dark:text-green-100">{words(c.added)}</ins>}
                            {c.after && <span className="text-muted-foreground"> {c.after}…</span>}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>

                <div ref={viewer} className="order-1 scroll-mt-20 rounded-xl border border-border bg-muted p-3 md:sticky md:top-24 md:order-none">
                  <div role="tablist" className="mb-3 grid grid-cols-2 rounded-lg bg-card p-1 md:hidden">
                    {([["a", `Original · p.${pageA}`], ["b", `Revised · p.${pageB}`]] as const).map(([id, name]) => (
                      <button key={id} type="button" role="tab" aria-selected={side === id} onClick={() => setSide(id)}
                        className={`min-h-10 rounded-md text-sm font-semibold ${side === id ? "bg-brand text-white" : "text-muted-foreground"}`}>{name}</button>
                    ))}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className={side === "a" ? "" : "hidden md:block"}>
                      <PageView label={`Original · page ${pageA}`} src={imgA(pageA)} size={data.a.pages[pageA - 1]} words={removedOn(pageA)} focus={current?.removed ?? []} colour="red" />
                    </div>
                    <div className={side === "b" ? "" : "hidden md:block"}>
                      <PageView label={`Revised · page ${pageB}`} src={imgB(pageB)} size={data.b.pages[pageB - 1]} words={addedOn(pageB)} focus={current?.added ?? []} colour="green" />
                    </div>
                  </div>
                  <p className="mt-2 text-center text-xs text-muted-foreground">Red: removed from the original. Green: added in the revised version.</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default ComparePdf;
