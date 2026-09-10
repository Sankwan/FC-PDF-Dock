import { useState, useCallback } from "react";
import BackToTools from "@/components/BackToTools";
import FileUpload from "@/components/FileUpload";
import FilePreview from "@/components/FilePreview";
import { ScanText, Download, Copy, Check, FileType } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useFileVault } from "@/context/FileVault";
import { generateFilePreview, downloadFile, createTextDocx } from "@/lib/fileUtils";
import { makeSearchablePdf } from "@/lib/ocrUtils";

const OcrPdf = () => {
  const { toast } = useToast();
  const { files: vaultFiles, removeFile: removeVaultFile } = useFileVault();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string>("");
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [quality, setQuality] = useState<"fast" | "balanced" | "accurate">("balanced");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [result, setResult] = useState<{ file: File; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const handlePdfSelected = useCallback(async (files: File[]) => {
    if (files.length > 0 && files[0].type === "application/pdf") {
      setPdfFile(files[0]);
      setPdfPreviewUrl("");
      setIsLoadingPreview(true);
      try {
        setPdfPreviewUrl(await generateFilePreview(files[0]));
        setShowOptions(true);
        setResult(null);
      } catch (error) {
        toast({ variant: "destructive", title: "Preview failed", description: error instanceof Error ? error.message : "The PDF could not be rendered." });
      } finally {
        setIsLoadingPreview(false);
      }
    } else {
      toast({ variant: "destructive", title: "Invalid file", description: "Please select a PDF file." });
    }
  }, [toast]);

  const handleReset = useCallback(() => {
    // Also drop this file from the shared workspace vault — otherwise a
    // fresh FileUpload silently re-adopts the file we just finished with.
    vaultFiles.filter(vf => vf.file === pdfFile).forEach(vf => removeVaultFile(vf.id));
    setPdfFile(null);
    setPdfPreviewUrl("");
    setIsLoadingPreview(false);
    setShowOptions(false);
    setIsProcessing(false);
    setProgress(0);
    setStatusText("");
    setResult(null);
    setCopied(false);
    setQuality("balanced");
  }, [pdfFile, vaultFiles, removeVaultFile]);

  const handleCopyText = useCallback(async () => {
    if (!result?.text) return;
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ variant: "destructive", title: "Copy failed", description: "Your browser blocked clipboard access." });
    }
  }, [result, toast]);

  const handleDownloadTxt = useCallback(() => {
    if (!result) return;
    downloadFile(result.text, result.file.name.replace(/\.pdf$/i, "") + ".txt", "text/plain");
  }, [result]);

  const handleDownloadDocx = useCallback(async () => {
    if (!result) return;
    try {
      const blob = await createTextDocx(result.text);
      downloadFile(blob, result.file.name.replace(/\.pdf$/i, "") + ".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    } catch {
      toast({ variant: "destructive", title: "Could not build .docx" });
    }
  }, [result, toast]);

  const scaleForQuality = { fast: 1.5, balanced: 2.5, accurate: 3.5 } as const;

  const handleRun = useCallback(async () => {
    if (!pdfFile) return;
    setIsProcessing(true);
    setProgress(0);
    setStatusText("Loading OCR engine (first run downloads ~9MB, cached after)");
    try {
      const outcome = await makeSearchablePdf(pdfFile, {
        scale: scaleForQuality[quality],
        onProgress: (done, total, status) => {
          setStatusText(`Page ${Math.min(done + 1, total)} of ${total} — ${status}`);
          setProgress(Math.max(5, Math.round((done / total) * 95)));
        },
      });
      setProgress(100);
      setResult(outcome);
      toast({ title: "OCR complete", description: `${pdfFile.name} is now searchable.` });
    } catch (error) {
      toast({ variant: "destructive", title: "OCR failed", description: error instanceof Error ? error.message : undefined });
    } finally {
      setIsProcessing(false);
    }
  }, [pdfFile, quality, toast]);

  const qualityOptions = [
    { value: "fast", label: "Fast", desc: "Lower resolution, quickest" },
    { value: "balanced", label: "Balanced", desc: "Good accuracy/speed" },
    { value: "accurate", label: "Accurate", desc: "Best for small text" },
  ] as const;

  return (
    <section className="py-10 bg-background min-h-[60vh]">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <BackToTools />
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-4 h-0.5 bg-brand" />
            <span className="text-brand text-xs font-semibold uppercase tracking-widest">Recognize</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground font-heading">OCR PDF</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Make a scanned PDF searchable and selectable. Runs a local OCR model entirely in your browser — no file or text ever leaves your device.
          </p>
        </div>

        <div className="max-w-2xl bg-card/90 backdrop-blur-sm border border-border rounded-xl shadow-sm">
          <div className="p-6">
            {!pdfFile ? (
              <FileUpload
                accept=".pdf,application/pdf"
                maxSizeInMB={100}
                multiple={false}
                onFilesSelected={handlePdfSelected}
                title="Upload Scanned PDF"
                description="Drag & drop or click to browse"
                buttonText="Select PDF"
                icon={<ScanText size={36} />}
              />
            ) : (
              <>
                <FilePreview files={[pdfFile]} fileType="pdf" previewUrls={pdfPreviewUrl ? [pdfPreviewUrl] : []} isLoadingPreview={isLoadingPreview} onRemoveAll={handleReset} className="mb-5" />

                {showOptions && !result && !isProcessing && (
                  <div className="border border-border p-5 mb-5 bg-muted">
                    <h4 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wide">OCR Quality</h4>
                    <RadioGroup value={quality} onValueChange={(v: "fast" | "balanced" | "accurate") => setQuality(v)} className="grid grid-cols-3 gap-3">
                      {qualityOptions.map(opt => (
                        <div key={opt.value}>
                          <RadioGroupItem value={opt.value} id={`${opt.value}-ocr`} className="peer hidden" />
                          <Label
                            htmlFor={`${opt.value}-ocr`}
                            className={`border p-3 text-center block cursor-pointer transition-colors text-sm ${
                              quality === opt.value
                                ? "border-brand bg-brand-tint text-brand"
                                : "border-border bg-card text-muted-foreground hover:border-brand hover:bg-brand-tint"
                            }`}
                          >
                            <div className="font-semibold mb-0.5">{opt.label}</div>
                            <div className="text-[10px] leading-tight opacity-75">{opt.desc}</div>
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                    <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                      First run on this device downloads the local OCR model (~9MB) once; it's cached offline afterward. Best for scanned/photographed text — pages that already contain real text don't need this.
                    </p>
                  </div>
                )}

                {isProcessing && (
                  <div className="mb-5">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1"><span>{statusText || "Processing..."}</span><span>{Math.round(progress)}%</span></div>
                    <Progress value={progress} className="h-1.5" />
                  </div>
                )}

                {result && (
                  <div>
                    <Alert className="bg-background border border-foreground mb-5">
                      <AlertDescription className="flex items-center gap-2 text-foreground text-sm">
                        <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                        <span><strong>Done.</strong> PDF is now searchable.</span>
                      </AlertDescription>
                    </Alert>

                    {result.text.trim() && (
                      <div className="mb-5 border border-border bg-muted">
                        <div className="flex items-center justify-between px-3 pt-3">
                          <div className="text-xs text-muted-foreground uppercase tracking-wide">Recognized text</div>
                          <button
                            onClick={handleCopyText}
                            className="flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-dark transition-colors"
                          >
                            {copied ? <Check size={13} /> : <Copy size={13} />}
                            {copied ? "Copied" : "Copy"}
                          </button>
                        </div>
                        <p className="p-3 text-xs text-muted-foreground whitespace-pre-wrap max-h-40 overflow-y-auto">{result.text.slice(0, 2000)}</p>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-3 mb-3">
                      <Button onClick={() => downloadFile(result.file, result.file.name, "application/pdf")} className="bg-brand text-white hover:bg-brand-dark rounded-none font-semibold">
                        <Download size={15} className="mr-2" /> Download Searchable PDF
                      </Button>
                      <Button variant="outline" onClick={handleReset} className="border-border text-foreground hover:bg-background rounded-none">
                        OCR Another
                      </Button>
                    </div>

                    {result.text.trim() && (
                      <div className="flex flex-col sm:flex-row gap-3">
                        <Button variant="outline" onClick={handleDownloadTxt} className="border-border text-foreground hover:bg-background rounded-none">
                          <FileType size={15} className="mr-2" /> Download .txt
                        </Button>
                        <Button variant="outline" onClick={handleDownloadDocx} className="border-border text-foreground hover:bg-background rounded-none">
                          <FileType size={15} className="mr-2" /> Download .docx
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {showOptions && !result && !isProcessing && (
                  <div className="flex flex-col sm:flex-row gap-3 mt-2">
                    <Button onClick={handleRun} className="bg-brand text-white hover:bg-brand-dark rounded-none font-semibold">
                      Run OCR
                    </Button>
                    <Button variant="outline" onClick={handleReset} className="border-border text-foreground hover:bg-background rounded-none">
                      Reset
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default OcrPdf;
