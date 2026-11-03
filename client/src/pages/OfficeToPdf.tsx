import { useState, useCallback } from "react";
import BackToTools from "@/components/BackToTools";
import FileUpload from "@/components/FileUpload";
import FilePreview from "@/components/FilePreview";
import { FileText, Presentation, Sheet, type LucideIcon } from "lucide-react";
import SaveShareButtons, { SAVE_HINT } from "@/components/SaveShareButtons";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useFileVault } from "@/context/FileVault";
import { formatFileSize } from "@/lib/fileUtils";
import { convertOfficeToPdf, type OfficeFormat } from "@/lib/wordUtils";

const KINDS: Record<OfficeFormat, { app: string; noun: string; ext: RegExp; accept: string; icon: LucideIcon; legacy: string; summary: string; notes: string }> = {
  docx: {
    app: "Word", noun: "Word document", ext: /\.docx$/i, accept: ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document", icon: FileText,
    legacy: "Legacy .doc isn't supported. Open it in Word and save it as .docx first.",
    summary: "Converts .docx to PDF on this device.",
    notes: "Complex layouts (footnotes, tracked changes, some SmartArt) may not render pixel-perfect. Fonts not embedded in the file or bundled with this build fall back to a close match automatically.",
  },
  pptx: {
    app: "PowerPoint", noun: "PowerPoint presentation", ext: /\.pptx$/i, accept: ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation", icon: Presentation,
    legacy: "Legacy .ppt isn't supported. Open it in PowerPoint and save it as .pptx first.",
    summary: "Converts .pptx slides to PDF on this device, one slide per page.",
    notes: "Animations, transitions, video and audio are not included. Charts, SmartArt and unusual fonts may look slightly different from PowerPoint.",
  },
  xlsx: {
    app: "Excel", noun: "Excel workbook", ext: /\.xlsx$/i, accept: ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", icon: Sheet,
    legacy: "Legacy .xls and .csv aren't supported. Open the file in Excel and save it as .xlsx first.",
    summary: "Converts every visible sheet of an .xlsx workbook to PDF on this device.",
    notes: "Hidden sheets are skipped. Formulas show the values last saved by Excel. Very wide sheets are split across pages, as when printing from Excel.",
  },
};

const OfficeToPdf = ({ format }: { format: OfficeFormat }) => {
  const kind = KINDS[format];
  const KindIcon = kind.icon;
  const { toast } = useToast();
  const { files: vaultFiles, removeFile: removeVaultFile } = useFileVault();
  const [docxFile, setDocxFile] = useState<File | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isIndeterminate, setIsIndeterminate] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [resultPdf, setResultPdf] = useState<File | null>(null);

  const handleFileSelected = useCallback(
    (files: File[]) => {
      const docx = files.find((f) => kind.ext.test(f.name));
      if (!docx) {
        toast({ variant: "destructive", title: `Choose a ${kind.noun}`, description: kind.legacy });
        return;
      }
      setDocxFile(docx);
      setResultPdf(null);
    },
    [toast, kind]
  );

  const handleConvert = useCallback(async () => {
    if (!docxFile) return;
    setIsConverting(true);
    setProgress(0);
    setIsIndeterminate(true);
    setStatusText("Starting…");
    try {
      const pdf = await convertOfficeToPdf(docxFile, format, (p) => {
        if (p.phase === "downloading-engine") {
          if (p.percent >= 0) {
            setIsIndeterminate(false);
            setProgress(p.percent);
            setStatusText(
              `Downloading local conversion engine — ${formatFileSize(p.loadedBytes)} / ${formatFileSize(p.totalBytes)} (first time only, cached after)`
            );
          } else {
            setIsIndeterminate(true);
            setStatusText(`Downloading local conversion engine — ${formatFileSize(p.loadedBytes)} (first time only, cached after)`);
          }
        } else {
          setIsIndeterminate(true);
          setProgress(100);
          setStatusText("Converting document…");
        }
      });
      setProgress(100);
      setResultPdf(pdf);
      toast({ title: "Converted", description: `${docxFile.name} → ${pdf.name}` });
    } catch (err) {
      setProgress(0);
      toast({
        variant: "destructive",
        title: "Conversion failed",
        description: err instanceof Error ? err.message : "Something went wrong.",
      });
    } finally {
      setIsConverting(false);
      setIsIndeterminate(false);
      setStatusText("");
    }
  }, [docxFile, format, toast]);

  const handleReset = useCallback(() => {
    // Also drop this file from the shared workspace vault — otherwise a
    // fresh FileUpload silently re-adopts the file we just finished with.
    vaultFiles.filter((vf) => vf.file === docxFile).forEach((vf) => removeVaultFile(vf.id));
    setDocxFile(null);
    setResultPdf(null);
    setProgress(0);
    setIsIndeterminate(false);
    setStatusText("");
  }, [docxFile, vaultFiles, removeVaultFile]);

  return (
    <section className="py-10 bg-background min-h-[60vh]">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <BackToTools />
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-4 h-0.5 bg-brand" />
            <span className="text-brand text-xs font-semibold uppercase tracking-widest">Convert</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground font-heading">{kind.app} to PDF</h1>
          <p className="text-muted-foreground text-sm mt-1">{kind.summary}</p>
        </div>

        <div className="max-w-2xl bg-card/90 backdrop-blur-sm border border-border rounded-xl shadow-sm">
          <div className="p-6">
            {!docxFile ? (
              <>
                <FileUpload
                  accept={kind.accept}
                  maxSizeInMB={50}
                  onFilesSelected={handleFileSelected}
                  title={`Choose a ${kind.noun}`}
                  description={`Drag & drop or click to browse (.${format} only)`}
                  buttonText={`Select .${format} file`}
                  icon={<KindIcon size={36} />}
                />
                <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                  First conversion on this device downloads the local engine (~47MB) once; it's
                  cached offline afterward, so later conversions start instantly.
                </p>
              </>
            ) : (
              <>
                <FilePreview
                  files={[docxFile]}
                  fileType="pdf"
                  previewUrls={[]}
                  onRemove={handleReset}
                  onRemoveAll={handleReset}
                  className="mb-5"
                />

                {isConverting && (
                  <div className="mb-5">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1 gap-3">
                      <span className="truncate">{statusText || "Converting..."}</span>
                      {!isIndeterminate && <span className="flex-shrink-0">{Math.round(progress)}%</span>}
                    </div>
                    <Progress value={progress} className={`h-1.5 ${isIndeterminate ? "animate-pulse" : ""}`} />
                  </div>
                )}

                {resultPdf ? (
                  <div>
                    <Alert className="bg-background border border-foreground mb-5">
                      <AlertDescription className="flex items-center gap-2 text-foreground text-sm">
                        <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                        <span><strong>Converted.</strong> {(resultPdf.size / 1024).toFixed(0)} KB</span>
                      </AlertDescription>
                    </Alert>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <SaveShareButtons file={resultPdf} />
                      <Button variant="outline" onClick={handleReset} className="h-11 border-border text-foreground hover:bg-background rounded-md">
                        Convert another
                      </Button>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">{SAVE_HINT}</p>
                  </div>
                ) : (
                  !isConverting && (
                    <div className="flex flex-col sm:flex-row gap-3 mt-2">
                      <Button
                        onClick={handleConvert}
                        className="bg-brand text-white hover:bg-brand-dark rounded-md font-semibold"
                      >
                        Convert to PDF
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

        <p className="text-xs text-muted-foreground mt-4 max-w-2xl">
          {kind.notes}
        </p>
      </div>
    </section>
  );
};

export default OfficeToPdf;
