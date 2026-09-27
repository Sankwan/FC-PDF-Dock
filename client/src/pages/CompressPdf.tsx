import { useState, useCallback } from "react";
import BackToTools from "@/components/BackToTools";
import FileUpload from "@/components/FileUpload";
import FilePreview from "@/components/FilePreview";
import { FileDown, Download, AlertTriangle, CheckCircle2, Type, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useFileVault } from "@/context/FileVault";
import { generateFilePreview, downloadFile, formatFileSize } from "@/lib/fileUtils";
import { compressPdf } from "@/lib/pdfUtils";
import { COMPRESS_PRESETS, compressPdfKeepText, type CompressLevel } from "@/lib/compress";

type Method = "keep-text" | "flatten";

interface Outcome {
  file: File;
  originalBytes: number;
  outputBytes: number;
  method: Method;
  imagesRecompressed?: number;
  unchanged?: boolean;
  hadDigitalSignature?: boolean;
}

const CompressPdf = () => {
  const { toast } = useToast();
  const { files: vaultFiles, removeFile: removeVaultFile } = useFileVault();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState("");
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [method, setMethod] = useState<Method>("keep-text");
  const [level, setLevel] = useState<CompressLevel>("balanced");
  const [removeMetadata, setRemoveMetadata] = useState(false);
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
      if (method === "keep-text") {
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
  }, [pdfFile, method, level, removeMetadata, toast]);

  const saved = outcome ? Math.max(0, Math.round((1 - outcome.outputBytes / outcome.originalBytes) * 100)) : 0;

  const methodCard = (value: Method, icon: React.ReactNode, title: string, body: string, badge?: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={method === value}
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
                title="Upload PDF"
                description="Drag & drop or click to browse"
                buttonText="Select PDF"
                icon={<FileDown size={36} />}
              />
            ) : (
              <>
                <FilePreview files={[pdfFile]} fileType="pdf" previewUrls={pdfPreviewUrl ? [pdfPreviewUrl] : []} isLoadingPreview={isLoadingPreview} onRemoveAll={handleReset} />

                {!outcome && !busy && (
                  <div className="space-y-6 mb-6">
                    <fieldset>
                      <legend className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Method</legend>
                      <div role="radiogroup" className="grid gap-3">
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
                      <div role="radiogroup" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {(Object.keys(COMPRESS_PRESETS) as CompressLevel[]).map((key) => (
                          <button
                            key={key}
                            type="button"
                            role="radio"
                            aria-checked={level === key}
                            onClick={() => setLevel(key)}
                            className={`rounded-lg border p-3 text-left transition-colors ${level === key ? "border-brand bg-brand-tint" : "border-border hover:border-brand/50"}`}
                          >
                            <span className="block text-sm font-semibold text-foreground">{COMPRESS_PRESETS[key].label}</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">{COMPRESS_PRESETS[key].hint}</span>
                          </button>
                        ))}
                      </div>
                    </fieldset>

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

                {outcome && (
                  <div className="mb-6 rounded-lg border border-border p-4">
                    {outcome.unchanged ? (
                      <div className="flex gap-3">
                        <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-brand" />
                        <div className="text-sm">
                          <p className="font-semibold text-foreground">This PDF is already as small as it can be with {COMPRESS_PRESETS[level].label.toLowerCase()} settings.</p>
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
                    <Button onClick={handleCompress} className="bg-brand text-white hover:bg-brand-dark rounded-md font-semibold">
                      <FileDown size={15} className="mr-1" /> Compress PDF
                    </Button>
                  )}
                  {outcome && !outcome.unchanged && (
                    <Button onClick={() => downloadFile(outcome.file, outcome.file.name, "application/pdf")} className="bg-brand text-white hover:bg-brand-dark rounded-md font-semibold">
                      <Download size={15} className="mr-1" /> Download PDF
                    </Button>
                  )}
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
