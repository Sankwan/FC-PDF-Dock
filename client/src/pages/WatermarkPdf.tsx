import { useState } from "react";
import { Loader2, Stamp } from "lucide-react";
import ToolHeader from "@/components/ToolHeader";
import FileUpload from "@/components/FileUpload";
import PagePreview from "@/components/PagePreview";
import ToolResult, { StickyAction, chipBtn, primaryBtn, secondaryBtn } from "@/components/ToolResult";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { useFileVault } from "@/context/FileVault";
import { formatFileSize } from "@/lib/fileUtils";
import { useLivePreview } from "@/lib/livePreview";
import {
  applyWatermark, DEFAULT_WATERMARK, watermarkPdf, WATERMARK_COLOURS,
  type WatermarkColour, type WatermarkOptions,
} from "@/lib/watermark";

const PRESETS = ["CONFIDENTIAL", "DRAFT", "FOR OFFICIAL USE ONLY", "CERTIFIED TRUE COPY", "COPY", "CANCELLED", "FORESTRY COMMISSION"];

const WatermarkPdf = () => {
  const { toast } = useToast();
  const { files: vaultFiles, removeFile } = useFileVault();
  const [file, setFile] = useState<File | null>(null);
  const [opts, setOpts] = useState<WatermarkOptions>(DEFAULT_WATERMARK);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ file: File; changedText: boolean } | null>(null);

  const set = <K extends keyof WatermarkOptions>(key: K, value: WatermarkOptions[K]) => { setOpts((o) => ({ ...o, [key]: value })); setResult(null); };
  const livePreview = useLivePreview(file, page, async (doc) => { await applyWatermark(doc, opts); }, [opts]);

  const apply = async () => {
    if (!file || !opts.text.trim()) return;
    setBusy(true);
    try {
      setResult(await watermarkPdf(file, opts));
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Couldn't add the watermark", description: "The file may be damaged. Try Repair PDF first." });
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    vaultFiles.filter((vf) => vf.file === file).forEach((vf) => removeFile(vf.id));
    setFile(null); setResult(null); setPage(1);
  };

  const label = "mb-2 block text-sm font-semibold";

  return (
    <section className="min-h-[60vh] bg-background py-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <ToolHeader category="Official documents" title="Watermark PDF" description="Mark every page CONFIDENTIAL, DRAFT, CERTIFIED TRUE COPY or your own text. The preview shows exactly what you'll get." />

        {!file ? (
          <div className="max-w-2xl rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
            <FileUpload accept=".pdf,application/pdf" maxSizeInMB={150} onFilesSelected={(f) => { setFile(f[0] ?? null); setResult(null); setPage(1); }}
              title="Choose a PDF" description="Drag & drop or click to browse" buttonText="Select PDF" icon={<Stamp size={34} />} />
          </div>
        ) : (
          <div className="grid max-w-5xl items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
            <div className="space-y-5 rounded-xl border border-border bg-card p-4 pb-0 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{file.name}</span>
                  <span className="text-xs text-muted-foreground">{livePreview.pageCount ? `${livePreview.pageCount} pages · ` : ""}{formatFileSize(file.size)}</span>
                </span>
                <button type="button" onClick={reset} className="min-h-11 shrink-0 text-sm text-muted-foreground hover:text-brand">Change file</button>
              </div>

              <div>
                <label htmlFor="wm-text" className={label}>Text</label>
                <input id="wm-text" value={opts.text} onChange={(e) => set("text", e.target.value)} maxLength={60} placeholder="e.g. CONFIDENTIAL"
                  className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm" />
                <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Common watermarks">
                  {PRESETS.map((p) => (
                    <button key={p} type="button" onClick={() => set("text", p)} aria-pressed={opts.text === p}
                      className={`min-h-9 rounded-full border px-3 text-[11px] font-semibold tracking-wide ${opts.text === p ? "border-brand bg-brand text-white" : "border-border bg-card text-muted-foreground hover:border-brand hover:text-brand"}`}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <fieldset>
                <legend className={label}>Layout</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup">
                  {([["centre", 45, "Diagonal"], ["centre", 0, "Straight"], ["tiled", 45, "Tiled diagonal"], ["tiled", 0, "Tiled straight"]] as const).map(([layout, angle, name]) => {
                    const on = opts.layout === layout && opts.angle === angle;
                    return (
                      <button key={name} type="button" role="radio" aria-checked={on} className={chipBtn(on)}
                        onClick={() => { setOpts((o) => ({ ...o, layout, angle })); setResult(null); }}>{name}</button>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset>
                <legend className={label}>Colour</legend>
                <div className="flex flex-wrap gap-2" role="radiogroup">
                  {(Object.keys(WATERMARK_COLOURS) as WatermarkColour[]).map((c) => (
                    <button key={c} type="button" role="radio" aria-checked={opts.colour === c} onClick={() => set("colour", c)}
                      className={`${chipBtn(opts.colour === c)} inline-flex items-center gap-2`}>
                      <span className="h-4 w-4 rounded-full border border-white/60" style={{ background: WATERMARK_COLOURS[c].css }} />
                      {WATERMARK_COLOURS[c].label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <div className="mb-3 flex items-center justify-between"><span className="text-sm font-semibold">Strength</span><span className="text-xs tabular-nums text-muted-foreground">{Math.round(opts.opacity * 100)}%</span></div>
                  <Slider aria-label="Watermark strength" min={5} max={60} step={1} value={[Math.round(opts.opacity * 100)]} onValueChange={(v) => set("opacity", v[0] / 100)} />
                </div>
                <div>
                  <div className="mb-3 flex items-center justify-between"><span className="text-sm font-semibold">Text size</span><span className="text-xs tabular-nums text-muted-foreground">{opts.fontSize}pt</span></div>
                  <Slider aria-label="Watermark text size" min={20} max={96} step={2} value={[opts.fontSize]} onValueChange={(v) => set("fontSize", v[0])} />
                </div>
              </div>

              <StickyAction>
                {result ? (
                  <ToolResult files={[result.file]} detail={`Added to all ${livePreview.pageCount} pages. Text in the document is unchanged.`}
                    actions={<><button type="button" className={secondaryBtn} onClick={() => setResult(null)}>Change settings</button><button type="button" className={secondaryBtn} onClick={reset}>Watermark another</button></>}>
                    {result.changedText && <p className="text-xs text-amber-800 dark:text-amber-200">Some characters aren't in the PDF font and were replaced (for example ₵ became GH¢). Check the preview.</p>}
                  </ToolResult>
                ) : (
                  <button type="button" onClick={apply} disabled={busy || !opts.text.trim()} className={primaryBtn}>
                    {busy ? <Loader2 size={16} className="animate-spin" /> : <Stamp size={16} />} Add watermark to {livePreview.pageCount || "all"} page{livePreview.pageCount === 1 ? "" : "s"}
                  </button>
                )}
              </StickyAction>
            </div>

            <div className="order-first md:sticky md:top-24 md:order-none">
              <PagePreview preview={livePreview.preview} busy={livePreview.busy} error={livePreview.error} page={page} pageCount={livePreview.pageCount} onPage={setPage} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default WatermarkPdf;
