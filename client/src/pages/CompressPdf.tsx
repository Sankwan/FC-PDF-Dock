import { useState, useCallback, type KeyboardEvent } from "react";
import { Link } from "wouter";
import BackToTools from "@/components/BackToTools";
import FileUpload from "@/components/FileUpload";
import FilePreview from "@/components/FilePreview";
import { FileDown, AlertTriangle, CheckCircle2, Type, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useFileVault } from "@/context/FileVault";
import { generateFilePreview, formatFileSize } from "@/lib/fileUtils";
import { compressPdf } from "@/lib/pdfUtils";
import { COMPRESS_PRESETS, compressPdfKeepText, compressToTarget, type CompressLevel } from "@/lib/compress";
import SaveShareButtons from "@/components/SaveShareButtons";

type Method = "keep-text" | "flatten";
type Goal = "strength" | "size";
const TARGETS = [{ label: "100 KB", kb: 100 }, { label: "200 KB", kb: 200 }, { label: "500 KB", kb: 500 }, { label: "1 MB", kb: 1024 }, { label: "2 MB", kb: 2048 }, { label: "5 MB", kb: 5120 }];

interface Outcome {
  file: File;
  originalBytes: number;
  outputBytes: number;
  method: Method;
  imagesRecompressed?: number;
  unchanged?: boolean;
  hadDigitalSignature?: boolean;
  /** set when aiming for a size */
  target?: number;
  reached?: boolean;
}

const radioKeys = (event: KeyboardEvent<HTMLDivElement>) => {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="radio"]:not(:disabled)'));
  const index = items.indexOf(document.activeElement as HTMLButtonElement);
  if (index < 0 || !items.length) return;
  event.preventDefault();
  const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
  items[next].focus(); items[next].click();
};

