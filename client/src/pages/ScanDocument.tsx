import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, Camera, Check, Crop, FileCheck2, Flashlight, FlashlightOff, ImagePlus, Loader2, Maximize, Pencil,
  RotateCw, ScanLine, Trash2, X, Wand2,
} from "lucide-react";
import ToolHeader from "@/components/ToolHeader";
import SaveShareButtons from "@/components/SaveShareButtons";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  FILTERS, applyFilter, canvasToBlob, detectDocument, fileToCanvas, fullQuad, loadOpenCv, rotateCanvas, warpDocument,
  type Quad, type ScanFilter,
} from "@/lib/scanner";
import { PAGE_SIZES, buildScanPdf, defaultScanName, type PageSize } from "@/lib/scanExport";

import { readScanDraft, writeScanDraft, type ScanDraft, type ScanPage } from "@/lib/scanDraft";
import { decodeImagePages, IMAGE_ACCEPT, IMAGE_LIMITS } from "@/lib/addons/images";

type Step = "pages" | "camera" | "adjust" | "done";

let idSeq = 0;
const pid = () => `s${Date.now().toString(36)}${(idSeq++).toString(36)}`;

/* ------------------------------------------------------------------ */
/* Camera                                                              */
/* ------------------------------------------------------------------ */

const CameraView = ({
  cv, count, lastThumb, onCapture, onImport, onClose,
}: {
  cv: any;
  count: number;
  lastThumb?: string;
  onCapture: (canvas: HTMLCanvasElement, quad: Quad | null) => void;
  onImport: () => void;
  onClose: () => void;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [error, setError] = useState<string | null>(null);
  const [torch, setTorch] = useState<boolean | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let stopped = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } },
        });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        setDims({ w: v.videoWidth, h: v.videoHeight });
        const caps: any = stream.getVideoTracks()[0].getCapabilities?.() ?? {};
        if (caps.torch) setTorch(false);
      } catch (err: any) {
        setError(
          err?.name === "NotAllowedError"
            ? "Camera access was blocked. Allow the camera for this site in your browser settings, or choose photos instead."
            : "No camera is available here. Choose photos instead."
        );
      }
    })();
    return () => {
      stopped = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Live outline: detect the page a few times a second on a small frame.
  useEffect(() => {
    if (!dims.w) return;
    let timer = 0;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const v = videoRef.current;
      if (v && v.readyState >= 2) {
        try {
          setQuad(detectDocument(cv, v, 360));
        } catch {
          /* skip a frame */
        }
      }
      timer = window.setTimeout(tick, 220);
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [cv, dims.w]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as any] });
      setTorch(!torch);
    } catch {
      setTorch(null);
    }
  };

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    setFlash(true);
    setTimeout(() => setFlash(false), 140);
    let q: Quad | null = null;
    try {
      q = detectDocument(cv, c, 720);
    } catch {
      q = null;
    }
    onCapture(c, q);
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white" style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <div className="flex items-center justify-between px-4 py-3">
        <button type="button" onClick={onClose} aria-label="Close camera" className="grid h-10 w-10 place-items-center rounded-full bg-white/10"><X size={20} /></button>
        <span className="text-sm text-white/80">{quad ? "Page found. Hold steady" : "Point at a document"}</span>
        {torch !== null ? (
          <button type="button" onClick={toggleTorch} aria-label={torch ? "Turn light off" : "Turn light on"} className="grid h-10 w-10 place-items-center rounded-full bg-white/10">
            {torch ? <Flashlight size={18} /> : <FlashlightOff size={18} />}
          </button>
        ) : <span className="w-10" />}
      </div>

      <div className="relative flex-1 overflow-hidden">
        {error ? (
          <div className="grid h-full place-items-center p-8 text-center text-sm text-white/80">{error}</div>
        ) : (
          <>
            <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-contain" />
            {dims.w > 0 && (
              <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${dims.w} ${dims.h}`} preserveAspectRatio="xMidYMid meet">
                {quad && (
                  <polygon
                    points={quad.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="rgba(68,171,76,0.22)"
                    stroke="#44AB4C"
                    strokeWidth={Math.max(dims.w, dims.h) / 220}
                    strokeLinejoin="round"
                  />
                )}
              </svg>
            )}
            {flash && <div className="absolute inset-0 bg-white/70" />}
          </>
        )}
      </div>

      <div className="grid grid-cols-3 items-center px-6 py-5">
        <button type="button" onClick={onImport} aria-label="Choose photos instead" className="justify-self-start grid h-12 w-12 place-items-center rounded-full bg-white/10">
          <ImagePlus size={20} />
        </button>
        <button
          type="button"
          onClick={capture}
          disabled={Boolean(error)}
          aria-label="Take photo"
          className="justify-self-center grid h-[72px] w-[72px] place-items-center rounded-full border-4 border-white disabled:opacity-40"
        >
          <span className="h-14 w-14 rounded-full bg-white" />
        </button>
        <button type="button" onClick={onClose} className="relative justify-self-end h-12 w-12 overflow-hidden rounded-md border-2 border-white/70 bg-white/10" aria-label={`Done, ${count} page${count === 1 ? "" : "s"}`}>
          {lastThumb ? <img src={lastThumb} alt="" className="h-full w-full object-cover" /> : <Check size={20} className="mx-auto" />}
          {count > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-brand-logo px-1 text-[11px] font-bold text-black">{count}</span>}
        </button>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Corner editor                                                       */
/* ------------------------------------------------------------------ */

const CornerEditor = ({
  cv, page, onSave, onCancel, saveLabel, busy,
}: {
  cv: any;
  page: ScanPage;
  onSave: (quad: Quad, filter: ScanFilter, rotation: number) => void;
  onCancel: () => void;
  saveLabel: string;
  busy: boolean;
}) => {
  const [url] = useState(() => URL.createObjectURL(page.photo));
  const [quad, setQuad] = useState<Quad>(page.quad);
  const [filter, setFilter] = useState<ScanFilter>(page.filter);
  const [rotation, setRotation] = useState(page.rotation);
  const [active, setActive] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const W = page.photoW;
  const H = page.photoH;
  const handleR = Math.max(W, H) / 38;

  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const toImage = (e: React.PointerEvent) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: Math.min(W, Math.max(0, p.x)), y: Math.min(H, Math.max(0, p.y)) };
  };

  const onMove = (e: React.PointerEvent) => {
    if (active === null) return;
    const p = toImage(e);
    setQuad((q) => q.map((c, i) => (i === active ? p : c)) as Quad);
  };

  const redetect = async () => {
    const canvas = await fileToCanvas(page.photo);
    const q = detectDocument(cv, canvas, 720);
    setQuad(q ?? fullQuad(W, H, 0.03));
  };

  const loupe = active !== null ? quad[active] : null;
  // Magnifier: 3x zoom of the photo, centred on the corner being dragged.
  const shownW = boxRef.current?.clientWidth ?? 0;
  const zoomW = shownW * 3;
  const zoomH = zoomW * (H / W);

  return (
    <fieldset disabled={busy} className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Crop size={16} className="text-brand" /> Adjust the corners</h2>
        <div className="flex gap-2">
          <button type="button" onClick={redetect} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:border-brand hover:text-brand"><Wand2 size={15} /> Auto</button>
          <button type="button" onClick={() => setQuad(fullQuad(W, H))} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:border-brand hover:text-brand"><Maximize size={15} /> Whole photo</button>
        </div>
      </div>

      <div ref={boxRef} className="relative mx-auto w-full" style={{ maxWidth: `min(100%, calc(62vh * ${W / H}))` }}>
        <img src={url} alt="Captured page" className="block w-full select-none rounded-md" draggable={false} />
        <svg
          ref={svgRef}
          className="absolute inset-0 h-full w-full touch-none"
          viewBox={`0 0 ${W} ${H}`}
          onPointerMove={onMove}
          onPointerUp={() => setActive(null)}
          onPointerCancel={() => setActive(null)}
        >
          <defs>
            <mask id="outside">
              <rect width={W} height={H} fill="white" />
              <polygon points={quad.map((p) => `${p.x},${p.y}`).join(" ")} fill="black" />
            </mask>
          </defs>
          <rect width={W} height={H} fill="rgba(0,0,0,0.45)" mask="url(#outside)" />
          <polygon points={quad.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#44AB4C" strokeWidth={handleR / 4} strokeLinejoin="round" />
          {quad.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={handleR}
              fill={active === i ? "#44AB4C" : "rgba(255,255,255,0.9)"}
              stroke="#2B7D35"
              strokeWidth={handleR / 4}
              style={{ cursor: "grab" }}
              onPointerDown={(e) => {
                e.preventDefault();
                (e.target as Element).setPointerCapture?.(e.pointerId);
                setActive(i);
              }}
              tabIndex={0}
              onKeyDown={(e) => {
                const delta = e.shiftKey ? 10 : 1;
                const shifts: Record<string, [number, number]> = { ArrowLeft: [-delta, 0], ArrowRight: [delta, 0], ArrowUp: [0, -delta], ArrowDown: [0, delta] };
                if (!shifts[e.key]) return;
                e.preventDefault();
                const [dx, dy] = shifts[e.key];
                setQuad(q => q.map((point, j) => j === i ? { x: Math.max(0, Math.min(W, point.x + dx)), y: Math.max(0, Math.min(H, point.y + dy)) } : point) as Quad);
              }}
              role="button"
              aria-describedby="crop-keyboard-help"
              aria-label={["Top left corner", "Top right corner", "Bottom right corner", "Bottom left corner"][i]}
            />
          ))}
        </svg>
        {loupe && (
          <div
            aria-hidden
            className="pointer-events-none absolute h-28 w-28 rounded-full border-4 border-white shadow-xl"
            style={{
              left: `calc(${(loupe.x / W) * 100}% - 56px)`,
              top: `calc(${(loupe.y / H) * 100}% - 150px)`,
              backgroundImage: `url(${url})`,
              backgroundRepeat: "no-repeat",
              backgroundSize: `${zoomW}px ${zoomH}px`,
              backgroundPosition: `${56 - (loupe.x / W) * zoomW}px ${56 - (loupe.y / H) * zoomH}px`,
            }}
          >
            <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-brand-logo" />
          </div>
        )}
      </div>

      <p id="crop-keyboard-help" className="mt-3 text-sm text-muted-foreground">Drag a corner, or focus it and use the arrow keys. Hold Shift for larger steps.</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Look</span>
        {FILTERS.map((f) => (
          <button key={f.id} type="button" onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}
            className={`h-9 rounded-full border px-4 text-sm font-medium ${filter === f.id ? "border-brand bg-brand text-white" : "border-border text-foreground hover:border-brand"}`}>
            {f.label}
          </button>
        ))}
        <button type="button" onClick={() => setRotation((r) => (r + 90) % 360)} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:border-brand hover:text-brand">
          <RotateCw size={15} /> Rotate{rotation ? ` (${rotation}°)` : ""}
        </button>
      </div>

      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="h-11 rounded-md border border-border px-5 text-sm font-semibold hover:bg-muted">Discard</button>
        <button type="button" onClick={() => onSave(quad, filter, rotation)} className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark">
          <Check size={16} /> {saveLabel}
        </button>
      </div>
    </fieldset>
  );
};

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

const ScanDocument = () => {
  const { toast } = useToast();
  const [cv, setCv] = useState<any>(null);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [step, setStep] = useState<Step>("pages");
  const [editing, setEditing] = useState<{ page: ScanPage; isNew: boolean; fromCamera: boolean } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [name, setName] = useState(defaultScanName());
  const [pageSize, setPageSize] = useState<PageSize>("a4");
  const [searchable, setSearchable] = useState(true);
  const [building, setBuilding] = useState<{ done: number; total: number; stage: string } | null>(null);
  const [result, setResult] = useState<File | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [pendingDraft, setPendingDraft] = useState<ScanDraft | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [draftStatus, setDraftStatus] = useState("Checking for a saved draft…");
  const [importError, setImportError] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState("");
  const pageUrls = useRef(new Set<string>());

  useEffect(() => {
    let alive = true;
    readScanDraft().then(draft => {
      if (!alive) return;
      setPendingDraft(draft);
      setDraftReady(!draft);
      setDraftStatus(draft ? "A previous scan is available on this device." : "Drafts are saved on this device for 24 hours. Clear the draft when you finish, especially on a shared device.");
    }).catch(() => { if (alive) { setDraftReady(true); setDraftStatus("Draft recovery is unavailable in this browser. Save your PDF before leaving this page."); } });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    let alive = true;
    const hasWork = pages.length > 0 || Boolean(editing);
    setDraftStatus(hasWork ? "Saving draft on this device…" : "Drafts are saved on this device for 24 hours. Clear the draft when you finish, especially on a shared device.");
    writeScanDraft(hasWork ? { version: 1, savedAt: Date.now(), pages, editing, name, pageSize, searchable } : null)
      .then(() => { if (alive && hasWork) setDraftStatus("Draft saved on this device for 24 hours. Clear the draft when you finish, especially on a shared device."); })
      .catch(() => { if (alive) setDraftStatus("Draft could not be saved. Device storage may be full or blocked. Save your PDF before leaving this page."); });
    return () => { alive = false; };
  }, [pages, editing, name, pageSize, searchable, draftReady]);

  const restoreDraft = () => {
    if (!pendingDraft) return;
    setPages(pendingDraft.pages.map(p => ({ ...p, resultUrl: p.result ? URL.createObjectURL(p.result) : undefined })));
    setEditing(pendingDraft.editing);
    setStep(pendingDraft.editing ? "adjust" : "pages");
    setName(pendingDraft.name); setPageSize(pendingDraft.pageSize); setSearchable(pendingDraft.searchable);
    setPendingDraft(null); setDraftReady(true);
  };
  const hasCamera = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && window.isSecureContext;

  useEffect(() => {
    loadOpenCv().then(setCv).catch((e) => setEngineError(e.message));
  }, []);

  useEffect(() => {
    const next = new Set(pages.flatMap(p => p.resultUrl ? [p.resultUrl] : []));
    pageUrls.current.forEach(url => { if (!next.has(url)) URL.revokeObjectURL(url); });
    pageUrls.current = next;
  }, [pages]);
  useEffect(() => () => pageUrls.current.forEach(url => URL.revokeObjectURL(url)), []);

  const render = useCallback(async (p: ScanPage): Promise<ScanPage> => {
    const photo = await fileToCanvas(p.photo);
    const flat = warpDocument(cv, photo, p.quad);
    const filtered = applyFilter(cv, flat, p.filter);
    const final = rotateCanvas(filtered, p.rotation);
    const blob = p.filter === "bw" ? await canvasToBlob(final, "image/png") : await canvasToBlob(final, "image/jpeg", 0.85);

    return { ...p, result: blob, resultUrl: URL.createObjectURL(blob), resultW: final.width, resultH: final.height };
  }, [cv]);

  const startEdit = async (canvas: HTMLCanvasElement, quad: Quad | null, fromCamera: boolean) => {
    const photo = await canvasToBlob(canvas, "image/jpeg", 0.92);
    const lastFilter = pages[pages.length - 1]?.filter ?? "enhanced";
    const page: ScanPage = {
      id: pid(), photo, photoW: canvas.width, photoH: canvas.height,
      quad: quad ?? fullQuad(canvas.width, canvas.height, 0.03), filter: lastFilter, rotation: 0,
    };
    setEditing({ page, isNew: true, fromCamera });
    setStep("adjust");
  };

  const importPhotos = async (files: File[]) => {
    if (!files.length || !cv || processing || !draftReady) return;
    setProcessing(true); setImportError(null);
    const added: ScanPage[] = [];
    try {
      const decoded = await decodeImagePages(files, setImportStatus);
      const existingPixels = pages.reduce((sum, p) => sum + p.photoW * p.photoH, 0);
      const canvases = [];
      let pixels = existingPixels;
      try {
        for (const file of decoded) {
          const canvas = await fileToCanvas(file);
          canvases.push(canvas);
          pixels += canvas.width * canvas.height;
        }
        if (pages.length + canvases.length > 30 || pixels > IMAGE_LIMITS.totalPixels)
          throw new Error("Keep each scan to 30 pages and 80 megapixels. Save this PDF, then start another scan.");
        if (canvases.length === 1) {
          await startEdit(canvases[0], detectDocument(cv, canvases[0], 720), false);
        } else {
          for (const canvas of canvases) {
            const photo = await canvasToBlob(canvas, "image/jpeg", 0.92);
            const q = detectDocument(cv, canvas, 720) ?? fullQuad(canvas.width, canvas.height, 0.02);
            added.push(await render({ id: pid(), photo, photoW: canvas.width, photoH: canvas.height, quad: q, filter: "enhanced", rotation: 0 }));
          }
          setPages(p => [...p, ...added]); setStep("pages");
        }
        setResult(null);
      } finally { canvases.forEach(c => { c.width = c.height = 0; }); }
    } catch (err) {
      added.forEach(p => p.resultUrl && URL.revokeObjectURL(p.resultUrl));
      setImportError(err instanceof Error ? err.message : "Could not read this photo. Choose a JPG or PNG copy and try again.");
    } finally { setProcessing(false); setImportStatus(""); }
  };

  const saveEdit = async (quad: Quad, filter: ScanFilter, rotation: number) => {
    if (!editing) return;
    setProcessing(true);
    try {
      const done = await render({ ...editing.page, quad, filter, rotation });
      setPages((prev) => (editing.isNew ? [...prev, done] : prev.map((p) => (p.id === done.id ? done : p))));
      setResult(null);
      setStep(editing.isNew && editing.fromCamera ? "camera" : "pages");
      setEditing(null);
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Couldn't process this page", description: "Try adjusting the corners again." });
    } finally {
      setProcessing(false);
    }
  };

  const movePage = (i: number, d: number) => {
    setResult(null);
    setPages((prev) => {
      const j = i + d;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const setAllFilters = async (filter: ScanFilter) => {
    setProcessing(true);
    try {
      const next: ScanPage[] = [];
      for (const p of pages) next.push(p.filter === filter ? p : await render({ ...p, filter }));
      setPages(next);
      setResult(null);
    } catch {
      toast({ variant: "destructive", title: "Could not apply this look", description: "Your pages are unchanged. Try editing one page at a time." });
    } finally {
      setProcessing(false);
    }
  };

  const build = async () => {
    setResult(null);
    setBuilding({ done: 0, total: pages.length, stage: "Preparing" });
    try {
      const file = await buildScanPdf(
        pages.map((p) => ({ blob: p.result!, width: p.resultW!, height: p.resultH! })),
        { pageSize, searchable, name, onProgress: (done, total, stage) => setBuilding({ done, total, stage }) }
      );
      setResult(file);
      setStep("done");
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Couldn't create the PDF", description: err instanceof Error ? err.message : "Try again." });
    } finally {
      setBuilding(null);
    }
  };

  const reset = () => {
    setEditing(null);
    setPages([]);
    setResult(null);
    setName(defaultScanName());
    setStep("pages");
  };

  const importInput = (
    <input
      ref={importRef}
      type="file"
      accept={IMAGE_ACCEPT}
      multiple
      className="hidden"
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = "";
        importPhotos(files);
      }}
    />
  );

  if (step === "camera" && cv) {
    return (
      <>
        {importInput}
        <CameraView
          cv={cv}
          count={pages.length}
          lastThumb={pages[pages.length - 1]?.resultUrl}
          onCapture={(c, q) => startEdit(c, q, true)}
          onImport={() => importRef.current?.click()}
          onClose={() => setStep("pages")}
        />
      </>
    );
  }

  return (
    <section className="min-h-[60vh] bg-background py-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {importInput}
        <ToolHeader
          category="Scan & convert"
          title="Scan document"
          description="Scan letters, receipts and forms with your phone camera. Pages are straightened and cleaned up automatically, then saved as one PDF you can keep or share."
        />

        <p role="status" className="mb-4 max-w-3xl text-sm text-muted-foreground">{draftStatus}</p>
        {pendingDraft && <div className="mb-5 max-w-3xl rounded-xl border border-border bg-card p-4">
          <p className="font-semibold">Continue your previous scan?</p>
          <p className="mt-1 text-sm text-muted-foreground">{pendingDraft.pages.length} saved pages{pendingDraft.editing ? " and a page being edited" : ""}. This draft is stored only in this browser.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={restoreDraft} className="min-h-11 rounded-md bg-brand px-4 font-semibold text-white">Restore scan</button>
            <button type="button" onClick={() => { setPendingDraft(null); setDraftReady(true); }} className="min-h-11 rounded-md border border-border px-4">Discard saved draft</button>
          </div>
        </div>}
        {importError && <p role="alert" className="mb-4 max-w-3xl rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{importError}</p>}
        {engineError && (
          <div role="alert" className="mb-4 max-w-3xl rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{engineError}<button type="button" onClick={() => { setEngineError(null); loadOpenCv().then(setCv).catch(e => setEngineError(e.message)); }} className="ml-3 min-h-11 font-semibold underline">Retry scanner</button></div>
        )}

        {step === "adjust" && editing && cv ? (
          <div className="max-w-3xl">
            <CornerEditor
              busy={processing}
              cv={cv}
              page={editing.page}
              saveLabel={editing.isNew ? (editing.fromCamera ? "Keep and scan next" : "Add page") : "Save changes"}
              onSave={saveEdit}
              onCancel={() => { setStep(editing.isNew && editing.fromCamera ? "camera" : "pages"); setEditing(null); }}
            />
            {processing && <p role="status" className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin" /> Straightening and cleaning up…</p>}
          </div>
        ) : (
          <fieldset disabled={Boolean(building) || processing || !draftReady} className="min-w-0 max-w-5xl space-y-4">
            {pages.length === 0 ? (
              <div className="rounded-xl border border-border bg-card p-8 text-center shadow-sm">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-tint text-brand"><ScanLine size={28} /></span>
                <h2 className="mt-4 text-lg font-semibold text-foreground">Scan your first page</h2>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  Lay the paper on a darker, flat surface in good light. The app finds the edges for you.
                </p>
                <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
                  {hasCamera && (
                    <button type="button" disabled={!cv} onClick={() => setStep("camera")}
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-brand px-6 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
                      {cv ? <Camera size={18} /> : <Loader2 size={18} className="animate-spin" />} {cv ? "Open camera" : "Loading scanner…"}
                    </button>
                  )}
                  <button type="button" disabled={!cv} onClick={() => importRef.current?.click()}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-brand px-6 text-sm font-semibold text-brand hover:bg-brand-tint disabled:opacity-60">
                    <ImagePlus size={18} /> Choose photos
                  </button>
                </div>
                {processing && <p role="status" className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin" /> {importStatus || "Processing photos…"}</p>}
                {!hasCamera && <p className="mt-4 text-xs text-muted-foreground">Live camera needs the secure (https) address on a phone or a computer with a camera. You can still use photos.</p>}
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-foreground">{pages.length} page{pages.length === 1 ? "" : "s"}</h2>
                    <div className="flex flex-wrap gap-2">
                      {hasCamera && (
                        <button type="button" onClick={() => setStep("camera")} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:border-brand hover:text-brand">
                          <Camera size={15} /> Scan more
                        </button>
                      )}
                      <button type="button" onClick={() => importRef.current?.click()} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:border-brand hover:text-brand">
                        <ImagePlus size={15} /> Add photos
                      </button>
                    </div>
                  </div>

                  <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {pages.map((p, i) => (
                      <li key={p.id} className="rounded-lg border border-border bg-background p-2">
                        <div className="grid aspect-[3/4] place-items-center overflow-hidden rounded bg-muted">
                          {p.resultUrl && <img src={p.resultUrl} alt={`Page ${i + 1}`} className="max-h-full max-w-full shadow-sm" />}
                        </div>
                        <div className="mt-1.5 flex items-center justify-between">
                          <button type="button" aria-label="Move earlier" disabled={i === 0} onClick={() => movePage(i, -1)} className="grid h-8 w-8 place-items-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowLeft size={15} /></button>
                          <span className="text-xs font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                          <button type="button" aria-label="Move later" disabled={i === pages.length - 1} onClick={() => movePage(i, 1)} className="grid h-8 w-8 place-items-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowRight size={15} /></button>
                        </div>
                        <div className="flex items-center justify-center gap-1">
                          <button type="button" aria-label={`Edit page ${i + 1}`} onClick={() => { setEditing({ page: p, isNew: false, fromCamera: false }); setStep("adjust"); }} className="grid h-8 w-8 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-brand"><Pencil size={15} /></button>
                          <button type="button" aria-label={`Delete page ${i + 1}`} onClick={() => { setPages((all) => all.filter((x) => x.id !== p.id)); setResult(null); }} className="grid h-8 w-8 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 size={15} /></button>
                        </div>
                      </li>
                    ))}
                  </ol>

                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                    <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Look for all pages</span>
                    {FILTERS.map((f) => (
                      <button key={f.id} type="button" disabled={processing} onClick={() => setAllFilters(f.id)}
                        className={`h-8 rounded-full border px-3 text-xs font-medium ${pages.every((p) => p.filter === f.id) ? "border-brand bg-brand text-white" : "border-border hover:border-brand"}`}>
                        {f.label}
                      </button>
                    ))}
                    {processing && <Loader2 size={15} className="animate-spin text-muted-foreground" />}
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
                  <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <div>
                      <label htmlFor="scan-name" className="text-sm font-semibold text-foreground">File name</label>
                      <input id="scan-name" value={name} onChange={(e) => { setName(e.target.value); setResult(null); }}
                        className="mt-1.5 h-11 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" />
                    </div>
                    <fieldset>
                      <legend className="text-sm font-semibold text-foreground">Page size</legend>
                      <div className="mt-1.5 flex gap-1 rounded-md border border-border p-1">
                        {PAGE_SIZES.map((s) => (
                          <button key={s.id} type="button" onClick={() => { setPageSize(s.id); setResult(null); }} aria-pressed={pageSize === s.id}
                            className={`h-9 rounded px-3 text-sm ${pageSize === s.id ? "bg-brand text-white" : "text-foreground hover:bg-muted"}`}>
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  </div>
                  <label htmlFor="searchable" className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm">
                    <Checkbox id="searchable" className="mt-0.5" checked={searchable} onCheckedChange={(c) => { setSearchable(c === true); setResult(null); }} />
                    <span><span className="text-foreground">Make text searchable</span><span className="block text-xs text-muted-foreground">Reads the text so you can search and copy it later. Adds a few seconds per page.</span></span>
                  </label>

                  {building && (
                    <div className="mt-4">
                      <div role="status" className="mb-1 flex justify-between text-xs text-muted-foreground"><span>{building.stage}…</span><span className="tabular-nums">{building.done} / {building.total}</span></div>
                      <Progress value={(building.done / Math.max(1, building.total)) * 100} className="h-1.5" />
                    </div>
                  )}

                  {result ? (
                    <div className="mt-4 rounded-lg border border-brand/40 bg-brand-tint p-4">
                      <p role="status" className="flex items-center gap-2 text-sm font-semibold text-foreground"><FileCheck2 size={17} className="text-brand" /> {result.name} is ready</p>
                      <SaveShareButtons file={result} className="mt-3" />
                    </div>
                  ) : (
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <button type="button" onClick={build} disabled={Boolean(building) || processing || !pages.length}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-brand px-6 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
                        {building ? <Loader2 size={16} className="animate-spin" /> : <FileCheck2 size={16} />} Create PDF
                      </button>
                    </div>
                  )}
                  <button type="button" onClick={reset} className="mt-3 text-sm font-medium text-muted-foreground hover:text-destructive">Clear draft and start a new scan</button>
                </div>
              </>
            )}
          </fieldset>
        )}
      </div>
    </section>
  );
};

export default ScanDocument;
