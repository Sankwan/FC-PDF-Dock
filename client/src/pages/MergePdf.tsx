import { useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import BackToTools from "@/components/BackToTools";
import FileUpload from "@/components/FileUpload";
import { Combine, X, GripVertical, Plus, Trash2, LayoutGrid } from "lucide-react";
import SaveShareButtons from "@/components/SaveShareButtons";
import { useSortable } from "@/hooks/useSortable";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useFileVault } from "@/context/FileVault";
import { formatFileSize } from "@/lib/fileUtils";
import { mergePdfFiles, getPdfPageCount } from "@/lib/pdfUtils";
import { handOff } from "@/lib/handoff";

// Page counts, read once per file.
const pageCounts = new WeakMap<File, Promise<number | null>>();
const countPages = (file: File) => {
  if (!pageCounts.has(file)) pageCounts.set(file, getPdfPageCount(file).catch(() => null));
  return pageCounts.get(file)!;
};

// Stable list keys that survive reordering, even if the same file is added twice.
const fileKeys = new WeakMap<File, string>();
const keyFor = (file: File) => {
  if (!fileKeys.has(file)) fileKeys.set(file, Math.random().toString(36).slice(2));
  return fileKeys.get(file)!;
};

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
  const [counts, setCounts] = useState<Map<File, number | null>>(new Map());
  const [, navigate] = useLocation();

  useEffect(() => {
    let alive = true;
    pdfFiles.forEach((f) => countPages(f).then((n) => alive && setCounts((m) => (m.get(f) === n ? m : new Map(m).set(f, n)))));
    return () => { alive = false; };
  }, [pdfFiles]);
  const totalPages = pdfFiles.reduce((sum, f) => sum + (counts.get(f) ?? 0), 0);
  const countsReady = pdfFiles.every((f) => counts.has(f));

  const arrangePages = () => {
    handOff({ files: pdfFiles, outputName: mergedFilename.endsWith(".pdf") ? mergedFilename : `${mergedFilename}.pdf`, from: "Merge PDFs", to: "/organize-pdf" });
    navigate("/organize-pdf");
  };

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

  const handleRemovePdf = useCallback((index: number) => { setPdfFiles(p => p.filter((_, i) => i !== index)); setMergedPdf(null); }, []);

  const sortable = useSortable({
    count: pdfFiles.length,
    onMove: (from, to) => setPdfFiles(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    }),
  });

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
      setMergedSize(formatFileSize(merged.size));
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
                {showOptions && !mergedPdf && !isMerging && (
                  <div className="mb-5 space-y-4">
                    <div>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <h2 className="text-sm font-semibold text-foreground">{pdfFiles.length} PDF{pdfFiles.length === 1 ? "" : "s"}{countsReady && totalPages ? ` · ${totalPages} pages in total` : ""}</h2>
                        <button type="button" onClick={handleClearPdfs} className="inline-flex min-h-11 items-center gap-1.5 px-2 text-sm text-muted-foreground hover:text-destructive">
                          <Trash2 size={15} /> Clear all
                        </button>
                      </div>
                      <p className="mb-2 text-xs text-muted-foreground">
                        <span className="sm:hidden">Press and hold a file, then drag it up or down.</span>
                        <span className="hidden sm:inline">Drag files up or down to change the order.</span>
                      </p>
                      <ol ref={sortable.containerRef} className="space-y-2">
                        {pdfFiles.map((file, i) => (
                          <li
                            key={keyFor(file)}
                            {...sortable.itemProps(i)}
                            className={`sortable-item flex items-center gap-2 rounded-lg border bg-card py-1 pl-1 pr-1 transition-shadow ${
                              sortable.dragIndex === i ? "relative z-10 scale-[1.02] border-brand shadow-lg ring-2 ring-brand/30" : "border-border"
                            }`}
                          >
                            <button type="button" aria-label={`Move ${file.name}. Use arrow keys to reorder.`} {...sortable.handleProps(i)}
                              className="grid h-11 w-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted">
                              <GripVertical size={18} />
                            </button>
                            <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-brand text-[11px] font-bold text-white tabular-nums">{i + 1}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm text-foreground">{file.name}</span>
                              <span className="block text-xs text-muted-foreground">{counts.get(file) ? `${counts.get(file)} page${counts.get(file) === 1 ? "" : "s"} · ` : counts.get(file) === null ? "Couldn't read pages · " : ""}{formatFileSize(file.size)}</span>
                            </span>
                            <button type="button" data-no-drag onClick={() => handleRemovePdf(i)} aria-label={`Remove ${file.name}`}
                              className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive">
                              <X size={16} />
                            </button>
                          </li>
                        ))}
                      </ol>
                      <div className="mt-2 flex flex-wrap gap-x-5">
                        <button type="button" onClick={handleAddMorePdfs} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand hover:text-brand-dark">
                          <Plus size={16} /> Add more PDFs
                        </button>
                        <button type="button" onClick={arrangePages} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand hover:text-brand-dark">
                          <LayoutGrid size={16} /> Arrange, rotate or remove pages first
                        </button>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="merge-filename" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Output filename</Label>
                      <Input
                        id="merge-filename"
                        value={mergedFilename.replace(/\.pdf$/, "")}
                        onChange={e => setMergedFilename(e.target.value)}
                        placeholder="merged"
                        className="mt-1 border-border"
                      />
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
                        <span><strong>Merged.</strong> {pdfFiles.length} files combined{totalPages ? ` · ${totalPages} pages` : ""} · {mergedSize}</span>
                      </AlertDescription>
                    </Alert>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <SaveShareButtons file={mergedPdf} />
                      <Button variant="outline" onClick={() => setMergedPdf(null)} className="h-11 border-border text-foreground hover:bg-background rounded-md">
                        Change order
                      </Button>
                      <Button variant="outline" onClick={handleClearPdfs} className="h-11 border-border text-foreground hover:bg-background rounded-md">
                        Merge more
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
