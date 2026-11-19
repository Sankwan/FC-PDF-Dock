import { useRef, useState } from "react";
import { Crop, Loader2, Wand2 } from "lucide-react";
import { PDFDocument } from "pdf-lib";
import ToolHeader from "@/components/ToolHeader";
import FileUpload from "@/components/FileUpload";
import PagePreview from "@/components/PagePreview";
import ToolResult, { StickyAction, chipBtn, primaryBtn, secondaryBtn } from "@/components/ToolResult";
import { useToast } from "@/hooks/use-toast";
import { useFileVault } from "@/context/FileVault";
import { formatFileSize } from "@/lib/fileUtils";
import { useLivePreview } from "@/lib/livePreview";
import { applyCrop, clampTrim, commonTrim, detectWhiteMargins, flattenToImages, MM, NO_TRIM, PAPER, pagesPerSheet, resizePages, type PaperSize, type PerSheet, type Trim } from "@/lib/crop";

type Tab = "crop" | "paper";
const SIDES: { key: keyof Trim; label: string }[] = [{ key: "top", label: "Top" }, { key: "bottom", label: "Bottom" }, { key: "left", label: "Left" }, { key: "right", label: "Right" }];

/**
 * Drag handles on the four edges of the preview. Dragging an edge sets how
 * much is cut from that side (in mm) for every page.
 */