const CompressPdf = () => {
  const { toast } = useToast();
  const { files: vaultFiles, removeFile: removeVaultFile } = useFileVault();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState("");
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [method, setMethod] = useState<Method>("keep-text");
  const [level, setLevel] = useState<CompressLevel>("balanced");
  const [removeMetadata, setRemoveMetadata] = useState(false);
  const [goal, setGoal] = useState<Goal>("strength");
  const [targetKb, setTargetKb] = useState(1024);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const handlePdfSelected = useCallback(async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setPdfFile(f);
    setOutcome(null);
    setPdfPreviewUrl("");
    setIsLoadingPreview(true);
    try {
      setPdfPreviewUrl(await generateFilePreview(f));
    } catch {
      // preview is optional
    } finally {
      setIsLoadingPreview(false);
    }
  }, []);

  const handleReset = useCallback(() => {
    vaultFiles.filter((vf) => vf.file === pdfFile).forEach((vf) => removeVaultFile(vf.id));
    setPdfFile(null);
    setPdfPreviewUrl("");
    setOutcome(null);
    setProgress(0);
  }, [pdfFile, vaultFiles, removeVaultFile]);

  const handleCompress = useCallback(async () => {
    if (!pdfFile) return;
    setBusy(true);
    setProgress(0);
    setOutcome(null);
    try {
      if (goal === "size") {
        const target = targetKb * 1024;
        const r = await compressToTarget(pdfFile, target, {
          removeMetadata,
          onProgress: (done, total, s) => { setStage(s); setProgress(Math.round((done / total) * 95)); },
        });
        setOutcome({ ...r, method: "keep-text" });
      } else if (method === "keep-text") {
        const r = await compressPdfKeepText(pdfFile, {
          level,
          removeMetadata,
          onProgress: (done, total, s) => {
            setStage(s);
            setProgress(total ? Math.round((done / total) * 90) : 90);
          },
        });
        setOutcome({ ...r, method });
      } else {
        const quality = level === "light" ? "low" : level === "balanced" ? "medium" : "high";
        setStage("Redrawing pages");
        const file = await compressPdf(pdfFile, {
          quality,
          removeMetadata,
          onProgress: (done, total) => setProgress(Math.round((done / total) * 95)),
        });
        setOutcome({ file, originalBytes: pdfFile.size, outputBytes: file.size, method, unchanged: file.size >= pdfFile.size });
      }
      setProgress(100);
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Couldn't compress this PDF", description: err instanceof Error ? err.message : "Try a different file." });
    } finally {
      setBusy(false);
      setStage("");
    }
  }, [pdfFile, method, level, removeMetadata, goal, targetKb, toast]);

  /** Last resort when a size can't be reached with text kept: turn pages into pictures. */
  const flattenToTarget = useCallback(async () => {
    if (!pdfFile || !outcome?.target) return;
    const target = outcome.target;
    setBusy(true);
    setProgress(0);
    setStage("Turning pages into images");
    try {
      let file: File | null = null;
      for (const quality of ["medium", "high"] as const) {
        file = await compressPdf(pdfFile, { quality, removeMetadata, targetSizeKB: target / 1024, onProgress: (d, t) => setProgress(Math.round((d / t) * 95)) });
        if (file.size <= target) break;
      }
      setOutcome({ file: file!, originalBytes: pdfFile.size, outputBytes: file!.size, method: "flatten", target, reached: file!.size <= target, unchanged: file!.size >= pdfFile.size });
      setProgress(100);
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Couldn't flatten this PDF", description: "Try Split PDF by file size instead." });
    } finally {
      setBusy(false);
      setStage("");
    }
  }, [pdfFile, outcome, removeMetadata, toast]);

  const saved = outcome ? Math.max(0, Math.round((1 - outcome.outputBytes / outcome.originalBytes) * 100)) : 0;

  const methodCard = (value: Method, icon: React.ReactNode, title: string, body: string, badge?: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={method === value}
      tabIndex={method === value ? 0 : -1}
      onClick={() => setMethod(value)}
      className={`flex w-full gap-3 rounded-lg border p-4 text-left transition-colors ${
        method === value ? "border-brand bg-brand-tint" : "border-border bg-card hover:border-brand/50"
      }`}
    >
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${method === value ? "bg-brand text-white" : "bg-muted text-muted-foreground"}`}>{icon}</span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
          {title}
          {badge && <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">{badge}</span>}
        </span>
        <span className="mt-1 block text-sm text-muted-foreground">{body}</span>
      </span>
    </button>
  );

  return (
    <section className="py-10 bg-background min-h-[60vh]">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <BackToTools />
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-4 h-0.5 bg-brand" />
            <span className="text-brand text-xs font-semibold uppercase tracking-widest">Reduce size</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground font-heading">Compress PDF</h1>
          <p className="text-muted-foreground text-sm mt-1">Make PDFs small enough for email and WhatsApp while keeping text sharp and searchable.</p>
        </div>

        <div className="max-w-2xl bg-card/90 border border-border rounded-xl shadow-sm">
          <div className="p-6">
            {!pdfFile ? (
              <FileUpload
                accept=".pdf,application/pdf"
                maxSizeInMB={150}
                onFilesSelected={handlePdfSelected}
                title="Choose a PDF"
                description="Drag & drop or click to browse"
                buttonText="Select PDF"
                icon={<FileDown size={36} />}
              />
            ) : (
              <>
                <FilePreview files={[pdfFile]} fileType="pdf" previewUrls={pdfPreviewUrl ? [pdfPreviewUrl] : []} isLoadingPreview={isLoadingPreview} onRemoveAll={handleReset} />

                {!outcome && !busy && (
                  <div className="space-y-6 mb-6">
                    <div role="tablist" aria-label="What do you need?" className="grid grid-cols-2 rounded-lg bg-muted p-1">
                      {([["strength", "Choose strength"], ["size", "Fit under a size"]] as const).map(([id, name]) => (
                        <button key={id} type="button" role="tab" aria-selected={goal === id} onClick={() => setGoal(id)}
                          className={`min-h-10 rounded-md text-sm font-semibold ${goal === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>{name}</button>
                      ))}
                    </div>

                    {goal === "size" && (
                      <fieldset>
                        <legend className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Make it smaller than</legend>
                        <div role="radiogroup" aria-label="Target size" onKeyDown={radioKeys} className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                          {TARGETS.map((t) => (
                            <button key={t.kb} type="button" role="radio" aria-checked={targetKb === t.kb} tabIndex={targetKb === t.kb ? 0 : -1} onClick={() => setTargetKb(t.kb)}
                              disabled={t.kb * 1024 >= pdfFile.size}
                              className={`min-h-11 rounded-lg border text-sm font-semibold disabled:opacity-40 ${targetKb === t.kb ? "border-brand bg-brand-tint" : "border-border hover:border-brand/50"}`}>{t.label}</button>
                          ))}
                        </div>
                        <label className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                          Or exactly
                          <input type="number" inputMode="decimal" min={0.05} step={0.1} value={+(targetKb / 1024).toFixed(2)}
                            onChange={(e) => setTargetKb(Math.max(50, Math.round((Number(e.target.value) || 0) * 1024)))}
                            className="h-11 w-24 rounded-md border border-input bg-card px-3 text-foreground" /> MB
                        </label>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {targetKb * 1024 >= pdfFile.size
                            ? `This file is already ${formatFileSize(pdfFile.size)}, under that size.`
                            : "Photos are shrunk only as much as needed. Text always stays sharp and searchable."}
                        </p>
                      </fieldset>
                    )}

                    {goal === "strength" && (<>
                    <fieldset>
                      <legend className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Method</legend>
                      <div role="radiogroup" aria-label="Compression method" onKeyDown={radioKeys} className="grid gap-3">
                        {methodCard("keep-text", <Type size={17} />, "Keep text", "Shrinks the pictures inside the PDF and tidies its structure. Text stays selectable and searchable, and small print stays sharp.", "Recommended")}
                        {methodCard("flatten", <ImageIcon size={17} />, "Flatten to images", "Turns every page into a picture. Use only for scanned documents that are still too big after Keep text.")}
                      </div>
                      {method === "flatten" && (
                        <div className="mt-3 flex gap-2.5 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
                          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
                          <span>Text in the result can't be searched, selected or copied, and fine print may blur. Don't use this for letters, permits or reports that others need to search.</span>
                        </div>
                      )}
                    </fieldset>

                    <fieldset>
                      <legend className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Strength</legend>
                      <div role="radiogroup" aria-label="Compression strength" onKeyDown={radioKeys} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {(Object.keys(COMPRESS_PRESETS) as CompressLevel[]).map((key) => (
                          <button
                            key={key}
                            type="button"
                            role="radio"
                            aria-checked={level === key}
                            tabIndex={level === key ? 0 : -1}
                            onClick={() => setLevel(key)}
                            className={`rounded-lg border p-3 text-left transition-colors ${level === key ? "border-brand bg-brand-tint" : "border-border hover:border-brand/50"}`}
                          >
                            <span className="block text-sm font-semibold text-foreground">{COMPRESS_PRESETS[key].label}</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">{COMPRESS_PRESETS[key].hint}</span>
                          </button>
                        ))}
                      </div>
                    </fieldset>

                    </>)}

                    <div className="flex items-center gap-2.5">
                      <Checkbox id="remove-metadata" checked={removeMetadata} onCheckedChange={(v) => setRemoveMetadata(v === true)} />
                      <Label htmlFor="remove-metadata" className="text-sm text-muted-foreground cursor-pointer">Remove author, title and keywords from the file</Label>
                    </div>
                  </div>
                )}

                {busy && (
                  <div className="mb-6">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>{stage || "Working"}…</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-1.5" />
                    <p className="mt-2 text-xs text-muted-foreground">Everything happens on this device. Large files can take a minute.</p>
                  </div>
                )}

                {outcome && outcome.target !== undefined && (
                  <div className={`mb-4 flex gap-2.5 rounded-lg border p-3 text-sm ${outcome.reached ? "border-brand/40 bg-brand-tint" : "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50"}`}>
                    {outcome.reached ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-brand" /> : <AlertTriangle size={18} className="mt-0.5 shrink-0" />}
                    <div>
                      {outcome.reached ? (
                        <p><strong>{formatFileSize(outcome.outputBytes)}</strong>, under your {formatFileSize(outcome.target)} limit.</p>
                      ) : (
                        <>
                          <p><strong>Couldn't get under {formatFileSize(outcome.target)}{outcome.method === "keep-text" ? " while keeping text sharp" : ""}.</strong> The smallest was {formatFileSize(outcome.outputBytes)}.</p>
                          <p className="mt-1">
                            {outcome.method === "keep-text"
                              ? "You can save this, turn the pages into images (smaller, but text can't be searched or copied), or split the PDF into parts under the limit."
                              : "Split the PDF into parts under the limit instead."}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {outcome.method === "keep-text" && (
                              <button type="button" onClick={flattenToTarget} className="inline-flex min-h-10 items-center rounded-md border border-current px-3 text-sm font-semibold">Turn pages into images</button>
                            )}
                            <Link href="/split-pdf" className="inline-flex min-h-10 items-center rounded-md border border-current px-3 text-sm font-semibold">Split by file size</Link>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {outcome && (
                  <div className="mb-6 rounded-lg border border-border p-4">
                    {outcome.unchanged ? (
                      <div className="flex gap-3">
                        <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-brand" />
                        <div className="text-sm">
                          <p className="font-semibold text-foreground">{outcome.target !== undefined ? "This PDF couldn't be made any smaller while keeping text." : `This PDF is already as small as it can be with ${COMPRESS_PRESETS[level].label.toLowerCase()} settings.`}</p>
                          <p className="mt-1 text-muted-foreground">
                            {method === "keep-text" ? "Try Strong, or Flatten to images if it's a scanned document." : "It's probably mostly text already."}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-3 text-center">
                          <div>
                            <div className="text-xs text-muted-foreground">Before</div>
                            <div className="font-semibold tabular-nums text-foreground">{formatFileSize(outcome.originalBytes)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">After</div>
                            <div className="font-semibold tabular-nums text-foreground">{formatFileSize(outcome.outputBytes)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Saved</div>
                            <div className="font-bold tabular-nums text-brand">{saved}%</div>
                          </div>
                        </div>
                        <p className="mt-4 flex items-start gap-2 border-t border-border pt-3 text-sm text-muted-foreground">
                          <CheckCircle2 size={16} className={`mt-0.5 shrink-0 ${outcome.method === "keep-text" ? "text-brand" : "text-muted-foreground"}`} />
                          {outcome.method === "keep-text"
                            ? `Text is still selectable and searchable. ${outcome.imagesRecompressed ?? 0} image${outcome.imagesRecompressed === 1 ? "" : "s"} recompressed.`
                            : "Pages are now images: text is no longer selectable."}
                        </p>
                      </>
                    )}
                    {outcome.hadDigitalSignature && (
                      <p className="mt-3 flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
                        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                        This PDF had a certificate-based digital signature. Any change to the file, including compression, makes that signature show as invalid. Keep the original for the record.
                      </p>
                    )}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3">
                  {!outcome && !busy && (
                    <Button onClick={handleCompress} disabled={goal === "size" && targetKb * 1024 >= pdfFile.size} className="h-11 bg-brand text-white hover:bg-brand-dark rounded-md font-semibold">
                      <FileDown size={15} className="mr-1" /> {goal === "size" ? `Compress to under ${targetKb >= 1024 ? `${+(targetKb / 1024).toFixed(2)} MB` : `${targetKb} KB`}` : "Compress PDF"}
                    </Button>
                  )}
                  {outcome && !outcome.unchanged && <SaveShareButtons file={outcome.file} />}
                  {outcome && (
                    <Button variant="outline" onClick={() => setOutcome(null)} className="rounded-md">
                      Try other settings
                    </Button>
                  )}
                  <Button variant="outline" onClick={handleReset} className="rounded-md">
                    {outcome ? "Compress another" : "Reset"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default CompressPdf;
