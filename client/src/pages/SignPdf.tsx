import { useState, useRef, useCallback, useEffect } from "react";
import RectangleControls, { fitRectangle } from "@/components/RectangleControls";
import { imageCanvas } from "@/lib/addons/images";
import FileUpload from "@/components/FileUpload";
import BackToTools from "@/components/BackToTools";
import { FileText, Download, PenLine, Trash2, Plus, X, Undo2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useFileVault } from "@/context/FileVault";
import { downloadFile } from "@/lib/fileUtils";
import { loadPdfDocument, renderPdfPageToCanvas } from "@/lib/pdfjs";
import { signPdf, type SignaturePlacement } from "@/lib/pdfUtils";
import SignatureCheck from "@/components/SignatureCheck";

interface PlacedSignature extends SignaturePlacement {
  id: string;
}

const SignaturePad = ({
  onSave,
}: {
  onSave: (dataUrl: string, aspect: number) => void;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const strokes = useRef<{ x: number; y: number }[][]>([]);
  const [penWidth, setPenWidth] = useState(3);
  const [penColor, setPenColor] = useState("#10213f");
  const [isEmpty, setIsEmpty] = useState(true);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penWidth * (canvas.width / canvas.clientWidth || 1);
    for (const stroke of strokes.current) {
      if (stroke.length < 2) {
        if (stroke.length === 1) {
          ctx.beginPath();
          ctx.arc(stroke[0].x, stroke[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
          ctx.fillStyle = penColor;
          ctx.fill();
        }
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x, stroke[i].y);
      ctx.stroke();
    }
  }, [penColor, penWidth]);

  // Size the backing store to the element (handles mobile + resize)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      redraw();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [redraw]);

  useEffect(() => { redraw(); }, [redraw]);

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawing.current = true;
    strokes.current.push([pointFromEvent(e)]);
    setIsEmpty(false);
    redraw();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    strokes.current[strokes.current.length - 1].push(pointFromEvent(e));
    redraw();
  };

  const stop = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    canvasRef.current?.releasePointerCapture(e.pointerId);
  };

  const clear = () => {
    strokes.current = [];
    setIsEmpty(true);
    redraw();
  };

  const undo = () => {
    strokes.current.pop();
    setIsEmpty(strokes.current.length === 0);
    redraw();
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas || isEmpty) return;

    // Trim to the ink bounding box so the stamp has no dead space
    const ctx = canvas.getContext("2d")!;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        if (data[(y * canvas.width + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX <= minX || maxY <= minY) return;
    const pad = 6;
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(canvas.width - 1, maxX + pad); maxY = Math.min(canvas.height - 1, maxY + pad);

    const out = document.createElement("canvas");
    out.width = maxX - minX + 1;
    out.height = maxY - minY + 1;
    out.getContext("2d")!.drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
    onSave(out.toDataURL("image/png"), out.width / out.height);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        aria-label="Draw a signature with a mouse, pen or touch. You can also choose a signature image below."
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        className="w-full h-40 sm:h-48 bg-card border-2 border-dashed border-border rounded-lg touch-none cursor-crosshair"
      />
      <div className="flex flex-wrap items-center gap-3 mt-3">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Pen</Label>
          <div className="w-24">
            <Slider value={[penWidth]} min={1} max={8} step={1} onValueChange={(v) => setPenWidth(v[0])} />
          </div>
        </div>
        <input
          type="color"
          value={penColor}
          onChange={(e) => setPenColor(e.target.value)}
          aria-label="Pen colour"
          className="h-8 w-10 rounded-md border border-border bg-card p-1 cursor-pointer"
        />
        <Button variant="outline" size="sm" onClick={undo} disabled={isEmpty} className="rounded-lg border-border text-xs">
          <Undo2 size={12} className="mr-1" /> Undo
        </Button>
        <Button variant="outline" size="sm" onClick={clear} disabled={isEmpty} className="rounded-lg border-border text-xs">
          <Trash2 size={12} className="mr-1" /> Clear
        </Button>
        <Button size="sm" onClick={save} disabled={isEmpty} className="rounded-lg bg-brand hover:bg-brand-dark text-xs font-semibold ml-auto">
          <Plus size={12} className="mr-1" /> Use signature
        </Button>
      </div>
    </div>
  );
};

