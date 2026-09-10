import { useState, useCallback } from "react";
import BackToTools from "@/components/BackToTools";
import FileUpload from "@/components/FileUpload";
import FilePreview from "@/components/FilePreview";
import { FileText, Download } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useFileVault } from "@/context/FileVault";
import { generateFilePreview, downloadFile } from "@/lib/fileUtils";
import { convertPdfToImages } from "@/lib/pdfUtils";

const PdfToImage = () => {
  const { toast } = useToast();
  const { files: vaultFiles, removeFile: removeVaultFile } = useFileVault();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string>("");
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [convertingStatus, setConvertingStatus] = useState<"idle" | "converting" | "complete">("idle");
  const [progress, setProgress] = useState(0);
  const [convertedImages, setConvertedImages] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [pageRange, setPageRange] = useState<"all" | "custom">("all");
  const [customRange, setCustomRange] = useState<string>("");
  const [imageFormat, setImageFormat] = useState<"jpg" | "png" | "webp">("jpg");
  const [imageQuality, setImageQuality] = useState<"high" | "medium" | "low">("medium");

  const handlePdfSelected = useCallback(async (files: File[]) => {
    if (files.length > 0 && files[0].type === "application/pdf") {
      setPdfFile(files[0]);
      setPdfPreviewUrl("");
      setIsLoadingPreview(true);
      try {
        const previewUrl = await generateFilePreview(files[0]);
        setPdfPreviewUrl(previewUrl);
        setShowOptions(true);
        setConvertingStatus("idle");
        setProgress(0);
      } catch {
        toast({ variant: "destructive", title: "Preview failed", description: "Could not preview this PDF." });
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
    setConvertingStatus("idle");
    setProgress(0);
    setConvertedImages([]);
    setImagePreviewUrls([]);
    setPageRange("all");
    setCustomRange("");
  }, [pdfFile, vaultFiles, removeVaultFile]);

  const handleConvert = useCallback(async () => {
    if (!pdfFile) return;
    setConvertingStatus("converting");
    setProgress(0);
    try {
      let pagesToConvert: number[] | "all" = "all";
      if (pageRange === "custom" && customRange.trim()) {
        pagesToConvert = [];
        for (const range of customRange.split(",")) {
          const t = range.trim();
          if (t.includes("-")) {
            const [s, e] = t.split("-").map(n => parseInt(n.trim(), 10));
            if (!isNaN(s) && !isNaN(e) && s <= e) for (let i = s; i <= e; i++) (pagesToConvert as number[]).push(i);
          } else {
            const p = parseInt(t, 10);
            if (!isNaN(p)) (pagesToConvert as number[]).push(p);
          }
        }
        if ((pagesToConvert as number[]).length === 0) pagesToConvert = "all";
      }
      const qualityMap = { high: 0.9, medium: 0.7, low: 0.5 };
      const interval = setInterval(() => setProgress(p => Math.min(p + 5, 90)), 200);
      const images = await convertPdfToImages(pdfFile, { format: imageFormat, quality: qualityMap[imageQuality], pages: pagesToConvert, scale: 2 });
      clearInterval(interval);
      setProgress(100);
      setConvertedImages(images);
      const urls = await Promise.all(images.map(img => generateFilePreview(img)));
      setImagePreviewUrls(urls);
      setConvertingStatus("complete");
      toast({ title: "Done", description: `${images.length} pages converted.` });
    } catch {
      setConvertingStatus("idle");
      toast({ variant: "destructive", title: "Conversion failed", description: "An error occurred. Please try again." });
    }
  }, [pdfFile, pageRange, customRange, imageFormat, imageQuality, toast]);

  const handleDownloadAll = async () => {
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      for (const f of convertedImages) zip.file(f.name, await f.arrayBuffer());
      const zipBlob = await zip.generateAsync({ type: "blob" });
      downloadFile(zipBlob, `${pdfFile?.name?.replace(".pdf", "")}_images.zip`, "application/zip");
      toast({ title: "Download started" });
    } catch {
      toast({ variant: "destructive", title: "Download failed" });
    }
  };

  return (
    <section className="py-10 bg-background min-h-[60vh]">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <BackToTools />
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-4 h-0.5 bg-brand" />
            <span className="text-brand text-xs font-semibold uppercase tracking-widest">Convert</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground font-heading">PDF to Image</h1>
          <p className="text-muted-foreground text-sm mt-1">Convert PDF pages to high-quality JPG, PNG, or WebP images</p>
        </div>

        <div className="max-w-2xl bg-card/90 backdrop-blur-sm border border-border rounded-xl shadow-sm">
          <div className="p-6">
            {!pdfFile ? (
              <FileUpload
                accept=".pdf,application/pdf"
                maxSizeInMB={50}
                multiple={false}
                onFilesSelected={handlePdfSelected}
                title="Upload PDF File"
                description="Drag & drop or click to browse"
                buttonText="Select PDF"
                icon={<FileText size={36} />}
              />
            ) : (
              <>
                <FilePreview files={[pdfFile]} fileType="pdf" previewUrls={pdfPreviewUrl ? [pdfPreviewUrl] : []} isLoadingPreview={isLoadingPreview} onRemoveAll={handleReset} className="mb-5" />

                {showOptions && convertingStatus === "idle" && (
                  <div className="border border-border p-5 mb-5 bg-muted">
                    <h4 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wide">Conversion Options</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div>
                        <Label htmlFor="image-format" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Format</Label>
                        <Select value={imageFormat} onValueChange={(v: "jpg" | "png" | "webp") => setImageFormat(v)}>
                          <SelectTrigger id="image-format" className="mt-1 border-border"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="jpg">JPG</SelectItem>
                            <SelectItem value="png">PNG</SelectItem>
                            <SelectItem value="webp">WebP</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="image-quality" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quality</Label>
                        <Select value={imageQuality} onValueChange={(v: "high" | "medium" | "low") => setImageQuality(v)}>
                          <SelectTrigger id="image-quality" className="mt-1 border-border"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="low">Low</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-2">Page Range</Label>
                      <RadioGroup value={pageRange} onValueChange={(v: "all" | "custom") => setPageRange(v)} className="flex gap-4">
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="all" id="all-pages" />
                          <Label htmlFor="all-pages" className="text-sm cursor-pointer">All Pages</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="custom" id="custom-range" />
                          <Label htmlFor="custom-range" className="text-sm cursor-pointer">Custom Range</Label>
                        </div>
                      </RadioGroup>
                      {pageRange === "custom" && (
                        <div className="mt-2">
                          <Input placeholder="e.g., 1-3, 5, 7-9" value={customRange} onChange={e => setCustomRange(e.target.value)} className="border-border" />
                          <p className="text-xs text-muted-foreground mt-1">Comma-separated or range (e.g. 1-3, 5)</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {convertingStatus === "converting" && (
                  <div className="mb-5">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1"><span>Converting...</span><span>{progress}%</span></div>
                    <Progress value={progress} className="h-1.5" />
                  </div>
                )}

                {convertingStatus === "complete" && convertedImages.length > 0 && (
                  <div>
                    <Alert className="bg-background border border-foreground mb-5">
                      <AlertDescription className="flex items-center gap-2 text-foreground text-sm">
                        <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                        <span><strong>Done.</strong> {convertedImages.length} pages converted.</span>
                      </AlertDescription>
                    </Alert>
                    <div className="border border-border mb-5">
                      <div className="bg-background px-4 py-2.5 border-b border-border">
                        <h4 className="text-sm font-medium text-foreground">Generated Images</h4>
                      </div>
                      <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {convertedImages.map((img, i) => (
                          <div key={i} className="border border-border overflow-hidden">
                            <img src={imagePreviewUrls[i]} alt={`Page ${i + 1}`} className="w-full h-auto" />
                            <div className="bg-card p-2 flex justify-between items-center border-t border-border">
                              <span className="text-xs text-muted-foreground truncate max-w-[80px]">{img.name}</span>
                              <button onClick={() => downloadFile(img, img.name, img.type)} className="text-xs text-brand hover:text-brand-dark font-medium flex items-center gap-1">
                                <Download size={12} /> Save
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button onClick={handleDownloadAll} className="bg-brand text-white hover:bg-brand-dark rounded-none font-semibold">
                        <Download size={15} className="mr-2" /> Download All (.zip)
                      </Button>
                      <Button variant="outline" onClick={handleReset} className="border-border text-foreground hover:bg-background rounded-none">
                        Convert Another
                      </Button>
                    </div>
                  </div>
                )}

                {convertingStatus === "idle" && (
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button onClick={handleConvert} disabled={!pdfFile} className="bg-brand text-white hover:bg-brand-dark rounded-none font-semibold">
                      Convert to Images
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

export default PdfToImage;
