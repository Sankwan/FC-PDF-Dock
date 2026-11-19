import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  AlertTriangle, BookOpen, ChevronLeft, ChevronRight, Download, FileText, Headphones, Loader2, Minus, Pause, Play, Plus, SkipBack, SkipForward, X,
} from "lucide-react";
import ToolHeader from "@/components/ToolHeader";
import FileUpload from "@/components/FileUpload";
import { useToast } from "@/hooks/use-toast";
import { useFileVault } from "@/context/FileVault";
import { formatFileSize } from "@/lib/fileUtils";
import { loadPdfDocument, renderPdfPageToCanvas } from "@/lib/pdfjs";
import { readableText, type ReadablePage, type Sentence } from "@/lib/reader";
import {
  deviceSpeechSupported, deviceVoices, loadNaturalVoice, NATURAL_VOICES, naturalVoiceLoaded, onVoicesChanged, playSamples, speakWithDevice, synthesize, unlockAudio, type Engine,
} from "@/lib/speech";

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const ZOOMS = [1, 1.25, 1.5, 2];
type View = "pages" | "text";

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

/** One page, drawn when it scrolls near the screen, with the sentence being read highlighted. */
const PageView = ({ pdf, page, zoom, current, onTap, register }: {
  pdf: any; page: ReadablePage; zoom: number; current: Sentence | null;
  onTap: (page: ReadablePage, x: number, y: number) => void; register: (n: number, el: HTMLElement | null) => void;
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!near) return;
    let alive = true;
    const width = (ref.current?.clientWidth || 600) * Math.min(2, window.devicePixelRatio || 1);
    renderPdfPageToCanvas(pdf, page.page, width / page.width).then((c) => {
      if (!alive) return;
      setSrc(c.toDataURL("image/jpeg", 0.88));
      c.width = c.height = 0;
    }).catch(() => {});
    return () => { alive = false; };
  }, [near, pdf, page, zoom]);

  const mine = current?.page === page.page ? current : null;
  const pct = (v: number, t: number) => `${(v / t) * 100}%`;
  return (
    <div ref={(el) => { ref.current = el; register(page.page, el); }} data-page={page.page}
      className="relative mx-auto bg-white shadow-sm ring-1 ring-black/5"
      style={{ width: `${zoom * 100}%`, aspectRatio: `${page.width} / ${page.height}` }}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onTap(page, ((e.clientX - r.left) / r.width) * page.width, ((e.clientY - r.top) / r.height) * page.height);
      }}>
      {src ? <img src={src} alt={`Page ${page.page}`} className="h-full w-full select-none" draggable={false} />
        : <span className="absolute inset-0 grid place-items-center"><Loader2 size={18} className="animate-spin text-muted-foreground" /></span>}
      {mine?.boxes.map((b, i) => (
        <span key={i} data-current={i === 0 ? "" : undefined} aria-hidden className="pointer-events-none absolute rounded-sm bg-amber-300/45 mix-blend-multiply ring-1 ring-amber-500/60"
          style={{ left: pct(b.x - 1, page.width), top: pct(b.y - 1, page.height), width: pct(b.w + 2, page.width), height: pct(b.h + 2, page.height) }} />
      ))}
      <span className="absolute bottom-1 right-2 rounded bg-black/50 px-1.5 text-[11px] text-white">{page.page}</span>
    </div>
  );
};