const SignPdf = () => {
  const { toast } = useToast();
  const { files: vaultFiles, removeFile: removeVaultFile } = useFileVault();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [signature, setSignature] = useState<{ dataUrl: string; aspect: number } | null>(null);
  const [placements, setPlacements] = useState<PlacedSignature[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState({ done: 0, total: 0 });
  const [isSaving, setIsSaving] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ id: string; mode: "move" | "resize"; offsetX: number; offsetY: number } | null>(null);

  const handlePdfSelected = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setIsLoading(true);
    setLoadProgress({ done: 0, total: 0 });
    try {
      const pdf = await loadPdfDocument(file);
      const images: string[] = [];
      const maxPages = Math.min(pdf.numPages, 30);
      setLoadProgress({ done: 0, total: maxPages });
      for (let i = 1; i <= maxPages; i++) {
        const canvas = await renderPdfPageToCanvas(pdf, i, 1.5);
        images.push(canvas.toDataURL("image/jpeg", 0.85));
        setLoadProgress({ done: i, total: maxPages });
      }
      await pdf.destroy();
      setPdfFile(file);
      setPageImages(images);
      setCurrentPage(1);
      setPlacements([]);
      if (pdf.numPages > maxPages) {
        toast({ title: "Large document", description: `Showing the first ${maxPages} pages for signing.` });
      }
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Could not open PDF", description: "The file may be corrupted or password protected." });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const reset = () => {
    // Also drop this file from the shared workspace vault — otherwise a
    // fresh FileUpload silently re-adopts the file we just finished with.
    vaultFiles.filter(vf => vf.file === pdfFile).forEach(vf => removeVaultFile(vf.id));
    setPdfFile(null);
    setPageImages([]);
    setPlacements([]);
    setSignature(null);
    setCurrentPage(1);
  };

  const addPlacement = useCallback(() => {
    if (!signature) return;
    const widthRatio = 0.28;
    const box = pageRef.current?.getBoundingClientRect();
    const pageAspect = box ? box.width / box.height : 0.707;
    const heightRatio = (widthRatio / signature.aspect) * pageAspect;
    setPlacements((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        pageNumber: currentPage,
        xRatio: 0.6,
        yRatio: 0.78,
        widthRatio,
        heightRatio,
        dataUrl: signature.dataUrl,
      },
    ]);
  }, [signature, currentPage]);

  const onPointerDownBox = (e: React.PointerEvent, id: string, mode: "move" | "resize") => {
    e.preventDefault();
    e.stopPropagation();
    const box = pageRef.current!.getBoundingClientRect();
    const placement = placements.find((p) => p.id === id)!;
    dragState.current = {
      id,
      mode,
      offsetX: (e.clientX - box.left) / box.width - placement.xRatio,
      offsetY: (e.clientY - box.top) / box.height - placement.yRatio,
    };
    setActiveId(id);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMovePage = (e: React.PointerEvent) => {
    const state = dragState.current;
    if (!state || !pageRef.current) return;
    const box = pageRef.current.getBoundingClientRect();
    const px = (e.clientX - box.left) / box.width;
    const py = (e.clientY - box.top) / box.height;

    setPlacements((prev) =>
      prev.map((p) => {
        if (p.id !== state.id) return p;
        if (state.mode === "move") {
          return {
            ...p,
            xRatio: Math.min(Math.max(px - state.offsetX, 0), 1 - p.widthRatio),
            yRatio: Math.min(Math.max(py - state.offsetY, 0), 1 - p.heightRatio),
          };
        }
        const newWidth = Math.min(Math.max(px - p.xRatio, 0.05), 1 - p.xRatio);
        const scale = newWidth / p.widthRatio;
        const newHeight = Math.min(p.heightRatio * scale, 1 - p.yRatio);
        return { ...p, widthRatio: newWidth, heightRatio: newHeight };
      })
    );
  };

  const endDrag = () => { dragState.current = null; };

  const handleExport = useCallback(async () => {
    if (!pdfFile || placements.length === 0) return;
    setIsSaving(true);
    try {
      const signed = await signPdf(pdfFile, placements.map(({ id, ...rest }) => rest));
      downloadFile(signed, signed.name, "application/pdf");
      toast({ title: "Signed PDF ready", description: `${signed.name} downloaded.` });
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Signing failed", description: "Could not write the signature into this PDF." });
    } finally {
      setIsSaving(false);
    }
  }, [pdfFile, placements, toast]);

  const pagePlacements = placements.filter((p) => p.pageNumber === currentPage);

  return (
    <section className="py-8 sm:py-10 bg-background min-h-[70vh]">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <BackToTools />
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-4 h-0.5 bg-brand" />
            <span className="text-brand text-xs font-semibold uppercase tracking-widest">Sign</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground font-heading">Sign PDF</h1>
          <p className="text-muted-foreground text-sm mt-1">Draw your signature, drop it on any page, then drag and resize it into place</p>
        </div>

        {!pdfFile ? (
          <div className="max-w-2xl space-y-4">
          <div className="bg-card/90 backdrop-blur-sm border border-border rounded-xl p-6 shadow-sm">
            <FileUpload
              accept=".pdf,application/pdf"
              maxSizeInMB={50}
              multiple={false}
              onFilesSelected={handlePdfSelected}
              title={isLoading ? "Loading document…" : "Upload PDF File"}
              description="Drag & drop or click to browse"
              buttonText="Select PDF"
              icon={isLoading ? <Loader2 size={36} className="animate-spin" /> : <FileText size={36} />}
            />
            {isLoading && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>{loadProgress.total > 0 ? `Rendering page ${loadProgress.done} of ${loadProgress.total}…` : "Reading file…"}</span>
                  {loadProgress.total > 0 && <span>{Math.round((loadProgress.done / loadProgress.total) * 100)}%</span>}
                </div>
                <Progress
                  value={loadProgress.total > 0 ? (loadProgress.done / loadProgress.total) * 100 : 0}
                  className={`h-1.5 ${loadProgress.total === 0 ? "animate-pulse" : ""}`}
                />
              </div>
            )}
          </div>
          <SignatureCheck />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
            {/* Page canvas */}
            <div className="bg-card/90 backdrop-blur-sm border border-border rounded-xl overflow-hidden shadow-sm">
              <div className="bg-chrome px-4 py-2 flex items-center justify-between gap-2 flex-wrap">
                <span className="text-white text-xs font-semibold uppercase tracking-widest truncate max-w-[55%]">{pdfFile.name}</span>
                <div className="flex items-center gap-2">
                  <button
                    className="text-xs text-muted-foreground hover:text-white disabled:opacity-40"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Prev
                  </button>
                  <span className="text-xs text-white">{currentPage} / {pageImages.length}</span>
                  <button
                    className="text-xs text-muted-foreground hover:text-white disabled:opacity-40"
                    onClick={() => setCurrentPage((p) => Math.min(pageImages.length, p + 1))}
                    disabled={currentPage === pageImages.length}
                  >
                    Next
                  </button>
                </div>
              </div>

              <div className="p-3 sm:p-5 bg-muted">
                <div
                  ref={pageRef}
                  className="relative mx-auto w-full max-w-[720px] select-none touch-none shadow-sm"
                  onPointerMove={onPointerMovePage}
                  onPointerUp={endDrag}
                  onPointerLeave={endDrag}
                >
                  <img src={pageImages[currentPage - 1]} alt={`Page ${currentPage}`} className="w-full h-auto block rounded-md" />

                  {pagePlacements.map((p) => (
                    <div
                      key={p.id}
                      className={`absolute rounded-md border ${activeId === p.id ? "border-brand" : "border-transparent hover:border-brand/50"}`}
                      style={{
                        left: `${p.xRatio * 100}%`,
                        top: `${p.yRatio * 100}%`,
                        width: `${p.widthRatio * 100}%`,
                        height: `${p.heightRatio * 100}%`,
                        cursor: "move",
                        touchAction: "none",
                      }}
                      tabIndex={0}
                      role="group"
                      aria-label="Signature placement. Use arrow keys to move; use the placement fields to resize."
                      onKeyDown={e => {
                        if (e.target !== e.currentTarget) return;
                        const step = e.shiftKey ? .05 : .01;
                        const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
                        if (!delta[e.key]) return;
                        e.preventDefault();
                        const [dx, dy] = delta[e.key];
                        setPlacements(prev => prev.map(item => {
                          if (item.id !== p.id) return item;
                          const rect = fitRectangle({ x: item.xRatio + dx, y: item.yRatio + dy, w: item.widthRatio, h: item.heightRatio });
                          return { ...item, xRatio: rect.x, yRatio: rect.y };
                        }));
                      }}
                      onPointerDown={(e) => onPointerDownBox(e, p.id, "move")}
                    >
                      <img src={p.dataUrl} alt="Signature" className="w-full h-full object-fill pointer-events-none" />
                      <button
                        type="button"
                        onPointerDown={(e) => { e.stopPropagation(); }}
                        onClick={() => setPlacements((prev) => prev.filter((x) => x.id !== p.id))}
                        className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-chrome text-white flex items-center justify-center"
                        aria-label="Remove signature"
                      >
                        <X size={11} />
                      </button>
                      <div
                        onPointerDown={(e) => onPointerDownBox(e, p.id, "resize")}
                        className="absolute -bottom-2 -right-2 w-11 h-11 rounded-md bg-brand border-2 border-white cursor-se-resize"
                        style={{ touchAction: "none" }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="space-y-4">
              <div className="bg-card/90 backdrop-blur-sm border border-border rounded-xl p-4 sm:p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <PenLine size={14} className="text-brand" />
                  <h2 className="text-base font-semibold text-foreground">Create your signature</h2>
                </div>
                <label className="mb-4 block text-sm font-medium">Or choose a signature image
                  <input type="file" accept="image/png,image/jpeg" className="mt-2 block w-full min-w-0 text-sm" onChange={async e => {
                    const file = e.currentTarget.files?.[0]; e.currentTarget.value = "";
                    if (!file) return;
                    try {
                      if (file.size > 10 * 1024 * 1024) throw new Error("Choose an image smaller than 10 MB.");
                      const canvas = await imageCanvas(file);
                      setSignature({ dataUrl: canvas.toDataURL("image/png"), aspect: canvas.width / canvas.height });
                      canvas.width = canvas.height = 0;
                    } catch (error) { toast({ variant: "destructive", title: "Could not open signature image", description: error instanceof Error ? error.message : "Choose a PNG or JPG image." }); }
                  }} />
                </label>
                <SignaturePad onSave={(dataUrl, aspect) => { setSignature({ dataUrl, aspect }); toast({ title: "Signature saved", description: "Now place it on the page." }); }} />
              </div>

              {signature && (
                <div className="bg-card/90 backdrop-blur-sm border border-border rounded-xl p-4 sm:p-5 shadow-sm">
                  <h4 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">Your signature</h4>
                  <div className="border border-border rounded-lg p-3 bg-muted flex items-center justify-center">
                    <img src={signature.dataUrl} alt="Saved signature" className="max-h-16" />
                  </div>
                  <Button onClick={addPlacement} className="w-full mt-3 bg-brand hover:bg-brand-dark rounded-lg text-sm font-semibold">
                    <Plus size={14} className="mr-1.5" /> Place on page {currentPage}
                  </Button>
                </div>
              )}

              {pagePlacements.map((p, i) => <RectangleControls key={p.id} label={`Signature ${i + 1} placement`}
                value={{ x: p.xRatio, y: p.yRatio, w: p.widthRatio, h: p.heightRatio }}
                onChange={rect => setPlacements(prev => prev.map(item => item.id === p.id ? { ...item, xRatio: rect.x, yRatio: rect.y, widthRatio: rect.w, heightRatio: rect.h } : item))} />)}
              <Alert className="bg-card/80 border border-border rounded-xl">
                <AlertDescription className="text-xs text-muted-foreground leading-relaxed">
                  Drag the signature to move it, or use the placement fields. You can also focus the signature and move it with arrow keys. Nothing is uploaded.
                  The signed file records the date and time it was signed, so anyone can later check it with
                  "Check a signed PDF" and see if it was changed afterwards. This is a visible signature, not a
                  certificate-based digital signature.
                </AlertDescription>
              </Alert>

              <div className="flex flex-col gap-2">
                <Button
                  onClick={handleExport}
                  disabled={placements.length === 0 || isSaving}
                  className="bg-brand text-white hover:bg-brand-dark rounded-lg text-sm font-semibold"
                >
                  <Download size={14} className="mr-1.5" />
                  {isSaving ? "Preparing…" : `Download signed PDF (${placements.length})`}
                </Button>
                <Button variant="outline" onClick={reset} className="border-border rounded-lg text-sm">
                  Start over
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default SignPdf;
