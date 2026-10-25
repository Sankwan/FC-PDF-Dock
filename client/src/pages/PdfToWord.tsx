import { useState, useRef, useEffect } from "react";
import BackToTools from "@/components/BackToTools";
import FileUpload from "@/components/FileUpload";
import FilePreview from "@/components/FilePreview";
import { FileText, Download, HardDrive, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { downloadFile, generateFilePreview, formatFileSize } from "@/lib/fileUtils";
import type { WordMode, WordResult } from "@/lib/pdfToWord/convert";

export default function PdfToWord() {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null), [preview, setPreview] = useState("");
  const [mode, setMode] = useState<WordMode>("editable"), [ocr, setOcr] = useState(true);
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(0), [status, setStatus] = useState("");
  const [result, setResult] = useState<WordResult | null>(null), [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null), selection = useRef(0);
  useEffect(() => () => { controller.current?.abort(); selection.current++; }, []);
  const select = async (files: File[]) => {
    const next = files[0]; if (!next || busy) return;
    if (!/\.pdf$/i.test(next.name) && next.type !== "application/pdf") { setError("Choose a PDF file."); return; }
    const version = ++selection.current;
    setFile(next); setPreview(""); setResult(null); setError("");
    try { const url = await generateFilePreview(next); if (selection.current === version) setPreview(url); } catch { /* optional thumbnail */ }
  };
  const reset = () => { selection.current++; setFile(null); setPreview(""); setResult(null); setError(""); setProgress(0); };
  const convert = async () => {
    if (!file || busy) return;
    const current = new AbortController(); controller.current = current;
    setBusy(true); setError(""); setResult(null); setStatus("Opening your PDF"); setProgress(0);
    try {
      const { convertPdfToWordLocal } = await import("@/lib/pdfToWord/convert");
      const converted = await convertPdfToWordLocal(file, { mode, ocr, signal: current.signal, onProgress: (p, s) => { setProgress(p); setStatus(s); } });
      if (!current.signal.aborted) { setResult(converted); toast({ title: "Word document ready", description: "Converted on this device." }); }
    } catch (e) {
      if (!current.signal.aborted) setError(e instanceof Error ? e.message : "Conversion failed. Try a smaller PDF.");
    } finally { if (controller.current === current) { setBusy(false); setStatus(current.signal.aborted ? "Conversion cancelled. You can try again." : ""); controller.current = null; } }
  };
  return <section className="min-h-[60vh] bg-background py-10"><div className="container mx-auto px-4 sm:px-6 lg:px-8">
    <BackToTools />
    <div className="mb-8 max-w-2xl"><h1 className="type-page-title">PDF to Word</h1><p className="type-body mt-3 text-muted-foreground">Create a Word document on this device. Choose editable text or keep each page as an image.</p></div>
    <div className="max-w-2xl space-y-5">
      <div className="flex gap-3 text-sm text-muted-foreground"><HardDrive size={19} className="mt-0.5 shrink-0 text-brand" /><p>Conversion stays in your browser. No conversion server is needed. For offline scans, set up the OCR engine in the app menu while connected.</p></div>
      <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
        {!file ? <FileUpload accept=".pdf,application/pdf" maxSizeInMB={50} multiple={false} onFilesSelected={select} title="Choose a PDF" description="Up to 50 MB and 100 pages. Smaller files work best on phones." buttonText="Select PDF" icon={<FileText size={36} />} /> : <>
          <FilePreview showControls={!busy} files={[file]} fileType="pdf" previewUrls={preview ? [preview] : []} onRemoveAll={busy ? undefined : reset} />
          <fieldset disabled={busy} className="mt-6 space-y-4"><legend className="type-label mb-3">Word document format</legend>
            {([
              ["editable", "Editable text", "Rebuild paragraphs, headings and simple tables. Images, complex layouts and exact fonts may not carry over."],
              ["appearance", "Page images", "Keep the page appearance as pictures in Word. Text in this output cannot be edited or searched."],
            ] as const).map(([value, title, description]) => <label key={value} className={`flex cursor-pointer gap-3 rounded-lg border p-4 ${mode === value ? "border-brand bg-brand-tint" : "border-border"}`}><input type="radio" name="word-mode" value={value} checked={mode === value} onChange={() => { setMode(value); setResult(null); }} className="mt-1 accent-[hsl(var(--brand))]" /><span><span className="type-label block">{title}</span><span className="type-support mt-1 block text-muted-foreground">{description}</span></span></label>)}
            {mode === "editable" && <label className="flex items-start gap-3 py-2"><input type="checkbox" checked={ocr} onChange={e => { setOcr(e.target.checked); setResult(null); }} className="mt-1 accent-[hsl(var(--brand))]" /><span className="type-support">Recognise scanned pages with English OCR on this device. Check spelling, names and figures in the result.</span></label>}
          </fieldset>
          {busy && <div className="mt-5 space-y-2" role="status"><p className="type-support">{status}</p><Progress value={progress} aria-label="Word conversion progress" /><p className="type-support tabular-nums text-muted-foreground">{progress}%</p></div>}
          {!busy && status && <p role="status" className="type-support mt-4">{status}</p>}
          {result && <div className="mt-5 space-y-3" role="status"><h2 className="type-section-title">Your Word document is ready</h2><p className="type-support text-muted-foreground">{result.pages} page{result.pages === 1 ? "" : "s"} · {formatFileSize(result.file.size)}{result.ocrPages ? ` · ${result.ocrPages} OCR page(s)` : ""}. Review the result before using it as an official document.</p>{result.warnings.length > 0 && <ul className="list-disc space-y-1 pl-5 type-support text-muted-foreground">{result.warnings.map(w => <li key={w}>{w}</li>)}</ul>}</div>}
          <div className="mt-5 flex flex-wrap gap-3">
            {busy ? <><Button disabled><Loader2 size={17} className="mr-2 animate-spin" /> Converting</Button><Button variant="outline" onClick={() => controller.current?.abort()}>Cancel conversion</Button></> : result ? <><Button onClick={() => downloadFile(result.file, result.file.name, result.file.type)}><Download size={17} className="mr-2" />Download Word file</Button><Button variant="outline" onClick={reset}>Convert another PDF</Button></> : <Button onClick={convert}>Convert to Word</Button>}
          </div>
        </>}
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
      </div>
    </div>
  </div></section>;
}
