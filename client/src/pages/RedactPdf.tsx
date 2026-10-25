import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, EyeOff, Loader2, Search, Trash2, X } from "lucide-react";
import RectangleControls, { type Rectangle } from "@/components/RectangleControls";
import ToolHeader from "@/components/ToolHeader";
import FileUpload from "@/components/FileUpload";
import SaveShareButtons from "@/components/SaveShareButtons";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { loadPdfDocument, renderPdfPageToCanvas } from "@/lib/pdfjs";
import {
  PATTERNS, applyRedactions, findMatches, manualBox, readPageText, type Box, type PageText, type RedactResult,
} from "@/lib/redact";

type PdfJsDoc = Awaited<ReturnType<typeof loadPdfDocument>>;

const RedactPdf = () => {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [pdf, setPdf] = useState<PdfJsDoc | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [pageImage, setPageImage] = useState<string>("");
  const [pageAspect, setPageAspect] = useState(1.414);
  const [texts, setTexts] = useState<PageText[] | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [patterns, setPatterns] = useState<string[]>(["ghana-card", "phone"]);
  const [terms, setTerms] = useState("");
  const [wholeWords, setWholeWords] = useState(true);
  const [lastFind, setLastFind] = useState<number | null>(null);
  const [restoreText, setRestoreText] = useState(true);
  const [removeHidden, setRemoveHidden] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<RedactResult | null>(null);
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [manualArea, setManualArea] = useState<Rectangle>({ x: .1, y: .1, w: .3, h: .1 });
  const surfaceRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setBusy("Opening");
    try {
      const doc = await loadPdfDocument(f);
      setFile(f);
      setPdf(doc);
      setNumPages(doc.numPages);
      setPage(1);
      setBoxes([]);
      setTexts(null);
      setResult(null);
      setLastFind(null);
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Couldn't open this PDF", description: "The file may be damaged." });
    } finally {
      setBusy(null);
    }
  }, [toast]);

  useEffect(() => () => void pdf?.destroy(), [pdf]);

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    (async () => {
      const p = await pdf.getPage(page);
      const vp = p.getViewport({ scale: 1 });
      const width = Math.min(1100, (surfaceRef.current?.clientWidth || 800) * (window.devicePixelRatio || 1));
      const canvas = await renderPdfPageToCanvas(pdf, page, width / vp.width);
      if (cancelled) return;
      setPageAspect(vp.height / vp.width);
      setPageImage(canvas.toDataURL("image/jpeg", 0.85));
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, page]);

  const reset = () => {
    setFile(null);
    setPdf(null);
    setBoxes([]);
    setTexts(null);
    setResult(null);
    setPageImage("");
  };

  const ensureTexts = async (): Promise<PageText[]> => {
    if (texts) return texts;
    if (!pdf) return [];
    const out: PageText[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      setProgress(Math.round((n / pdf.numPages) * 100));
      out.push(await readPageText(pdf, n));
    }
    setTexts(out);
    return out;
  };

  const find = async () => {
    setBusy("Reading the document");
    setResult(null);
    try {
      const all = await ensureTexts();
      const termList = terms.split(/[\n,;]/).map((t) => t.trim()).filter(Boolean);
      const found = findMatches(all, { patterns, terms: termList, wholeWords });
      // Keep manual boxes; replace earlier automatic finds.
      setBoxes((prev) => [...prev.filter((b) => b.source === "manual"), ...found]);
      setLastFind(found.length);
      const hasText = all.some((p) => p.lines.length);
      if (!hasText) {
        toast({ title: "No text found", description: "This looks like a scanned document. Run OCR PDF first, or draw boxes by hand." });
      } else if (found.length && !found.some((b) => b.page === page)) {
        setPage(found[0].page);
      }
    } catch {
      toast({ variant: "destructive", title: "Could not search this PDF", description: "Try OCR PDF for scanned pages, or add redaction areas manually." });
    } finally {
      setBusy(null);
      setProgress(0);
    }
  };

  const apply = async () => {
    if (!file || !boxes.length) return;
    setBusy("Redacting");
    setProgress(0);
    try {
      const r = await applyRedactions(file, boxes, {
        restoreText,
        removeHidden,
        onProgress: (done, total, stage) => {
          setBusy(stage);
          setProgress(total ? Math.round((done / total) * 100) : 0);
        },
      });
      setResult(r);
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Redaction failed", description: err instanceof Error ? err.message : "Try again." });
    } finally {
      setBusy(null);
    }
  };

  // Drawing boxes by hand: pointer events work for mouse, pen and touch.
  const pointFrom = (e: React.PointerEvent) => {
    const r = surfaceRef.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-box]")) return;
    e.preventDefault();
    surfaceRef.current?.setPointerCapture(e.pointerId);
    const p = pointFrom(e);
    setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!draft) return;
    const p = pointFrom(e);
    setDraft({ ...draft, x1: p.x, y1: p.y });
  };
  const onUp = () => {
    if (!draft) return;
    const x = Math.min(draft.x0, draft.x1);
    const y = Math.min(draft.y0, draft.y1);
    const w = Math.abs(draft.x1 - draft.x0);
    const h = Math.abs(draft.y1 - draft.y0);
    if (w > 0.008 && h > 0.004) {
      setBoxes((b) => [...b, manualBox(page, x, y, w, h)]);
      setResult(null);
    }
    setDraft(null);
  };

  const pageBoxes = boxes.filter((b) => b.page === page);
  const pagesWithBoxes = useMemo(() => Array.from(new Set(boxes.map((b) => b.page))).sort((a, b) => a - b), [boxes]);
  const countBySource = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of boxes) m.set(b.source, (m.get(b.source) ?? 0) + 1);
    return m;
  }, [boxes]);
  const sourceLabel = (id: string) => (id === "manual" ? "Drawn by hand" : id === "search" ? "Your search words" : PATTERNS.find((p) => p.id === id)?.label ?? id);

  return (
    <section className="min-h-[60vh] bg-background py-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <ToolHeader
          category="Official documents"
          title="Redact PDF"
          description="Permanently remove personal details before you share a document. Find Ghana Card numbers, phone numbers and names automatically, or draw boxes over anything else."
        />

        {!file ? (
          <div className="max-w-2xl rounded-xl border border-border bg-card p-6 shadow-sm">
            <FileUpload
              accept=".pdf,application/pdf"
              maxSizeInMB={100}
              onFilesSelected={load}
              title={busy ? "Opening…" : "Upload PDF to redact"}
              description="Drag & drop or click to browse"
              buttonText="Select PDF"
              icon={busy ? <Loader2 size={34} className="animate-spin" /> : <EyeOff size={34} />}
            />
          </div>
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            {/* Page viewer */}
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between gap-2 bg-chrome px-3 py-2 text-white">
                <span className="max-w-[50%] truncate text-xs font-semibold">{file.name}</span>
                <div className="flex items-center gap-1">
                  <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="grid h-8 w-8 place-items-center rounded hover:bg-white/10 disabled:opacity-30"><ChevronLeft size={16} /></button>
                  <span className="text-xs tabular-nums">Page {page} of {numPages}</span>
                  <button type="button" aria-label="Next page" disabled={page >= numPages} onClick={() => setPage((p) => p + 1)} className="grid h-8 w-8 place-items-center rounded hover:bg-white/10 disabled:opacity-30"><ChevronRight size={16} /></button>
                </div>
              </div>
              <div className="bg-muted p-3 sm:p-5">
                <div
                  ref={surfaceRef}
                  className="relative mx-auto w-full max-w-[760px] cursor-crosshair touch-none select-none bg-white shadow-sm"
                  style={{ aspectRatio: `1 / ${pageAspect}` }}
                  onPointerDown={onDown}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={() => setDraft(null)}
                >
                  {pageImage ? <img src={pageImage} alt={`Page ${page}`} draggable={false} className="absolute inset-0 h-full w-full" /> : <Loader2 className="absolute left-1/2 top-1/2 animate-spin text-muted-foreground" />}
                  {pageBoxes.map((b) => (
                    <div
                      key={b.id}
                      data-box
                      className="group absolute border-2 border-red-600 bg-black/70"
                      style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}
                      title={b.text ? `Will remove: ${b.text}` : "Will be blacked out"}
                    >
                      <button
                        type="button"
                        aria-label="Remove this box"
                        onClick={() => { setBoxes((all) => all.filter((x) => x.id !== b.id)); setResult(null); }}
                        className="absolute -right-2.5 -top-2.5 grid h-5 w-5 place-items-center rounded-full bg-red-600 text-white opacity-90 hover:opacity-100"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                  {draft && (
                    <div
                      className="absolute border-2 border-dashed border-red-600 bg-black/40"
                      style={{
                        left: `${Math.min(draft.x0, draft.x1) * 100}%`,
                        top: `${Math.min(draft.y0, draft.y1) * 100}%`,
                        width: `${Math.abs(draft.x1 - draft.x0) * 100}%`,
                        height: `${Math.abs(draft.y1 - draft.y0) * 100}%`,
                      }}
                    />
                  )}
                </div>
                <p className="mt-3 text-center text-xs text-muted-foreground">Drag across the page to black out an area. Tap × on a box to remove it.</p>
              </div>
              {pagesWithBoxes.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-3 py-2.5 text-xs">
                  <span className="mr-1 text-muted-foreground">Pages with redactions:</span>
                  {pagesWithBoxes.map((n) => (
                    <button key={n} type="button" onClick={() => setPage(n)}
                      className={`h-7 min-w-7 rounded px-2 font-semibold tabular-nums ${n === page ? "bg-brand text-white" : "bg-muted text-foreground hover:bg-brand-tint"}`}>
                      {n}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-foreground">Find and redact</h2>
                <div className="mt-3 space-y-2.5">
                  {PATTERNS.map((p) => (
                    <label key={p.id} htmlFor={`pat-${p.id}`} className="flex cursor-pointer items-start gap-2.5">
                      <Checkbox id={`pat-${p.id}`} className="mt-0.5" checked={patterns.includes(p.id)}
                        onCheckedChange={(c) => setPatterns((prev) => (c === true ? [...prev, p.id] : prev.filter((x) => x !== p.id)))} />
                      <span className="text-sm">
                        <span className="text-foreground">{p.label}</span>
                        <span className="block text-xs text-muted-foreground">e.g. {p.example}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="mt-4">
                  <Label htmlFor="terms" className="text-sm font-semibold">Names or words</Label>
                  <textarea
                    id="terms"
                    rows={2}
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                    placeholder="e.g. Kwame Mensah, Plot 24 (separate with commas)"
                    className="mt-1.5 w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  />
                  <label htmlFor="whole" className="mt-1.5 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox id="whole" checked={wholeWords} onCheckedChange={(c) => setWholeWords(c === true)} /> Match whole words only
                  </label>
                </div>
                <button type="button" onClick={find} disabled={Boolean(busy)}
                  className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-brand text-sm font-semibold text-brand hover:bg-brand-tint disabled:opacity-60">
                  <Search size={15} /> Find in document
                </button>
                {lastFind !== null && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {lastFind ? `Found ${lastFind} item${lastFind === 1 ? "" : "s"}. Check each page before redacting.` : "Nothing found. You can still draw boxes by hand."}
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-foreground">To be removed</h2>
                  {boxes.length > 0 && (
                    <button type="button" onClick={() => { setBoxes([]); setResult(null); }} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-destructive">
                      <Trash2 size={13} /> Clear all
                    </button>
                  )}
                </div>
                {boxes.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">Nothing marked yet.</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {Array.from(countBySource).map(([src, n]) => (
                      <li key={src} className="flex justify-between"><span className="text-muted-foreground">{sourceLabel(src)}</span><span className="font-semibold tabular-nums">{n}</span></li>
                    ))}
                  </ul>
                )}

                <details className="mt-4 border-t border-border pt-4">
                  <summary className="cursor-pointer py-2 text-sm font-semibold">Add an area without dragging</summary>
                  <RectangleControls label="New redaction area" value={manualArea} onChange={setManualArea} />
                  <button type="button" disabled={Boolean(busy)} onClick={() => { setBoxes(prev => [...prev, manualBox(page, manualArea.x, manualArea.y, manualArea.w, manualArea.h)]); setResult(null); }} className="mt-3 min-h-11 rounded-md border border-brand px-4 text-sm font-semibold text-brand">Add area to page {page}</button>
                  {boxes.filter(b => b.source === "manual" && b.page === page).map((b, i) => <div key={b.id} className="mt-3">
                    <RectangleControls label={`Edit manual area ${i + 1}`} value={b} onChange={value => { setBoxes(prev => prev.map(item => item.id === b.id ? { ...item, ...value } : item)); setResult(null); }} />
                    <button type="button" onClick={() => { setBoxes(prev => prev.filter(item => item.id !== b.id)); setResult(null); }} className="min-h-11 text-sm font-semibold text-destructive">Remove manual area {i + 1}</button>
                  </div>)}
                </details>
                <div className="mt-4 space-y-2.5 border-t border-border pt-4">
                  <label htmlFor="restore" className="flex cursor-pointer items-start gap-2.5 text-sm">
                    <Checkbox id="restore" className="mt-0.5" checked={restoreText} onCheckedChange={(c) => setRestoreText(c === true)} />
                    <span><span className="text-foreground">Keep redacted pages searchable</span><span className="block text-xs text-muted-foreground">Re-reads the remaining text on those pages. Slower.</span></span>
                  </label>
                  <label htmlFor="hidden" className="flex cursor-pointer items-start gap-2.5 text-sm">
                    <Checkbox id="hidden" className="mt-0.5" checked={removeHidden} onCheckedChange={(c) => setRemoveHidden(c === true)} />
                    <span><span className="text-foreground">Remove hidden information</span><span className="block text-xs text-muted-foreground">Author, title, attachments, scripts and bookmarks.</span></span>
                  </label>
                </div>

                {busy && (
                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>{busy}…</span>{progress > 0 && <span>{progress}%</span>}</div>
                    <Progress value={progress} className="h-1.5" />
                  </div>
                )}

                {!result && (
                  <button type="button" onClick={apply} disabled={!boxes.length || Boolean(busy)}
                    className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
                    <EyeOff size={16} /> Redact {boxes.length || ""} item{boxes.length === 1 ? "" : "s"} permanently
                  </button>
                )}
              </div>

              {result && (
                <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                  {result.leftovers.length === 0 ? (
                    <div className="flex gap-3">
                      <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-brand" />
                      <div className="text-sm">
                        <p className="font-semibold text-foreground">Redacted and checked</p>
                        <p className="mt-1 text-muted-foreground">
                          {result.boxes} area{result.boxes === 1 ? "" : "s"} removed from {result.pagesFlattened} page{result.pagesFlattened === 1 ? "" : "s"}.
                          {result.checkedStrings > 0 ? ` We searched the new file for all ${result.checkedStrings} redacted text item${result.checkedStrings === 1 ? "" : "s"} and found none.` : ""}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-3 text-amber-900 dark:text-amber-100">
                      <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600" />
                      <div className="text-sm">
                        <p className="font-semibold">Some redacted text still appears elsewhere</p>
                        <ul className="mt-1 space-y-0.5">
                          {result.leftovers.map((l) => (
                            <li key={l.text}>"{l.text}" on page {l.pages.join(", ")}</li>
                          ))}
                        </ul>
                        <p className="mt-1.5">It wasn't marked on those pages. Go back, find it there too, and redact again.</p>
                        <button type="button" onClick={() => setResult(null)} className="mt-2 font-semibold underline">Back to editing</button>
                      </div>
                    </div>
                  )}
                  <SaveShareButtons file={result.file} className="mt-4" />
                  <p className="mt-3 text-xs text-muted-foreground">Pages with redactions are now images. The original file on your device isn't changed.</p>
                </div>
              )}

              <button type="button" onClick={reset} className="h-10 w-full rounded-md border border-border text-sm font-medium text-foreground hover:bg-muted">
                Start over with another file
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default RedactPdf;
