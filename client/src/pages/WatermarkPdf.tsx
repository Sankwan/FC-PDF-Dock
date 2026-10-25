import { useState, useCallback } from "react";
import BackToTools from "@/components/BackToTools";
import FileUpload from "@/components/FileUpload";
import FilePreview from "@/components/FilePreview";
import { Stamp, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useFileVault } from "@/context/FileVault";
import { generateFilePreview, downloadFile } from "@/lib/fileUtils";
import { addWatermark } from "@/lib/pdfUtils";

const PRESETS = ["CONFIDENTIAL", "DRAFT", "FOR OFFICIAL USE ONLY", "CERTIFIED TRUE COPY", "COPY", "CANCELLED", "FORESTRY COMMISSION"];

const WatermarkPdf = () => {
  const { toast } = useToast();
  const { files: vaultFiles, removeFile: removeVaultFile } = useFileVault();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string>("");
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [watermarkText, setWatermarkText] = useState("CONFIDENTIAL");
  const [opacity, setOpacity] = useState(20);
  const [fontSize, setFontSize] = useState(48);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultFile, setResultFile] = useState<File | null>(null);

  const handlePdfSelected = useCallback(async (files: File[]) => {
    if (files.length > 0 && files[0].type === "application/pdf") {
      setPdfFile(files[0]);
      setPdfPreviewUrl("");
      setResultFile(null);
      setIsLoadingPreview(true);
      try {
        const url = await generateFilePreview(files[0]);
        setPdfPreviewUrl(url);
      } catch {
        // preview optional
      } finally {
        setIsLoadingPreview(false);
      }
    }
  }, []);

  const handleReset = useCallback(() => {
    // Also drop this file from the shared workspace vault — otherwise a
    // fresh FileUpload silently re-adopts the file we just finished with.
    vaultFiles.filter(vf => vf.file === pdfFile).forEach(vf => removeVaultFile(vf.id));
    setPdfFile(null);
    setIsLoadingPreview(false);
    setPdfPreviewUrl("");
    setResultFile(null);
    setProgress(0);
  }, [pdfFile, vaultFiles, removeVaultFile]);

  const handleProcess = useCallback(async () => {
    if (!pdfFile || !watermarkText.trim()) return;
    setIsProcessing(true);
    setProgress(0);

    try {
      const interval = setInterval(() => {
        setProgress(p => Math.min(p + 15, 85));
      }, 150);

      const result = await addWatermark(pdfFile, {
        text: watermarkText,
        opacity: opacity / 100,
        fontSize,
      });

      clearInterval(interval);
      setProgress(100);
      setResultFile(result);
      toast({ title: "Watermark added", description: "Your PDF has been watermarked successfully." });
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Failed", description: "Could not add watermark. Try a different PDF." });
    } finally {
      setIsProcessing(false);
    }
  }, [pdfFile, watermarkText, opacity, fontSize, toast]);

  const handleDownload = useCallback(() => {
    if (resultFile) downloadFile(resultFile, resultFile.name, "application/pdf");
  }, [resultFile]);

  return (
    <section className="py-10 bg-background min-h-[60vh]">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <BackToTools />
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-4 h-0.5 bg-brand" />
            <span className="text-brand text-xs font-semibold uppercase tracking-widest">Annotate</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground font-heading">Watermark PDF</h1>
          <p className="text-muted-foreground text-sm mt-1">Mark every page CONFIDENTIAL, DRAFT, CERTIFIED TRUE COPY or your own text</p>
        </div>

        <div className="max-w-2xl bg-card/90 backdrop-blur-sm border border-border rounded-xl shadow-sm">
          <div className="p-6">
            {!pdfFile ? (
              <FileUpload
                accept=".pdf,application/pdf"
                maxSizeInMB={100}
                multiple={false}
                onFilesSelected={handlePdfSelected}
                title="Choose a PDF"
                description="Drag & drop or click to browse"
                buttonText="Select PDF"
                icon={<Stamp size={36} />}
              />
            ) : (
              <>
                <FilePreview
                  files={[pdfFile]}
                  fileType="pdf"
                  previewUrls={pdfPreviewUrl ? [pdfPreviewUrl] : []}
                  isLoadingPreview={isLoadingPreview}
                  onRemoveAll={handleReset}
                />

                {!resultFile && !isProcessing && (
                  <div className="border border-border p-5 mb-5 bg-muted">
                    <h4 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wide">Watermark Options</h4>
                    <div className="space-y-5">
                      <div>
                        <Label htmlFor="wm-text" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Watermark Text</Label>
                        <Input
                          id="wm-text"
                          value={watermarkText}
                          onChange={(e) => setWatermarkText(e.target.value)}
                          placeholder="e.g. CONFIDENTIAL, DRAFT, SAMPLE"
                          className="mt-1 border-border focus:border-brand focus:ring-0"
                        />
                        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Common watermarks">
                          {PRESETS.map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setWatermarkText(p)}
                              aria-pressed={watermarkText === p}
                              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide transition-colors ${
                                watermarkText === p ? "border-brand bg-brand text-white" : "border-border bg-card text-muted-foreground hover:border-brand hover:text-brand"
                              }`}
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Opacity</Label>
                          <span className="text-xs text-muted-foreground font-mono">{opacity}%</span>
                        </div>
                        <Slider
                          min={5}
                          max={60}
                          step={1}
                          value={[opacity]}
                          onValueChange={(v) => setOpacity(v[0])}
                        />
                        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                          <span>Subtle (5%)</span>
                          <span>Prominent (60%)</span>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Font Size</Label>
                          <span className="text-xs text-muted-foreground font-mono">{fontSize}pt</span>
                        </div>
                        <Slider
                          min={20}
                          max={80}
                          step={2}
                          value={[fontSize]}
                          onValueChange={(v) => setFontSize(v[0])}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {isProcessing && (
                  <div className="mb-5">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Adding watermark...</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <Progress value={progress} className="h-1.5" />
                  </div>
                )}

                {resultFile && (
                  <Alert className="bg-background border border-foreground mb-5">
                    <AlertDescription className="flex items-center gap-2 text-foreground text-sm">
                      <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                      </svg>
                      <span><strong>Done.</strong> Watermark "{watermarkText}" applied to all pages.</span>
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex flex-col sm:flex-row gap-3">
                  {!resultFile && !isProcessing && (
                    <Button
                      onClick={handleProcess}
                      disabled={!watermarkText.trim()}
                      className="bg-brand text-white hover:bg-brand-dark rounded-md font-semibold"
                    >
                      <Stamp size={15} className="mr-2" /> Add Watermark
                    </Button>
                  )}
                  {resultFile && (
                    <Button
                      onClick={handleDownload}
                      className="bg-brand text-white hover:bg-brand-dark rounded-md font-semibold"
                    >
                      <Download size={15} className="mr-2" /> Download PDF
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={handleReset}
                    className="border-border text-foreground hover:bg-background rounded-md"
                  >
                    {resultFile ? "Watermark Another" : "Reset"}
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

export default WatermarkPdf;