const EdgeHandles = ({ trim, size, onChange }: { trim: Trim; size: { width: number; height: number }; onChange: (side: keyof Trim, mm: number) => void }) => {
  const box = useRef<HTMLDivElement>(null);
  const start = (side: keyof Trim) => (e: React.PointerEvent) => {
    e.preventDefault();
    const el = box.current?.parentElement;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Move by how far the finger travels, so grabbing a handle doesn't make it jump.
    const from = clampTrim(trim, size.width, size.height)[side];
    const sx = e.clientX, sy = e.clientY;
    const move = (ev: PointerEvent) => {
      const dx = ((ev.clientX - sx) / rect.width) * size.width, dy = ((ev.clientY - sy) / rect.height) * size.height;
      const pts = from + (side === "left" ? dx : side === "right" ? -dx : side === "top" ? dy : -dy);
      onChange(side, Math.max(0, Math.round(pts / MM)));
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  const t = clampTrim(trim, size.width, size.height);
  const handle = "absolute grid place-items-center touch-none";
  const grip = "rounded-full bg-brand shadow ring-2 ring-white";
  return (
    <div ref={box} className="absolute inset-0">
      <div className="pointer-events-none absolute border-2 border-dashed border-brand" style={{ left: pct(t.left, size.width), top: pct(t.top, size.height), right: pct(t.right, size.width), bottom: pct(t.bottom, size.height), boxShadow: "0 0 0 9999px rgba(15,23,42,0.45)" }} />
      {(["top", "bottom"] as const).map((side) => (
        <button key={side} type="button" aria-label={`Drag to cut from the ${side}`} onPointerDown={start(side)}
          className={`${handle} left-1/2 h-8 w-16 -translate-x-1/2 cursor-ns-resize`}
          style={side === "top" ? { top: `max(0px, calc(${pct(t.top, size.height)} - 16px))` } : { bottom: `max(0px, calc(${pct(t.bottom, size.height)} - 16px))` }}>
          <span className={`${grip} h-2 w-10`} />
        </button>
      ))}
      {(["left", "right"] as const).map((side) => (
        <button key={side} type="button" aria-label={`Drag to cut from the ${side}`} onPointerDown={start(side)}
          className={`${handle} top-1/2 h-16 w-8 -translate-y-1/2 cursor-ew-resize`}
          style={side === "left" ? { left: `max(0px, calc(${pct(t.left, size.width)} - 16px))` } : { right: `max(0px, calc(${pct(t.right, size.width)} - 16px))` }}>
          <span className={`${grip} h-10 w-2`} />
        </button>
      ))}
    </div>
  );
};

const CropPdf = () => {
  const { toast } = useToast();
  const { files: vaultFiles, removeFile } = useFileVault();
  const [file, setFile] = useState<File | null>(null);
  const [tab, setTab] = useState<Tab>("crop");
  const [trimMm, setTrimMm] = useState<Record<keyof Trim, number>>({ top: 0, right: 0, bottom: 0, left: 0 });
  const [auto, setAuto] = useState<(Trim | null)[] | null>(null);
  const [autoSame, setAutoSame] = useState(false);
  const [perSheet, setPerSheet] = useState<PerSheet>(1);
  const [flatten, setFlatten] = useState(false);
  const [progress, setProgress] = useState(0);
  const [detecting, setDetecting] = useState(0);
  const [paper, setPaper] = useState<PaperSize | null>(null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<File | null>(null);

  const manual: Trim = { top: trimMm.top * MM, right: trimMm.right * MM, bottom: trimMm.bottom * MM, left: trimMm.left * MM };
  const trims: Trim | Trim[] = auto ? (autoSame ? commonTrim(auto) : auto.map((t) => t ?? NO_TRIM)) : manual;
  const hasCrop = (Array.isArray(trims) ? trims : [trims]).some((t) => t.top + t.right + t.bottom + t.left > 1);
  const sheetPaper: PaperSize | null = perSheet > 1 ? paper ?? "a4" : paper;
  const changed = () => setResult(null);

  // The Crop tab shows the whole page with the cut-off parts shaded; the
  // Paper tab shows the finished page.
  const live = useLivePreview(file, page, async (doc, n) => {
    if (tab === "crop") return;
    applyCrop(doc, trims, n);
    if (perSheet > 1) return pagesPerSheet(doc, sheetPaper!, perSheet as 2 | 4);
    if (paper) return resizePages(doc, paper);
  }, [tab, paper, perSheet, JSON.stringify(trims)]);

  const pageTrim = Array.isArray(trims) ? trims[page - 1] ?? NO_TRIM : trims;
  const shade = (() => {
    if (tab !== "crop" || !live.preview) return null;
    const size = { width: live.preview.width, height: live.preview.height };
    if (!auto) return <EdgeHandles trim={pageTrim} size={size} onChange={(side, mm) => { setTrimMm((t) => ({ ...t, [side]: Math.min(150, mm) })); changed(); }} />;
    const t = clampTrim(pageTrim, size.width, size.height);
    const pct = (v: number, total: number) => `${(v / total) * 100}%`;
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute border-2 border-dashed border-brand" style={{ left: pct(t.left, size.width), top: pct(t.top, size.height), right: pct(t.right, size.width), bottom: pct(t.bottom, size.height), boxShadow: "0 0 0 9999px rgba(15,23,42,0.45)" }} />
      </div>
    );
  })();

  const runDetect = async () => {
    if (!file) return;
    setDetecting(1);
    try {
      const found = await detectWhiteMargins(file, (d, t) => setDetecting(Math.max(1, Math.round((d / t) * 100))));
      setAuto(found); changed();
      if (!found.some((t) => t && t.top + t.right + t.bottom + t.left > 1)) toast({ title: "No white margins found", description: "The content already reaches the edges. Enter amounts to cut instead." });
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Couldn't check the margins", description: "Enter amounts to cut instead." });
    } finally {
      setDetecting(0);
    }
  };

  const apply = async () => {
    if (!file) return;
    setBusy(true);
    try {
      let doc = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
      applyCrop(doc, trims);
      if (perSheet > 1) doc = await pagesPerSheet(doc, sheetPaper!, perSheet as 2 | 4);
      else if (paper) doc = await resizePages(doc, paper);
      let bytes = await doc.save();
      if (flatten && hasCrop) bytes = await flattenToImages(bytes, (d, t) => setProgress(Math.round((d / t) * 100)));
      const suffix = perSheet > 1 ? `_${perSheet}-per-sheet` : paper ? `_${PAPER[paper].label.toLowerCase()}` : "_cropped";
      setResult(new File([bytes as BlobPart], file.name.replace(/\.pdf$/i, "") + suffix + ".pdf", { type: "application/pdf" }));
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Couldn't change this PDF", description: "The file may be damaged. Try Repair PDF first." });
    } finally {
      setBusy(false); setProgress(0);
    }
  };

  const reset = () => {
    vaultFiles.filter((vf) => vf.file === file).forEach((vf) => removeFile(vf.id));
    setFile(null); setResult(null); setAuto(null); setAutoSame(false); setPaper(null); setPerSheet(1); setFlatten(false); setPage(1); setTrimMm({ top: 0, right: 0, bottom: 0, left: 0 });
  };

  return (
    <section className="min-h-[60vh] bg-background py-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <ToolHeader category="Organise" title="Crop & resize" description="Cut away scan borders and empty margins, or put every page on the same paper size (A4, Letter and more) before printing or merging." />

        {!file ? (
          <div className="max-w-2xl rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
            <FileUpload accept=".pdf,application/pdf" maxSizeInMB={150} onFilesSelected={(f) => { setFile(f[0] ?? null); setResult(null); setAuto(null); setPage(1); }}
              title="Choose a PDF" description="Drag & drop or click to browse" buttonText="Select PDF" icon={<Crop size={34} />} />
          </div>
        ) : (
          <div className="grid max-w-5xl items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
            <div className="space-y-5 rounded-xl border border-border bg-card p-4 pb-0 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{file.name}</span>
                  <span className="text-xs text-muted-foreground">{live.pageCount ? `${live.pageCount} pages · ` : ""}{formatFileSize(file.size)}</span>
                </span>
                <button type="button" onClick={reset} className="min-h-11 shrink-0 text-sm text-muted-foreground hover:text-brand">Change file</button>
              </div>

              <div role="tablist" className="grid grid-cols-2 rounded-lg bg-muted p-1">
                {([["crop", "Crop margins"], ["paper", "Paper size"]] as const).map(([id, name]) => (
                  <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                    className={`min-h-10 rounded-md text-sm font-semibold ${tab === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                    {name}{id === "crop" && hasCrop ? " ✓" : id === "paper" && perSheet > 1 ? ` · ${perSheet} per sheet` : id === "paper" && paper ? ` · ${PAPER[paper].label}` : ""}
                  </button>
                ))}
              </div>

              {tab === "crop" ? (
                <div className="space-y-4">
                  <button type="button" onClick={runDetect} disabled={!!detecting} className={`${secondaryBtn} w-full sm:w-auto`}>
                    {detecting ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                    {detecting ? `Checking pages… ${detecting}%` : "Trim white margins automatically"}
                  </button>
                  {auto ? (
                    <div className="space-y-2 rounded-lg border border-brand/40 bg-brand-tint p-3 text-sm">
                      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How to trim">
                        <button type="button" role="radio" aria-checked={!autoSame} className={chipBtn(!autoSame)} onClick={() => { setAutoSame(false); changed(); }}>Each page to its content</button>
                        <button type="button" role="radio" aria-checked={autoSame} className={chipBtn(autoSame)} onClick={() => { setAutoSame(true); changed(); }}>Same size for every page</button>
                      </div>
                      <p>{autoSame ? "Every page gets the same cut, as much as fits the fullest page, so the pages stay one size." : "Each page is trimmed to its own content, so pages can end up different sizes."} A 4 mm border is left. Use the arrows under the preview to check every page.</p>
                      <button type="button" className="mt-2 min-h-9 text-sm font-semibold text-brand underline underline-offset-4" onClick={() => { setAuto(null); changed(); }}>Enter amounts instead</button>
                    </div>
                  ) : (
                    <fieldset>
                      <legend className="mb-2 text-sm font-semibold">Cut from each edge (mm), same for every page</legend>
                      <p className="mb-2 text-xs text-muted-foreground">Drag the green handles on the preview, or type amounts.</p>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {SIDES.map((s) => (
                          <label key={s.key} className="text-xs text-muted-foreground">
                            {s.label}
                            <input type="number" inputMode="decimal" min={0} max={150} step={1} value={trimMm[s.key] || ""} placeholder="0"
                              onChange={(e) => { setTrimMm((t) => ({ ...t, [s.key]: Math.min(150, Math.max(0, Number(e.target.value) || 0)) })); changed(); }}
                              className="mt-1 h-11 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground" />
                          </label>
                        ))}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {[5, 10, 15].map((v) => (
                          <button key={v} type="button" className={chipBtn(false)} onClick={() => { setTrimMm({ top: v, right: v, bottom: v, left: v }); changed(); }}>{v} mm all round</button>
                        ))}
                      </div>
                    </fieldset>
                  )}
                  <label className="flex min-h-11 items-start gap-3 text-sm">
                    <input type="checkbox" checked={flatten} onChange={(e) => { setFlatten(e.target.checked); changed(); }} className="mt-0.5 h-5 w-5 shrink-0 accent-[hsl(var(--brand))]" />
                    <span>Remove the cut-off part completely
                      <span className="block text-xs text-muted-foreground">Normally cropping only hides it, and it can be brought back. This turns pages into images, so text can no longer be selected or searched.</span>
                    </span>
                  </label>
                </div>
              ) : (
                <div className="space-y-3">
                  <fieldset>
                    <legend className="mb-2 text-sm font-semibold">Put every page on</legend>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" role="radiogroup">
                      <button type="button" role="radio" aria-checked={!paper} className={chipBtn(!paper)} onClick={() => { setPaper(null); changed(); }}>Keep</button>
                      {(Object.keys(PAPER) as PaperSize[]).map((k) => (
                        <button key={k} type="button" role="radio" aria-checked={paper === k} className={chipBtn(paper === k)} onClick={() => { setPaper(k); changed(); }}>{PAPER[k].label}</button>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend className="mb-2 text-sm font-semibold">Pages on each sheet</legend>
                    <div className="flex gap-2" role="radiogroup">
                      {([1, 2, 4] as PerSheet[]).map((n) => (
                        <button key={n} type="button" role="radio" aria-checked={perSheet === n} className={chipBtn(perSheet === n)} onClick={() => { setPerSheet(n); changed(); }}>{n === 1 ? "1 (normal)" : `${n} per sheet`}</button>
                      ))}
                    </div>
                  </fieldset>
                  <p className="text-xs text-muted-foreground">
                    {perSheet > 1
                      ? `${perSheet} pages side by side on each ${PAPER[sheetPaper!].label} sheet, to save paper on drafts and handouts.`
                      : "Pages are scaled to fit and centred, keeping their portrait or landscape direction."} Text stays sharp and searchable. Links and fillable fields are not kept.
                  </p>
                </div>
              )}

              <StickyAction>
                {result ? (
                  <ToolResult files={[result]} detail={[hasCrop && (flatten ? "Cropped, cut-off part removed" : "Cropped"), perSheet > 1 ? `${perSheet} pages per ${PAPER[sheetPaper!].label} sheet` : paper && `on ${PAPER[paper].label} paper`].filter(Boolean).join(" · ")}
                    actions={<><button type="button" className={secondaryBtn} onClick={() => setResult(null)}>Change settings</button><button type="button" className={secondaryBtn} onClick={reset}>Use another file</button></>} />
                ) : (
                  <button type="button" onClick={apply} disabled={busy || (!hasCrop && !paper && perSheet === 1)} className={primaryBtn}>
                    {busy ? <Loader2 size={16} className="animate-spin" /> : <Crop size={16} />}
                    {busy && progress ? `Removing cut-off parts… ${progress}%` : perSheet > 1 ? `${hasCrop ? "Crop and put " : "Put "}${perSheet} pages per sheet` : hasCrop && paper ? `Crop and put on ${PAPER[paper].label}` : paper ? `Put on ${PAPER[paper].label}` : "Crop pages"}
                  </button>
                )}
              </StickyAction>
            </div>

            <div className="order-first md:sticky md:top-24 md:order-none">
              <PagePreview preview={live.preview} busy={live.busy} error={live.error} page={page} pageCount={live.pageCount} onPage={setPage}
                caption={tab === "crop" ? "Shaded part is cut off" : perSheet > 1 ? "Where this page sits on a sheet" : "Result"}>
                {shade}
              </PagePreview>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default CropPdf;
