import { useState, useCallback, useRef } from "react";
import BackToTools from "@/components/BackToTools";
import FileUpload from "@/components/FileUpload";
import FilePreview from "@/components/FilePreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Download, Images } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useFileVault } from "@/context/FileVault";
import { generateFilePreview, downloadFile } from "@/lib/fileUtils";
import { convertImagesToPdf, rotateImage } from "@/lib/imageUtils";
import { IMAGE_ACCEPT, IMAGE_LIMITS, decodeImagePages } from "@/lib/addons/images";

const ImageToPdf = () => {
  const { toast } = useToast();
  const { files: vaultFiles, removeFile: removeVaultFile } = useFileVault();
  const originalFiles = useRef<File[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [pageSize, setPageSize] = useState<"a4" | "letter" | "legal" | "custom">("a4");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [quality, setQuality] = useState<number>(80);
  const [customWidth, setCustomWidth] = useState<number>(210);
  const [customHeight, setCustomHeight] = useState<number>(297);
  const [filename, setFilename] = useState<string>("images.pdf");
  const [pdfResult, setPdfResult] = useState<{ file: File; size: string } | null>(null);
  const [isConverting, setIsConverting] = useState(false);

  const handleImagesSelected = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setIsLoadingPreview(true); setPdfResult(null);
    try {
      const pages = await decodeImagePages(files);
      const urls = await Promise.all(pages.map(f => generateFilePreview(f)));
      originalFiles.current = files;
      setImageFiles(pages); setImagePreviewUrls(urls); setShowOptions(true);
    } catch (error) {
      toast({ variant: "destructive", title: "Could not open images", description: error instanceof Error ? error.message : undefined });
    } finally { setIsLoadingPreview(false); }
  }, [toast]);

  const handleAddMoreImages = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = IMAGE_ACCEPT; input.multiple = true;
    input.onchange = async () => {
      const added = Array.from(input.files || []);
      if (!added.length) return;
      setIsLoadingPreview(true); setPdfResult(null);
      try {
        // Recheck the whole selection so successive additions cannot bypass the total budget.
        const originals = [...originalFiles.current, ...added];
        const fresh = await decodeImagePages(added);
        if (imageFiles.length + fresh.length > IMAGE_LIMITS.pages) throw new Error("Use 100 image pages or fewer.");
        const totalPixels = await Promise.all([...imageFiles, ...fresh].map(async file => {
          const bitmap = await createImageBitmap(file);
          try { return bitmap.width * bitmap.height; } finally { bitmap.close(); }
        }));
        if (totalPixels.reduce((a, b) => a + b, 0) > IMAGE_LIMITS.totalPixels) throw new Error("The selection exceeds 80 megapixels in total.");
        const newUrls = await Promise.all(fresh.map(f => generateFilePreview(f)));
        originalFiles.current = originals;
        setImageFiles(prev => [...prev, ...fresh]); setImagePreviewUrls(prev => [...prev, ...newUrls]);
      } catch (error) {
        toast({ variant: "destructive", title: "Could not add images", description: error instanceof Error ? error.message : undefined });
      } finally { setIsLoadingPreview(false); }
    };
    input.click();
  }, [imageFiles, toast]);

  const handleRemoveImage = useCallback((index: number) => {
    setPdfResult(null);
    setImageFiles(p => p.filter((_, i) => i !== index));
    setImagePreviewUrls(p => p.filter((_, i) => i !== index));
  }, []);

  const handleClearImages = useCallback(() => {
    // Also drop these files from the shared workspace vault — otherwise a
    // fresh FileUpload silently re-adopts the files we just finished with.
    vaultFiles.filter(vf => originalFiles.current.includes(vf.file)).forEach(vf => removeVaultFile(vf.id));
    originalFiles.current = [];
    setImageFiles([]);
    setImagePreviewUrls([]);
    setIsLoadingPreview(false);
    setShowOptions(false);
    setPdfResult(null);
  }, [imageFiles, vaultFiles, removeVaultFile]);

  const handleRotateImage = useCallback(async (index: number) => {
    try {
      const rotated = await rotateImage(imageFiles[index], 90);
      const newFiles = [...imageFiles];
      newFiles[index] = rotated;
      setImageFiles(newFiles);
      setPdfResult(null);
      const newUrl = await generateFilePreview(rotated);
      const newUrls = [...imagePreviewUrls];
      newUrls[index] = newUrl;
      setImagePreviewUrls(newUrls);
      toast({ title: "Rotated 90°" });
    } catch {
      toast({ variant: "destructive", title: "Rotation failed" });
    }
  }, [imageFiles, imagePreviewUrls, toast]);

  const handleConvertToPdf = useCallback(async () => {
    if (imageFiles.length === 0 || isLoadingPreview) return;
    setIsConverting(true);
    try {
      const pdfFile = await convertImagesToPdf(imageFiles, {
        pageSize, orientation, quality: quality / 100,
        customWidth: pageSize === "custom" ? customWidth : undefined,
        customHeight: pageSize === "custom" ? customHeight : undefined,
        filename: filename || "images.pdf",
      });
      setPdfResult({ file: pdfFile, size: `${(pdfFile.size / 1024 / 1024).toFixed(2)} MB` });
      toast({ title: "PDF created", description: "Your images have been combined into a PDF." });
    } catch {
      toast({ variant: "destructive", title: "Conversion failed" });
    } finally {
      setIsConverting(false);
    }
  }, [imageFiles, isLoadingPreview, pageSize, orientation, quality, customWidth, customHeight, filename, toast]);

  return (
    <section className="py-10 bg-background min-h-[60vh]">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <BackToTools />
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-4 h-0.5 bg-brand" />
            <span className="text-brand text-xs font-semibold uppercase tracking-widest">Convert</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground font-heading">Image to PDF</h1>
          <p className="text-muted-foreground text-sm mt-1">Combine photos and image files into a PDF. TIFF and HEIC images can add multiple pages.</p>
        </div>

        <div className="max-w-2xl bg-card/90 backdrop-blur-sm border border-border rounded-xl shadow-sm">
          <fieldset className="min-w-0 p-6" disabled={isConverting || isLoadingPreview}>
            {isLoadingPreview && imageFiles.length === 0 ? <p role="status" className="text-sm">Opening image pages on this device…</p> : imageFiles.length === 0 ? (
              <FileUpload
                accept={IMAGE_ACCEPT}
                maxSizeInMB={20}
                multiple
                onFilesSelected={handleImagesSelected}
                title="Choose images"
                description="JPG, PNG, WebP, BMP, GIF, TIFF, HEIC/HEIF and browser-supported AVIF. Animated GIFs use the first frame."
                buttonText="Select Images"
                icon={<Images size={36} />}
              />
            ) : (
              <>
                <FilePreview
                  files={imageFiles} fileType="image" previewUrls={imagePreviewUrls}
                  isLoadingPreview={isLoadingPreview}
                  onRemove={handleRemoveImage} onRemoveAll={handleClearImages}
                  onRotate={handleRotateImage} onAddMore={handleAddMoreImages}
                  className="mb-5"
                />

                {showOptions && !pdfResult && (
                  <div className="border border-border p-5 mb-5 bg-muted">
                    <h4 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wide">PDF Options</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div>
                        <Label htmlFor="page-size" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Page Size</Label>
                        <Select value={pageSize} onValueChange={(v: "a4" | "letter" | "legal" | "custom") => setPageSize(v)}>
                          <SelectTrigger id="page-size" className="mt-1 border-border"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="a4">A4</SelectItem>
                            <SelectItem value="letter">Letter</SelectItem>
                            <SelectItem value="legal">Legal</SelectItem>
                            <SelectItem value="custom">Custom</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="orientation" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Orientation</Label>
                        <Select value={orientation} onValueChange={(v: "portrait" | "landscape") => setOrientation(v)}>
                          <SelectTrigger id="orientation" className="mt-1 border-border"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="portrait">Portrait</SelectItem>
                            <SelectItem value="landscape">Landscape</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {pageSize === "custom" && (
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <Label htmlFor="custom-width" className="text-xs font-semibold text-muted-foreground">Width (mm)</Label>
                          <Input id="custom-width" type="number" value={customWidth} onChange={e => setCustomWidth(Number(e.target.value))} min={1} className="mt-1 border-border" />
                        </div>
                        <div>
                          <Label htmlFor="custom-height" className="text-xs font-semibold text-muted-foreground">Height (mm)</Label>
                          <Input id="custom-height" type="number" value={customHeight} onChange={e => setCustomHeight(Number(e.target.value))} min={1} className="mt-1 border-border" />
                        </div>
                      </div>
                    )}

                    <div className="mb-4">
                      <Label htmlFor="pdf-filename" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Output Filename</Label>
                      <Input id="pdf-filename" placeholder="filename" value={filename.replace(/\.pdf$/, "")} onChange={e => setFilename(`${e.target.value}.pdf`)} className="mt-1 border-border" />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Image Quality</Label>
                        <span className="text-xs text-muted-foreground font-mono">{quality}%</span>
                      </div>
                      <Slider min={1} max={100} step={1} value={[quality]} onValueChange={v => setQuality(v[0])} />
                      <p className="mt-2 text-xs text-muted-foreground">Lower quality creates smaller photo pages. At 100%, pages use lossless PNG images. Transparent areas are placed on white.</p>
                    </div>
                  </div>
                )}

                {pdfResult && (
                  <div>
                    <Alert className="bg-background border border-foreground mb-5">
                      <AlertDescription className="flex items-center gap-2 text-foreground text-sm">
                        <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                        <span><strong>PDF created.</strong> {imageFiles.length} {imageFiles.length === 1 ? "page" : "pages"} · {pdfResult.size}</span>
                      </AlertDescription>
                    </Alert>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button onClick={() => downloadFile(pdfResult.file, pdfResult.file.name, "application/pdf")} className="bg-brand text-white hover:bg-brand-dark rounded-md font-semibold">
                        <Download size={15} className="mr-2" /> Download PDF
                      </Button>
                      <Button variant="outline" onClick={handleClearImages} className="border-border text-foreground hover:bg-background rounded-md">
                        Create Another
                      </Button>
                    </div>
                  </div>
                )}

                {showOptions && !pdfResult && (
                  <div className="flex flex-col sm:flex-row gap-3 mt-2">
                    <Button onClick={handleConvertToPdf} disabled={imageFiles.length === 0 || isConverting || isLoadingPreview} className="bg-brand text-white hover:bg-brand-dark rounded-md font-semibold">
                      {isConverting ? "Converting..." : "Convert to PDF"}
                    </Button>
                    <Button variant="outline" onClick={handleClearImages} className="border-border text-foreground hover:bg-background rounded-md">
                      Reset
                    </Button>
                  </div>
                )}
              </>
            )}
          </fieldset>
        </div>
      </div>
    </section>
  );
};

export default ImageToPdf;