const ReadPdf = () => {
  const { toast } = useToast();
  const { files: vaultFiles, removeFile } = useFileVault();
  const [file, setFile] = useState<File | null>(null);
  const [pdf, setPdf] = useState<any>(null);
  const [pages, setPages] = useState<ReadablePage[] | null>(null);
  const [loading, setLoading] = useState(0);
  const [view, setView] = useState<View>("pages");
  const [zoom, setZoom] = useState(1);
  const [visiblePage, setVisiblePage] = useState(1);

  // Read-aloud state
  const [listening, setListening] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [index, setIndex] = useState(0);
  const [rate, setRate] = useState(() => Number(store.get("reader:rate")) || 1);
  const [engine, setEngine] = useState<Engine>(() => (store.get("reader:engine") === "natural" ? "natural" : "device"));
  const [voiceURI, setVoiceURI] = useState(() => store.get("reader:voice") ?? "");
  const [natural, setNatural] = useState(() => store.get("reader:natural") ?? NATURAL_VOICES[0].id);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [naturalState, setNaturalState] = useState<"idle" | "loading" | "ready" | "failed">(naturalVoiceLoaded() ? "ready" : "idle");
  const [naturalProgress, setNaturalProgress] = useState(0);
  const [resume, setResume] = useState<number | null>(null);

  const pageEls = useRef(new Map<number, HTMLElement>());
  const run = useRef(0);
  const stopCurrent = useRef<() => void>(() => {});
  const prefetch = useRef(new Map<string, Promise<Float32Array>>());

  const sentences = useMemo(() => pages?.flatMap((p) => p.sentences) ?? [], [pages]);
  const current = listening ? sentences[index] ?? null : null;
  const key = file ? `reader:pos:${file.name}:${file.size}` : "";

  useEffect(() => {
    setVoices(deviceVoices());
    return onVoicesChanged(() => setVoices(deviceVoices()));
  }, []);
  useEffect(() => { store.set("reader:rate", String(rate)); store.set("reader:engine", engine); store.set("reader:voice", voiceURI); store.set("reader:natural", natural); }, [rate, engine, voiceURI, natural]);

  // Open the file: render with pdf.js and read the text.
  useEffect(() => {
    if (!file) return;
    let alive = true;
    let doc: any = null;
    setLoading(1); setPages(null); setPdf(null); setIndex(0);
    (async () => {
      doc = await loadPdfDocument(file);
      if (!alive) return;
      setPdf(doc);
      const read = await readableText(doc, (d, t) => alive && setLoading(Math.max(1, Math.round((d / t) * 100))));
      if (!alive) return;
      setPages(read);
      const saved = Number(store.get(`reader:pos:${file.name}:${file.size}`));
      setResume(saved > 0 && saved < read.flatMap((p) => p.sentences).length ? saved : null);
    })().catch((err) => {
      console.error(err);
      toast({ variant: "destructive", title: "Couldn't open this PDF", description: "It may be damaged or password-protected. Try Repair PDF or Protect PDF first." });
    }).finally(() => alive && setLoading(0));
    return () => { alive = false; run.current++; stopCurrent.current(); doc?.destroy?.(); };
  }, [file, toast]);

  // Which page is on screen.
  useEffect(() => {
    if (!pages || view !== "pages") return;
    const io = new IntersectionObserver((entries) => {
      const best = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (best) setVisiblePage(Number((best.target as HTMLElement).dataset.page));
    }, { threshold: [0.25, 0.5, 0.75] });
    pageEls.current.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [pages, view, zoom]);

  const register = useCallback((n: number, el: HTMLElement | null) => { if (el) pageEls.current.set(n, el); else pageEls.current.delete(n); }, []);

  const goToPage = (n: number) => {
    const target = Math.min(Math.max(1, n), pages?.length ?? 1);
    if (view === "pages") pageEls.current.get(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    else document.getElementById(`text-page-${target}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Keep the sentence being read on screen.
  useEffect(() => {
    if (!current) return;
    if (key) store.set(key, String(index));
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(view === "pages" ? "[data-current]" : `[data-sentence="${current.id}"]`);
      if (!el) { if (view === "pages") pageEls.current.get(current.page)?.scrollIntoView({ block: "center" }); return; }
      const r = el.getBoundingClientRect();
      if (r.top < 90 || r.bottom > window.innerHeight - 170) el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [current, view, index, key]);

  const audioFor = useCallback((i: number) => {
    const s = sentences[i];
    const k = `${i}|${natural}|${rate}`;
    if (!prefetch.current.has(k)) {
      const p = synthesize(s.text, natural, rate);
      p.catch(() => prefetch.current.delete(k));
      prefetch.current.set(k, p);
    }
    return prefetch.current.get(k)!;
  }, [sentences, natural, rate]);

  /** Reads from sentence i onward until stopped or the end. */
  const playFrom = useCallback(async (start: number) => {
    const token = ++run.current;
    stopCurrent.current();
    setPlaying(true);
    const voice = voices.find((v) => v.voiceURI === voiceURI) ?? voices.find((v) => v.lang.toLowerCase().startsWith("en")) ?? null;
    for (let i = start; i < sentences.length; i++) {
      if (token !== run.current) return;
      setIndex(i);
      let handle: { done: Promise<"ended" | "stopped">; stop: () => void };
      if (engine === "natural") {
        try {
          const samples = await audioFor(i);
          if (i + 1 < sentences.length) void audioFor(i + 1).catch(() => {});
          if (token !== run.current) return;
          handle = playSamples(samples);
        } catch (err) {
          console.error(err);
          toast({ variant: "destructive", title: "The natural voice stopped", description: "Switched to the device voice." });
          setEngine("device");
          if (token === run.current) setPlaying(false);
          return;
        }
      } else handle = speakWithDevice(sentences[i].text, { rate, voice });
      stopCurrent.current = handle.stop;
      const how = await handle.done;
      if (how === "stopped" || token !== run.current) return;
    }
    if (token === run.current) setPlaying(false);
  }, [sentences, engine, rate, voices, voiceURI, audioFor, toast]);

  const pause = () => { run.current++; stopCurrent.current(); setPlaying(false); };
  const play = () => { unlockAudio(); void playFrom(index); };
  const jump = (i: number) => {
    const next = Math.min(Math.max(0, i), sentences.length - 1);
    if (playing) void playFrom(next); else setIndex(next);
  };

  // Changing voice or speed while reading restarts the current sentence with the new setting.
  const firstSettings = useRef(true);
  useEffect(() => {
    if (firstSettings.current) { firstSettings.current = false; return; }
    prefetch.current.clear();
    if (playing) void playFrom(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate, engine, voiceURI, natural]);

  useEffect(() => () => { run.current++; stopCurrent.current(); }, []);

  const startListening = (from?: number) => {
    unlockAudio();
    setListening(true);
    const startAt = from ?? (() => {
      // Start at the first sentence on the page in view.
      const i = sentences.findIndex((s) => s.page >= visiblePage);
      return i < 0 ? 0 : i;
    })();
    setIndex(startAt);
    if (engine === "device" || naturalState === "ready") void playFrom(startAt);
  };
  const stopListening = () => { pause(); setListening(false); };

  const chooseNatural = async () => {
    unlockAudio();
    setNaturalState("loading");
    try {
      await loadNaturalVoice((f) => setNaturalProgress(Math.round(f * 100)));
      setNaturalState("ready");
      setEngine("natural");
      if (listening) void playFrom(index);
    } catch (err) {
      console.error(err);
      setNaturalState("failed");
      setEngine("device");
      toast({ variant: "destructive", title: "The natural voice couldn't load", description: "Your device voice will be used instead." });
    }
  };

  // Tapping a sentence while listening reads from there.
  const tapPage = (page: ReadablePage, x: number, y: number) => {
    if (!listening) return;
    const hit = page.sentences.find((s) => s.boxes.some((b) => x >= b.x - 2 && x <= b.x + b.w + 2 && y >= b.y - 2 && y <= b.y + b.h + 2));
    if (hit) jump(hit.id);
  };

  const reset = () => {
    stopListening();
    vaultFiles.filter((vf) => vf.file === file).forEach((vf) => removeFile(vf.id));
    setFile(null); setPages(null); setPdf(null);
  };

  const noText = pages && sentences.length === 0;
  const pagesWithoutText = pages ? pages.filter((p) => !p.sentences.length).length : 0;
  const canSpeak = deviceSpeechSupported() || naturalState === "ready";

  return (
    <section className="min-h-[60vh] bg-background py-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <ToolHeader category="Read & listen" title="Read PDF" description="Open a PDF to read it here, or have it read aloud with each sentence highlighted as it's spoken. Everything stays on this device." />

        {!file ? (
          <div className="max-w-2xl rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
            <FileUpload accept=".pdf,application/pdf" maxSizeInMB={200} onFilesSelected={(f) => setFile(f[0] ?? null)}
              title="Choose a PDF to read" description="Drag & drop or click to browse" buttonText="Select PDF" icon={<BookOpen size={34} />} />
          </div>
        ) : (
          <div className={`mx-auto max-w-4xl ${listening ? "pb-48 sm:pb-36" : "pb-24"}`}>
            {/* Toolbar */}
            <div className="sticky top-16 z-20 -mx-4 mb-4 flex flex-wrap items-center gap-2 border-b border-border bg-background/95 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:bg-card/95">
              <span className="mr-auto min-w-0 basis-full sm:basis-auto">
                <span className="block truncate text-sm font-medium sm:max-w-xs">{file.name}</span>
                <span className="text-xs text-muted-foreground">{pages ? `${pages.length} page${pages.length === 1 ? "" : "s"} · ` : ""}{formatFileSize(file.size)}</span>
              </span>
              <div role="tablist" aria-label="View" className="flex rounded-lg bg-muted p-0.5">
                {([["pages", "Pages"], ["text", "Text"]] as const).map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}
                    className={`min-h-9 rounded-md px-3 text-sm font-semibold ${view === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>{label}</button>
                ))}
              </div>
              {view === "pages" && (
                <div className="hidden items-center sm:flex" aria-label="Zoom">
                  <button type="button" aria-label="Zoom out" disabled={zoom <= ZOOMS[0]} onClick={() => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)])} className="grid h-10 w-10 place-items-center rounded-md hover:bg-muted disabled:opacity-30"><Minus size={16} /></button>
                  <span className="w-11 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
                  <button type="button" aria-label="Zoom in" disabled={zoom >= ZOOMS[ZOOMS.length - 1]} onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)])} className="grid h-10 w-10 place-items-center rounded-md hover:bg-muted disabled:opacity-30"><Plus size={16} /></button>
                </div>
              )}
              {pages && pages.length > 1 && (
                <div className="flex items-center">
                  <button type="button" aria-label="Previous page" onClick={() => goToPage(visiblePage - 1)} className="grid h-10 w-9 place-items-center rounded-md hover:bg-muted"><ChevronLeft size={16} /></button>
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="sr-only">Go to page</span>
                    <input type="number" inputMode="numeric" min={1} max={pages.length} value={visiblePage} onChange={(e) => goToPage(Number(e.target.value))}
                      className="h-9 w-12 rounded-md border border-input bg-card px-1 text-center text-sm text-foreground" />
                    / {pages.length}
                  </label>
                  <button type="button" aria-label="Next page" onClick={() => goToPage(visiblePage + 1)} className="grid h-10 w-9 place-items-center rounded-md hover:bg-muted"><ChevronRight size={16} /></button>
                </div>
              )}
              <button type="button" onClick={reset} aria-label="Close this PDF" title="Close" className="grid h-10 w-10 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-brand"><X size={18} /></button>
            </div>

            {loading > 0 && <p className="mb-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Opening… {loading}%</p>}

            {noText && (
              <div className="mb-4 flex gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <p>You can read this PDF, but it has no text to read aloud, so it's probably a scan or photo. Run <Link href="/ocr-pdf" className="font-semibold underline">OCR PDF</Link> on it first, then open the result here.</p>
              </div>
            )}
            {!noText && pagesWithoutText > 0 && pages && (
              <p className="mb-3 text-xs text-muted-foreground">{pagesWithoutText} page{pagesWithoutText === 1 ? " has" : "s have"} no text (scans or pictures) and will be skipped when reading aloud.</p>
            )}
            {resume !== null && !listening && (
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-brand/40 bg-brand-tint p-3 text-sm">
                <span className="mr-auto">You stopped on page {sentences[resume]?.page}. Carry on from there?</span>
                <button type="button" className="min-h-10 rounded-md bg-brand px-3 font-semibold text-white" onClick={() => { startListening(resume); setResume(null); }}>Listen from there</button>
                <button type="button" className="min-h-10 px-2 font-semibold text-brand" onClick={() => { goToPage(sentences[resume]?.page ?? 1); setResume(null); }}>Just go there</button>
              </div>
            )}

            {pdf && pages && (view === "pages" ? (
              <div className={`space-y-4 ${zoom > 1 ? "overflow-x-auto" : ""}`}>
                {pages.map((p) => <PageView key={p.page} pdf={pdf} page={p} zoom={zoom} current={current} onTap={tapPage} register={register} />)}
              </div>
            ) : (
              <article className="rounded-xl border border-border bg-card px-5 py-6 text-[17px] leading-8 text-foreground sm:px-10 sm:text-lg">
                {pages.map((p) => (
                  <section key={p.page} id={`text-page-${p.page}`} className="scroll-mt-32">
                    <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-widest text-muted-foreground first:mt-0">Page {p.page}</p>
                    {p.sentences.length ? (
                      // Sentences grouped back into paragraphs and headings.
                      p.sentences.reduce<Sentence[][]>((groups, s) => { if (s.para || !groups.length) groups.push([s]); else groups[groups.length - 1].push(s); return groups; }, []).map((group) => (
                        <p key={group[0].id} className={`mb-4 ${group.length === 1 && group[0].text.length < 60 && !/[.!?]$/.test(group[0].text) ? "font-semibold" : ""}`}>
                          {group.map((s) => (
                            <span key={s.id} data-sentence={s.id} onClick={() => listening && jump(s.id)}
                              className={`rounded ${current?.id === s.id ? "bg-amber-200 text-amber-950 dark:bg-amber-700 dark:text-amber-50" : ""} ${listening ? "cursor-pointer hover:bg-muted" : ""}`}>
                              {s.text}{" "}
                            </span>
                          ))}
                        </p>
                      ))
                    ) : <p className="text-sm italic text-muted-foreground">No text on this page.</p>}
                  </section>
                ))}
              </article>
            ))}

            {/* Listen button / player */}
            {pages && !noText && (
              <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
                <div className="mx-auto max-w-4xl px-4 py-3">
                  {!listening ? (
                    <div className="flex items-center gap-3">
                      <button type="button" disabled={!canSpeak} onClick={() => startListening()}
                        className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-md bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50 sm:flex-none">
                        <Headphones size={18} /> Listen from page {visiblePage}
                      </button>
                      <p className="hidden text-xs text-muted-foreground sm:block">{canSpeak ? "Read aloud with each sentence highlighted. Tap a sentence to jump to it." : "This browser can't read aloud. Try Chrome, Edge or Safari."}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <button type="button" aria-label="Previous sentence" onClick={() => jump(index - 1)} disabled={index <= 0} className="grid h-12 w-12 place-items-center rounded-full hover:bg-muted disabled:opacity-30"><SkipBack size={20} /></button>
                        {engine === "natural" && naturalState !== "ready" ? (
                          <button type="button" onClick={chooseNatural} disabled={naturalState === "loading"} className="inline-flex h-12 items-center gap-2 rounded-full bg-brand px-4 text-sm font-semibold text-white disabled:opacity-70">
                            {naturalState === "loading" ? <><Loader2 size={18} className="animate-spin" /> Getting voice… {naturalProgress}%</> : <><Download size={18} /> Get natural voice (92 MB)</>}
                          </button>
                        ) : (
                          <button type="button" aria-label={playing ? "Pause" : "Play"} onClick={playing ? pause : play} className="grid h-14 w-14 place-items-center rounded-full bg-brand text-white shadow hover:bg-brand-dark">
                            {playing ? <Pause size={24} /> : <Play size={24} className="translate-x-0.5" />}
                          </button>
                        )}
                        <button type="button" aria-label="Next sentence" onClick={() => jump(index + 1)} disabled={index >= sentences.length - 1} className="grid h-12 w-12 place-items-center rounded-full hover:bg-muted disabled:opacity-30"><SkipForward size={20} /></button>
                        <div className="ml-1 min-w-0 flex-1">
                          <p className="truncate text-xs text-muted-foreground">Page {current?.page} · sentence {index + 1} of {sentences.length}</p>
                          <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-brand" style={{ width: `${((index + 1) / Math.max(1, sentences.length)) * 100}%` }} /></div>
                        </div>
                        <button type="button" aria-label="Stop listening" onClick={stopListening} className="grid h-11 w-11 place-items-center rounded-full hover:bg-muted"><X size={18} /></button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          Speed
                          <select value={rate} onChange={(e) => setRate(Number(e.target.value))} className="h-10 rounded-md border border-input bg-card px-2 text-sm text-foreground">
                            {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
                          </select>
                        </label>
                        <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground">
                          Voice
                          <select
                            value={engine === "natural" ? `natural:${natural}` : `device:${voiceURI}`}
                            onChange={(e) => {
                              const [kind, id] = [e.target.value.slice(0, e.target.value.indexOf(":")), e.target.value.slice(e.target.value.indexOf(":") + 1)];
                              if (kind === "natural") { setNatural(id); setEngine("natural"); if (playing && naturalState !== "ready") pause(); }
                              else { setVoiceURI(id); setEngine("device"); }
                            }}
                            className="h-10 min-w-0 flex-1 rounded-md border border-input bg-card px-2 text-sm text-foreground sm:max-w-xs">
                            <optgroup label="On this device (instant)">
                              <option value="device:">Default voice</option>
                              {voices.filter((v) => v.lang.toLowerCase().startsWith("en")).slice(0, 20).map((v) => <option key={v.voiceURI} value={`device:${v.voiceURI}`}>{v.name} ({v.lang})</option>)}
                            </optgroup>
                            <optgroup label={naturalState === "ready" ? "Natural voice" : "Natural voice (92 MB download, once)"}>
                              {NATURAL_VOICES.map((v) => <option key={v.id} value={`natural:${v.id}`}>{v.label}</option>)}
                            </optgroup>
                          </select>
                        </label>
                      </div>
                      {engine === "natural" && naturalState !== "ready" && (
                        <p className="text-xs text-muted-foreground">The natural voice sounds more human. It downloads once from PDFDock (best on Wi-Fi) and then works offline. It runs on this device, so older phones may pause between sentences.</p>
                      )}
                      {naturalState === "failed" && engine === "device" && <p className="text-xs text-destructive">The natural voice couldn't load on this device. Using the device voice.</p>}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        {file && !pages && !loading && (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><FileText size={16} /> Couldn't read this file. <button type="button" className="font-semibold text-brand underline" onClick={reset}>Choose another</button></p>
        )}
      </div>
    </section>
  );
};

export default ReadPdf;
