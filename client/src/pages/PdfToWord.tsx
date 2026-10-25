import { features, conversionServer } from "@/brand";
import { useState, useCallback } from "react";
import BackToTools from "@/components/BackToTools";
import FileUpload from "@/components/FileUpload";
import FilePreview from "@/components/FilePreview";
import { FileText, Download, ServerOff, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useFileVault } from "@/context/FileVault";
import { generateFilePreview, downloadFile, formatFileSize } from "@/lib/fileUtils";
import { convertPdfToWordRemote, isPdfToWordConfigured } from "@/lib/pdfToWordApi";

const PdfToWord = () => {
  const { toast } = useToast();
  const { files: vaultFiles, removeFile: removeVaultFile } = useFileVault();
  const configured = isPdfToWordConfigured();

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string>("");
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [resultFile, setResultFile] = useState<File | null>(null);

  const handlePdfSelected = useCallback(async (files: File[]) => {
    if (files.length > 0 && files[0].type === "application/pdf") {
      setPdfFile(files[0]);
      setPdfPreviewUrl("");
      setResultFile(null);
      setIsLoadingPreview(true);
      try {
        setPdfPreviewUrl(await generateFilePreview(files[0]));
      } catch {
        // preview optional
      } finally {
        setIsLoadingPreview(false);
      }
    } else {
      toast({ variant: "destructive", title: "Invalid file", description: "Please select a PDF file." });
    }
  }, [toast]);

  const handleReset = useCallback(() => {
    vaultFiles.filter(vf => vf.file === pdfFile).forEach(vf => removeVaultFile(vf.id));
    setPdfFile(null);
    setPdfPreviewUrl("");
    setIsLoadingPreview(false);
    setResultFile(null);
    setProgress(0);
    setStatusText("");
  }, [pdfFile, vaultFiles, removeVaultFile]);

  const handleConvert = useCallback(async () => {
    if (!pdfFile) return;
    setIsConverting(true);
    setProgress(0);
    setStatusText("Uploading...");
    try {
      const result = await convertPdfToWordRemote(pdfFile, (p) => {
        const pct = p.totalBytes > 0 ? Math.round((p.loadedBytes / p.totalBytes) * 100) : 0;
        setProgress(Math.min(90, pct));
        setStatusText(
          p.totalBytes > 0
            ? `Uploading — ${formatFileSize(p.loadedBytes)} / ${formatFileSize(p.totalBytes)}`
            : "Uploading..."
        );
        if (pct >= 100) setStatusText("Converting on the server...");
      });
      setProgress(100);
      setResultFile(result);
      toast({ title: "Converted", description: `${pdfFile.name} → ${result.name}` });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Conversion failed",
        description: err instanceof Error ? err.message : "Something went wrong.",
      });
    } finally {
      setIsConverting(false);
      setStatusText("");
    }
  }, [pdfFile, toast]);

  return (
    <section className="py-10 bg-background min-h-[60vh]">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <BackToTools />
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-4 h-0.5 bg-brand" />
            <span className="text-brand text-xs font-semibold uppercase tracking-widest">Convert</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground font-heading">PDF to Word</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Converts PDF to .docx file so you can open and edit it in Microsoft Word, Google Docs, etc.
          </p>
        </div>

        {!configured ? (
          <div className="max-w-2xl bg-card/90 border border-border rounded-xl shadow-sm p-8 text-center">
            <ServerOff size={32} className="mx-auto text-muted-foreground mb-3" />
            <h2 className="text-base font-semibold text-foreground mb-1">Not set up on this deployment</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              PDF to Word is switched off on this installation. Contact the MIS/IT unit if you need it.
            </p>
          </div>
        ) : (
          <div className="max-w-2xl space-y-3">
            <div role="note" className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50">
              <Building2 size={18} className="mt-0.5 flex-shrink-0 text-amber-700 dark:text-amber-300" />
              <div className="text-sm leading-relaxed">
                <p className="font-semibold">{features.demoMode ? "Test conversion on Railway" : "Currently available at head office only"}</p>
                <p className="mt-0.5">
                  {features.demoMode ? "This tool uploads your PDF to the Railway test server and returns an editable Word file. Use sample documents, not confidential FC records. Scanned pages use OCR and may lose their original layout." : "PDF to Word uses the conversion server at Head Office and works on the head-office network. If you are outside that network, contact MIS/IT for access."}
                </p>
                <p className="mt-1.5 text-xs opacity-80">Files go to the {conversionServer}. Temporary working files are deleted after conversion and download finish. Limit: 50MB per PDF; split long documents into smaller files.</p>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl shadow-sm">
              <div className="p-6">
                {!pdfFile ? (
                  <FileUpload
                    accept=".pdf,application/pdf"
                    maxSizeInMB={50}
                    multiple={false}
                    onFilesSelected={handlePdfSelected}
                    title="Choose a PDF"
                    description="Drag & drop or click to browse"
                    buttonText="Select PDF"
                    icon={<FileText size={36} />}
                  />
                ) : (
                  <>
                    <FilePreview
                      files={[pdfFile]}
                      fileType="pdf"
                      previewUrls={pdfPreviewUrl ? [pdfPreviewUrl] : []}
                      isLoadingPreview={isLoadingPreview}
                      onRemoveAll={handleReset}
                      className="mb-5"
                    />

                    {isConverting && (
                      <div className="mb-5">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1 gap-3">
                          <span className="truncate">{statusText || "Converting..."}</span>
                          <span className="flex-shrink-0">{Math.round(progress)}%</span>
                        </div>
                        <Progress value={progress} className="h-1.5" />
                      </div>
                    )}

                    {resultFile ? (
                      <div>
                        <Alert className="bg-background border border-foreground mb-5">
                          <AlertDescription className="flex items-center gap-2 text-foreground text-sm">
                            <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                            </svg>
                            <span><strong>Converted.</strong> {(resultFile.size / 1024).toFixed(0)} KB</span>
                          </AlertDescription>
                        </Alert>
                        <div className="flex flex-col sm:flex-row gap-3">
                          <Button
                            onClick={() => downloadFile(resultFile, resultFile.name, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
                            className="bg-brand text-white hover:bg-brand-dark rounded-md font-semibold"
                          >
                            <Download size={15} className="mr-2" /> Download .docx
                          </Button>
                          <Button variant="outline" onClick={handleReset} className="border-border text-foreground hover:bg-background rounded-md">
                            Convert Another
                          </Button>
                        </div>
                      </div>
                    ) : (
                      !isConverting && (
                        <div className="flex flex-col sm:flex-row gap-3 mt-2">
                          <Button onClick={handleConvert} className="bg-brand text-white hover:bg-brand-dark rounded-md font-semibold">
                            Convert to Word
                          </Button>
                          <Button variant="outline" onClick={handleReset} className="border-border text-foreground hover:bg-background rounded-md">
                            Reset
                          </Button>
                        </div>
                      )
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default PdfToWord;
