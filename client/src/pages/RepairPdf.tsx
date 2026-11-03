import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Wrench } from "lucide-react";
import { PDFDocument } from "pdf-lib";
import ToolHeader from "@/components/ToolHeader";
import FileUpload from "@/components/FileUpload";
import SaveShareButtons, { SAVE_HINT } from "@/components/SaveShareButtons";
import { useToast } from "@/hooks/use-toast";
import { useFileVault } from "@/context/FileVault";
import { formatFileSize } from "@/lib/fileUtils";
import { loadPdfDocument, renderPdfPageToCanvas } from "@/lib/pdfjs";
import { repairPdfStructure } from "@/lib/pdfEncryption";
import { repairPdf, type RepairResult } from "@/lib/repair";

/** Counts pages with PDF.js, which is how most viewers will see the file. */
const countPages = async (bytes: Uint8Array) => {
  const pdf = await loadPdfDocument(bytes);
  try {
    return pdf.numPages;
  } finally {
    await pdf.destroy();
  }
};

/** Last resort: draw each page PDF.js can still read and keep it as an image. */
const rebuildFromImages = async (bytes: Uint8Array) => {
  const pdf = await loadPdfDocument(bytes);
  const out = await PDFDocument.create();
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      try {
        const page = await pdf.getPage(i);
        const { width, height } = page.getViewport({ scale: 1 });
        const canvas = await renderPdfPageToCanvas(pdf, i, 2);
        const jpg = await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("encode"))), "image/jpeg", 0.88));
        canvas.width = canvas.height = 0;
        const image = await out.embedJpg(await jpg.arrayBuffer());
        out.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });
      } catch {
        // Skip pages that can't be drawn at all.
      }
    }
  } finally {
    await pdf.destroy();
  }
  if (!out.getPageCount()) throw new Error("No pages could be drawn.");
  return out.save();
};

const METHOD_TEXT: Record<RepairResult["method"], string> = {
  structure: "The file's structure was rebuilt. Text, images and quality are unchanged.",
  rebuild: "Every readable page was copied into a new, clean file. Text and quality are unchanged.",
  images: "The file was too damaged to fix directly, so each readable page was saved as an image. The pages look the same, but text can't be selected or searched. Run OCR PDF on it to make the text searchable again.",
};

const RepairPdf = () => {
  const { toast } = useToast();
  const { files: vaultFiles, removeFile } = useFileVault();
  const [source, setSource] = useState<File | null>(null);
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<{ file: File; info: RepairResult } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const run = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setSource(file);
    setResult(null);
    setFailed(null);
    setWorking(true);
    try {
      const info = await repairPdf(new Uint8Array(await file.arrayBuffer()), {
        structure: repairPdfStructure,
        images: rebuildFromImages,
        countPages,
      });
      const name = file.name.replace(/\.pdf$/i, "") + "_repaired.pdf";
      setResult({ file: new File([info.bytes as BlobPart], name, { type: "application/pdf" }), info });
    } catch (err) {
      console.error(err);
      setFailed(err instanceof Error ? err.message : "This file could not be repaired.");
    } finally {
      setWorking(false);
    }
  };

  const reset = () => {
    vaultFiles.filter((vf) => vf.file === source).forEach((vf) => removeFile(vf.id));
    setSource(null);
    setResult(null);
    setFailed(null);
  };

  const missing = result && result.info.expectedPages && result.info.pages < result.info.expectedPages
    ? result.info.expectedPages - result.info.pages : 0;

  return (
    <section className="min-h-[60vh] bg-background py-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <ToolHeader
          category="Organise"
          title="Repair PDF"
          description="Fix a PDF that won't open, shows blank pages or reports errors. Recovery happens on this device and the original is left unchanged."
        />
        <div className="max-w-2xl rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
          {!source ? (
            <FileUpload
              accept=".pdf,application/pdf"
              maxSizeInMB={150}
              onFilesSelected={run}
              title="Choose a damaged PDF"
              description="Drag & drop or click to browse"
              buttonText="Select PDF"
              icon={<Wrench size={34} />}
            />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">{source.name}</span>
                  <span className="text-xs text-muted-foreground">{formatFileSize(source.size)}</span>
                </span>
              </div>

              {working && (
                <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 size={16} className="animate-spin" /> Checking and repairing… large files can take a minute.
                </p>
              )}

              {failed && (
                <div role="alert" className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertTriangle size={17} className="mt-0.5 shrink-0" />
                  <span>{failed} If you can, ask the sender for a fresh copy.</span>
                </div>
              )}

              {result && (
                <div className="space-y-3">
                  <div role="status" className="rounded-lg border border-brand/40 bg-brand-tint p-4">
                    <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <CheckCircle2 size={17} className="text-brand" /> Recovered {result.info.pages} page{result.info.pages === 1 ? "" : "s"} · {formatFileSize(result.file.size)}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{METHOD_TEXT[result.info.method]}</p>
                    {missing > 0 && (
                      <p className="mt-1 text-sm text-foreground">{missing} page{missing === 1 ? " was" : "s were"} too damaged to recover.</p>
                    )}
                  </div>
                  <SaveShareButtons file={result.file} />
                  <p className="text-xs text-muted-foreground">{SAVE_HINT}</p>
                </div>
              )}

              {!working && (
                <button type="button" onClick={reset} className="min-h-11 text-sm font-medium text-muted-foreground hover:text-brand">
                  Repair another file
                </button>
              )}
            </div>
          )}
        </div>
        <p className="mt-4 max-w-2xl text-xs text-muted-foreground">
          A repaired file is a new copy. If a PDF was signed with a digital certificate, repairing it removes that certificate's validity.
          Password-protected files are unlocked first, so you'll be asked for the password.
        </p>
      </div>
    </section>
  );
};

export default RepairPdf;
