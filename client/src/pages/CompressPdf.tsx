import { useState, useCallback } from "react";
import BackToTools from "@/components/BackToTools";
import FileUpload from "@/components/FileUpload";
import FilePreview from "@/components/FilePreview";
import { FileDown, Download, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useFileVault } from "@/context/FileVault";
import { generateFilePreview, downloadFile, formatFileSize } from "@/lib/fileUtils";
import { compressPdf } from "@/lib/pdfUtils";

const CompressPdf = () => {
  const { toast } = useToast();
  const { files: vaultFiles, removeFile: removeVaultFile } = useFileVault();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string>("");
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [compressionLevel, setCompressionLevel] = useState<"low" | "medium" | "high">("medium");
  const [compressImages, setCompressImages] = useState(true);
  const [removeMetadata, setRemoveMetadata] = useState(false);
  const [optimizeFonts, setOptimizeFonts] = useState(true);
  const [isCompressing, setIsCompressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [targetSizeKB, setTargetSizeKB] = useState("");
  const [outputName, setOutputName] = useState("");
  const [compressedPreviewUrl, setCompressedPreviewUrl] = useState("");
  const [compressedPdf, setCompressedPdf] = useState<{ file: File; originalSize: string; compressedSize: string; savingsPercent: number } | null>(null);

  const handlePdfSelected = useCallback(async (files: File[]) => {
    if (files.length > 0 && files[0].type === "application/pdf") {
      setPdfFile(files[0]);
      setPdfPreviewUrl("");
      setOutputName(`${files[0].name.replace(/\.pdf$/i, "")}_compressed.pdf`);
      setIsLoadingPreview(true);
      try {
        const url = await generateFilePreview(files[0]);
        setPdfPreviewUrl(url);
        setShowOptions(true);
        setIsCompressing(false);
        setProgress(0);
        setCompressedPdf(null);
      } catch (error) {
        console.error("PDF preview failed", error);
        toast({ variant: "destructive", title: "Preview failed", description: error instanceof Error ? error.message : "The PDF could not be rendered." });
      } finally {
        setIsLoadingPreview(false);
      }
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
    setIsCompressing(false);
    setProgress(0);
    setCompressedPdf(null);
    setCompressedPreviewUrl("");
    setTargetSizeKB("");
    setOutputName("");
    setCompressionLevel("medium");
    setCompressImages(true);
    setRemoveMetadata(false);
    setOptimizeFonts(true);
  }, [pdfFile, vaultFiles, removeVaultFile]);

  const handleCompress = useCallback(async () => {
    if (!pdfFile) return;
    setIsCompressing(true);
    setProgress(0);
    try {
      const interval = setInterval(() => setProgress(p => Math.min(p + Math.random() * 5, 90)), 200);
      const target = Number(targetSizeKB);
      const compressed = await compressPdf(pdfFile, {
        quality: compressionLevel,
        removeMetadata,
        targetSizeKB: Number.isFinite(target) && target > 0 ? target : undefined,
        onProgress: (done, total) => setProgress(Math.max(5, Math.round((done / total) * 95))),
      });
      clearInterval(interval);
      setProgress(100);
      const savings = Math.round((1 - compressed.size / pdfFile.size) * 100);
      setCompressedPdf({ file: compressed, originalSize: formatFileSize(pdfFile.size), compressedSize: formatFileSize(compressed.size), savingsPercent: savings });
      try {
        setCompressedPreviewUrl(await generateFilePreview(compressed));
      } catch {
        setCompressedPreviewUrl("");
      }
      toast({ title: "Compression complete", description: `Reduced by ${savings}%` });
    } catch {
      setIsCompressing(false);
      toast({ variant: "destructive", title: "Compression failed" });
    }
  }, [pdfFile, compressionLevel, removeMetadata, targetSizeKB, toast]);

  const compressionOptions = [
    { value: "low", label: "Low", desc: "High quality, minimal compression" },
    { value: "medium", label: "Medium", desc: "Balanced quality and size" },
    { value: "high", label: "High", desc: "Smaller file, lower quality" },
  ] as const;

  return (
    <section className="min-h-[70vh] bg-background py-8 sm:py-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <BackToTools />
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-4 h-0.5 bg-brand" />
            <span className="text-brand text-xs font-semibold uppercase tracking-widest">Optimize</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground font-heading">Compress PDF</h1>
          <p className="text-muted-foreground text-sm mt-1">Reduce PDF file size while preserving readability</p>
        </div>

        <div className="max-w-4xl rounded-[28px] border border-white/80 bg-card/65 shadow-[0_30px_90px_-60px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
          <div className="p-6">
            {!pdfFile ? (
              <FileUpload
                accept=".pdf,application/pdf"
                maxSizeInMB={100}
                multiple={false}
                onFilesSelected={handlePdfSelected}
                title="Upload PDF to Compress"
                description="Drag & drop or click to browse"
                buttonText="Select PDF"
                icon={<FileDown size={36} />}
              />
            ) : (
              <>
                <FilePreview files={[pdfFile]} fileType="pdf" previewUrls={pdfPreviewUrl ? [pdfPreviewUrl] : []} isLoadingPreview={isLoadingPreview} onRemoveAll={handleReset} className="mb-5" />

                {showOptions && !compressedPdf && !isCompressing && (
                  <div className="border border-border p-5 mb-5 bg-muted">
                    <h4 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wide">Compression Options</h4>
                    <div className="mb-5">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-3">Compression Level</Label>
                      <RadioGroup value={compressionLevel} onValueChange={(v: "low" | "medium" | "high") => setCompressionLevel(v)} className="grid grid-cols-3 gap-3">
                        {compressionOptions.map(opt => (
                          <div key={opt.value}>
                            <RadioGroupItem value={opt.value} id={`${opt.value}-compression`} className="peer hidden" />
                            <Label
                              htmlFor={`${opt.value}-compression`}
                              className={`border p-3 text-center block cursor-pointer transition-colors text-sm ${
                                compressionLevel === opt.value
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
                    </div>
                    <div className="space-y-2.5">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-2">Advanced</Label>
                      {[
                        { id: "compress-images", state: compressImages, setter: setCompressImages, label: "Compress embedded images" },
                        { id: "remove-metadata", state: removeMetadata, setter: setRemoveMetadata, label: "Remove document metadata" },
                        { id: "optimize-fonts", state: optimizeFonts, setter: setOptimizeFonts, label: "Optimize fonts" },
                      ].map(item => (
                        <div key={item.id} className="flex items-center gap-2">
                          <Checkbox
                            id={item.id}
                            checked={item.state}
                            onCheckedChange={v => item.setter(v as boolean)}
                            className="border-border data-[state=checked]:bg-brand data-[state=checked]:border-brand"
                          />
                          <Label htmlFor={item.id} className="text-sm text-muted-foreground cursor-pointer">{item.label}</Label>
                        </div>
                      ))}
                    </div>
                    <div className="mt-5 grid gap-4 border-t border-black/[0.06] pt-5 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="target-size" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Target size (optional)</Label>
                        <div className="relative mt-1.5">
                          <Gauge size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                          <input id="target-size" inputMode="numeric" min="1" value={targetSizeKB} onChange={(event) => setTargetSizeKB(event.target.value.replace(/\D/g, ""))} placeholder="e.g. 50" className="h-10 w-full rounded-xl border border-border bg-card/80 pl-9 pr-12 text-sm outline-none transition focus:border-brand" />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">KB</span>
                        </div>
                        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">Best-effort target; complex pages may need more space to stay readable.</p>
                      </div>
                      <div>
                        <Label htmlFor="output-name" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Output name</Label>
                        <input id="output-name" value={outputName} onChange={(event) => setOutputName(event.target.value)} className="mt-1.5 h-10 w-full rounded-xl border border-border bg-card/80 px-3 text-sm outline-none transition focus:border-brand" />
                        <p className="mt-1.5 text-[11px] text-muted-foreground">Rename the PDF before downloading it.</p>
                      </div>
                    </div>
                  </div>
                )}

                {isCompressing && !compressedPdf && (
                  <div className="mb-5">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1"><span>Compressing...</span><span>{Math.round(progress)}%</span></div>
                    <Progress value={progress} className="h-1.5" />
                  </div>
                )}

                {compressedPdf && (
                  <div>
                    <Alert className="bg-background border border-foreground mb-5">
                      <AlertDescription className="flex items-center gap-2 text-foreground text-sm">
                        <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                        <span><strong>Done.</strong> Reduced by {compressedPdf.savingsPercent}%</span>
                      </AlertDescription>
                    </Alert>

                    <div className="border border-border mb-5 grid grid-cols-2 gap-px bg-border">
                      <div className="bg-muted p-4 text-center">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Original</div>
                        <div className="text-xl font-bold text-foreground">{compressedPdf.originalSize}</div>
                      </div>
                      <div className="bg-background p-4 text-center">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Compressed</div>
                        <div className="text-xl font-bold text-brand">{compressedPdf.compressedSize}</div>
                      </div>
                    </div>

                    <FilePreview files={[compressedPdf.file]} fileType="pdf" previewUrls={compressedPreviewUrl ? [compressedPreviewUrl] : []} showControls={false} className="mb-5" />

                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button onClick={() => downloadFile(compressedPdf.file, outputName.trim() || compressedPdf.file.name, "application/pdf")} className="rounded-xl bg-brand text-white hover:bg-brand-dark font-semibold">
                        <Download size={15} className="mr-2" /> Download Compressed
                      </Button>
                      <Button variant="outline" onClick={handleReset} className="rounded-xl border-border text-foreground hover:bg-background">
                        Compress Another
                      </Button>
                    </div>
                  </div>
                )}

                {showOptions && !compressedPdf && !isCompressing && (
                  <div className="flex flex-col sm:flex-row gap-3 mt-2">
                    <Button onClick={handleCompress} disabled={!pdfFile} className="rounded-xl bg-brand text-white hover:bg-brand-dark font-semibold">
                      Compress PDF
                    </Button>
                    <Button variant="outline" onClick={handleReset} className="rounded-xl border-border text-foreground hover:bg-background">
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

export default CompressPdf;
