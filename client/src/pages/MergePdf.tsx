import { useState, useCallback, useRef } from "react";
import BackToTools from "@/components/BackToTools";
import FileUpload from "@/components/FileUpload";
import FilePreview from "@/components/FilePreview";
import { Combine, Download, X, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useFileVault } from "@/context/FileVault";
import { downloadFile } from "@/lib/fileUtils";
import { mergePdfFiles } from "@/lib/pdfUtils";

const MergePdf = () => {
  const { toast } = useToast();
  const { files: vaultFiles, removeFile: removeVaultFile } = useFileVault();
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [showOptions, setShowOptions] = useState(false);
  const [mergedFilename, setMergedFilename] = useState<string>("merged.pdf");
  const [isMerging, setIsMerging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [mergedPdf, setMergedPdf] = useState<File | null>(null);
  const [mergedSize, setMergedSize] = useState<string>("");

  const handlePdfsSelected = useCallback(async (files: File[]) => {
    const pdfs = files.filter(f => f.type === "application/pdf");
    if (pdfs.length === 0) {
      toast({ variant: "destructive", title: "Invalid files", description: "Please select only PDF files." });
      return;
    }
    setPdfFiles(pdfs);
    setShowOptions(true);
    setMergedPdf(null);
  }, [toast]);

  const handleAddMorePdfs = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,application/pdf";
    input.multiple = true;
    input.onchange = (e) => {
      const newFiles = Array.from((e.target as HTMLInputElement).files || []).filter(f => f.type === "application/pdf");
      if (newFiles.length > 0) setPdfFiles(prev => [...prev, ...newFiles]);
    };
    input.click();
  }, []);

  const handleRemovePdf = useCallback((index: number) => setPdfFiles(p => p.filter((_, i) => i !== index)), []);

  const dragIndexRef = useRef<number | null>(null);
  const handleReorderPdf = useCallback((from: number, to: number) => {
    if (from === to) return;
    setPdfFiles(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const handleClearPdfs = useCallback(() => {
    // Also drop these files from the shared workspace vault — otherwise a
    // fresh FileUpload silently re-adopts the file we just finished with.
    vaultFiles.filter(vf => pdfFiles.includes(vf.file)).forEach(vf => removeVaultFile(vf.id));
    setPdfFiles([]);
    setShowOptions(false);
    setMergedPdf(null);
    setMergedFilename("merged.pdf");
  }, [pdfFiles, vaultFiles, removeVaultFile]);

  const handleMergePdfs = useCallback(async () => {
    if (pdfFiles.length < 2) {
      toast({ variant: "destructive", title: "Need at least 2 PDFs" });
      return;
    }
    setIsMerging(true);
    setProgress(0);
    try {
      const interval = setInterval(() => setProgress(p => Math.min(p + Math.random() * 10, 90)), 200);
      const merged = await mergePdfFiles(pdfFiles);
      const name = mergedFilename.endsWith(".pdf") ? mergedFilename : `${mergedFilename}.pdf`;
      const renamed = new File([merged], name, { type: "application/pdf" });
      setMergedPdf(renamed);
      setMergedSize(`${(merged.size / 1024 / 1024).toFixed(2)} MB`);
      clearInterval(interval);
      setProgress(100);
      toast({ title: "Merged", description: `${pdfFiles.length} PDFs combined.` });
    } catch {
      toast({ variant: "destructive", title: "Merge failed" });
    } finally {
      setIsMerging(false);
    }
  }, [pdfFiles, mergedFilename, toast]);

  return (
    <section className="py-10 bg-background min-h-[60vh]">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <BackToTools />
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-4 h-0.5 bg-brand" />
            <span className="text-brand text-xs font-semibold uppercase tracking-widest">Combine</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground font-heading">Merge PDFs</h1>
          <p className="text-muted-foreground text-sm mt-1">Combine multiple PDF files into one document in order</p>
        </div>

        <div className="max-w-2xl bg-card/90 backdrop-blur-sm border border-border rounded-xl shadow-sm">
          <div className="p-6">
            {pdfFiles.length === 0 ? (
              <FileUpload
                accept=".pdf,application/pdf"
                maxSizeInMB={100}
                multiple
                onFilesSelected={handlePdfsSelected}
                title="Upload PDFs to Merge"
                description="Drag & drop or click to browse (select 2+ files)"
                buttonText="Select PDFs"
                icon={<Combine size={36} />}
              />
            ) : (
              <>
                <FilePreview
                  files={pdfFiles} fileType="pdf" previewUrls={[]}
                  onRemove={handleRemovePdf} onRemoveAll={handleClearPdfs}
                  onAddMore={handleAddMorePdfs}
                  className="mb-5"
                />

                {showOptions && !mergedPdf && !isMerging && (
                  <div className="border border-border p-5 mb-5 bg-muted">
                    <h4 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wide">Merge Options</h4>
                    <div className="mb-4">
                      <Label htmlFor="merge-filename" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Output Filename</Label>
                      <Input
                        id="merge-filename"
                        value={mergedFilename.replace(/\.pdf$/, "")}
                        onChange={e => setMergedFilename(e.target.value)}
                        placeholder="merged"
                        className="mt-1 border-border"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-2">File Order</Label>
                      <div className="border border-border divide-y divide-[#E0E0E0]">
                        {pdfFiles.map((file, i) => (
                          <div
                            key={`${file.name}-${i}`}
                            draggable
                            onDragStart={() => { dragIndexRef.current = i; }}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (dragIndexRef.current !== null) handleReorderPdf(dragIndexRef.current, i);
                              dragIndexRef.current = null;
                            }}
                            className="flex items-center justify-between p-3 cursor-grab active:cursor-grabbing"
                          >
                            <div className="flex items-center gap-3">
                              <GripVertical size={14} className="text-muted-foreground flex-shrink-0" />
                              <div className="w-5 h-5 bg-brand text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                                {i + 1}
                              </div>
                              <span className="text-sm text-foreground truncate max-w-[220px]">{file.name}</span>
                            </div>
                            <button type="button" onClick={() => handleRemovePdf(i)} aria-label={`Remove ${file.name}`} className="text-muted-foreground hover:text-brand transition-colors">
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button onClick={handleAddMorePdfs} className="mt-2 text-sm text-brand hover:text-brand-dark font-medium transition-colors">
                        + Add More PDFs
                      </button>
                    </div>
                  </div>
                )}

                {isMerging && (
                  <div className="mb-5">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1"><span>Merging PDFs...</span><span>{Math.round(progress)}%</span></div>
                    <Progress value={progress} className="h-1.5" />
                  </div>
                )}

                {mergedPdf && (
                  <div>
                    <Alert className="bg-background border border-foreground mb-5">
                      <AlertDescription className="flex items-center gap-2 text-foreground text-sm">
                        <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                        <span><strong>Merged.</strong> {pdfFiles.length} files combined · {mergedSize}</span>
                      </AlertDescription>
                    </Alert>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button onClick={() => downloadFile(mergedPdf, mergedPdf.name, "application/pdf")} className="bg-brand text-white hover:bg-brand-dark rounded-md font-semibold">
                        <Download size={15} className="mr-2" /> Download Merged PDF
                      </Button>
                      <Button variant="outline" onClick={handleClearPdfs} className="border-border text-foreground hover:bg-background rounded-md">
                        Merge More
                      </Button>
                    </div>
                  </div>
                )}

                {showOptions && !mergedPdf && !isMerging && (
                  <div className="flex flex-col sm:flex-row gap-3 mt-2">
                    <Button onClick={handleMergePdfs} disabled={pdfFiles.length < 2} className="bg-brand text-white hover:bg-brand-dark rounded-md font-semibold">
                      Merge PDFs
                    </Button>
                    <Button variant="outline" onClick={handleClearPdfs} className="border-border text-foreground hover:bg-background rounded-md">
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

export default MergePdf;
