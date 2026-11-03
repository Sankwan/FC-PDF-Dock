import { useEffect, useState } from "react";
import { Hash, Loader2 } from "lucide-react";
import ToolHeader from "@/components/ToolHeader";
import FileUpload from "@/components/FileUpload";
import SaveShareButtons, { SAVE_HINT } from "@/components/SaveShareButtons";
import { useToast } from "@/hooks/use-toast";
import { useFileVault } from "@/context/FileVault";
import { formatFileSize } from "@/lib/fileUtils";
import { loadPdfDocument, renderPdfPageToCanvas } from "@/lib/pdfjs";
import {
  addPageNumbers, DEFAULT_PAGE_NUMBERS, formatPageNumber,
  type NumberFormat, type NumberPosition, type PageNumberOptions,
} from "@/lib/pageNumbers";

const POSITIONS: { id: NumberPosition; label: string }[] = [
  { id: "top-left", label: "Top left" }, { id: "top-center", label: "Top centre" }, { id: "top-right", label: "Top right" },
  { id: "bottom-left", label: "Bottom left" }, { id: "bottom-center", label: "Bottom centre" }, { id: "bottom-right", label: "Bottom right" },
];

const FORMATS: { id: NumberFormat; label: string }[] = [
  { id: "n", label: "1" },
  { id: "page-n", label: "Page 1" },
  { id: "n-of-total", label: "1 of 9" },
  { id: "page-n-of-total", label: "Page 1 of 9" },
];

const SIZES = [{ label: "Small", value: 9 }, { label: "Medium", value: 11 }, { label: "Large", value: 14 }];

const AddPageNumbers = () => {
  const { toast } = useToast();
  const { files: vaultFiles, removeFile } = useFileVault();
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [thumb, setThumb] = useState<{ url: string; w: number; h: number } | null>(null);
  const [opts, setOpts] = useState<PageNumberOptions>(DEFAULT_PAGE_NUMBERS);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<File | null>(null);

  const set = <K extends keyof PageNumberOptions>(key: K, value: PageNumberOptions[K]) => {
    setOpts((o) => ({ ...o, [key]: value }));
    setResult(null);
  };

  // Preview the first page that will carry a number.
  useEffect(() => {
    if (!file) return;
    let alive = true;
    (async () => {
      const pdf = await loadPdfDocument(file);
      try {
        if (!alive) return;
        setPageCount(pdf.numPages);
        const n = Math.min(Math.max(1, opts.fromPage), pdf.numPages);
        const page = await pdf.getPage(n);
        const { width, height } = page.getViewport({ scale: 1 });
        const canvas = await renderPdfPageToCanvas(pdf, n, 0.8);
        if (alive) setThumb({ url: canvas.toDataURL("image/jpeg", 0.8), w: width, h: height });
        canvas.width = canvas.height = 0;
      } finally {
        await pdf.destroy();
      }
    })().catch(() => alive && toast({ variant: "destructive", title: "Couldn't preview this PDF", description: "You can still try adding numbers, or run Repair PDF first." }));
    return () => { alive = false; };
  }, [file, opts.fromPage, toast]);

  const apply = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const bytes = await addPageNumbers(await file.arrayBuffer(), opts);
      setResult(new File([bytes as BlobPart], file.name.replace(/\.pdf$/i, "") + "_numbered.pdf", { type: "application/pdf" }));
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Couldn't add page numbers", description: "The file may be damaged. Try Repair PDF first." });
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    vaultFiles.filter((vf) => vf.file === file).forEach((vf) => removeFile(vf.id));
    setFile(null); setThumb(null); setResult(null); setPageCount(0); setOpts(DEFAULT_PAGE_NUMBERS);
  };

  const numbered = Math.max(0, pageCount - opts.fromPage + 1);
  const sample = formatPageNumber(opts.format, opts.startAt, opts.startAt + numbered - 1);
  const [vertical, horizontal] = opts.position.split("-");
  const chip = (active: boolean) =>
    `min-h-11 rounded-md border px-3 text-sm font-medium ${active ? "border-brand bg-brand text-white" : "border-border bg-card text-foreground hover:border-brand"}`;

  return (
    <section className="min-h-[60vh] bg-background py-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <ToolHeader category="Organise" title="Add page numbers" description="Number the pages of a PDF. Choose where the numbers go and how they read; the rest of the document is left as it is." />

        {!file ? (
          <div className="max-w-2xl rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
            <FileUpload accept=".pdf,application/pdf" maxSizeInMB={150} onFilesSelected={(f) => { setFile(f[0] ?? null); setResult(null); }}
              title="Choose a PDF" description="Drag & drop or click to browse" buttonText="Select PDF" icon={<Hash size={34} />} />
          </div>
        ) : (
          <div className="grid max-w-4xl items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
            <div className="space-y-5 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{file.name}</span>
                  <span className="text-xs text-muted-foreground">{pageCount ? `${pageCount} pages · ` : ""}{formatFileSize(file.size)}</span>
                </span>
                <button type="button" onClick={reset} className="min-h-11 shrink-0 text-sm text-muted-foreground hover:text-brand">Change file</button>
              </div>

              <fieldset>
                <legend className="mb-2 text-sm font-semibold">Position</legend>
                <div className="grid grid-cols-3 gap-2" role="radiogroup">
                  {POSITIONS.map((p) => (
                    <button key={p.id} type="button" role="radio" aria-checked={opts.position === p.id} onClick={() => set("position", p.id)} className={chip(opts.position === p.id)}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-sm font-semibold">Style</legend>
                <div className="flex flex-wrap gap-2" role="radiogroup">
                  {FORMATS.map((f) => (
                    <button key={f.id} type="button" role="radio" aria-checked={opts.format === f.id} onClick={() => set("format", f.id)} className={chip(opts.format === f.id)}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-sm font-semibold">Text size</legend>
                <div className="flex flex-wrap gap-2" role="radiogroup">
                  {SIZES.map((s) => (
                    <button key={s.value} type="button" role="radio" aria-checked={opts.fontSize === s.value} onClick={() => set("fontSize", s.value)} className={chip(opts.fontSize === s.value)}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-semibold">
                  Start numbering on page
                  <input type="number" inputMode="numeric" min={1} max={pageCount || undefined} value={opts.fromPage}
                    onChange={(e) => set("fromPage", Math.min(Math.max(1, Number(e.target.value) || 1), pageCount || 1))}
                    className="mt-1.5 h-11 w-full rounded-md border border-input bg-card px-3 font-normal" />
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">Use 2 to skip a cover page.</span>
                </label>
                <label className="text-sm font-semibold">
                  First number
                  <input type="number" inputMode="numeric" min={0} value={opts.startAt}
                    onChange={(e) => set("startAt", Math.max(0, Number(e.target.value) || 0))}
                    className="mt-1.5 h-11 w-full rounded-md border border-input bg-card px-3 font-normal" />
                </label>
              </div>

              {result ? (
                <div role="status" className="space-y-3 rounded-lg border border-brand/40 bg-brand-tint p-4">
                  <p className="text-sm font-semibold">{result.name} is ready · {numbered} page{numbered === 1 ? "" : "s"} numbered</p>
                  <SaveShareButtons file={result} />
                  <p className="text-xs text-muted-foreground">{SAVE_HINT}</p>
                </div>
              ) : (
                <button type="button" onClick={apply} disabled={busy}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60 sm:w-auto">
                  {busy && <Loader2 size={16} className="animate-spin" />} Add page numbers
                </button>
              )}
            </div>

            <figure className="order-first rounded-xl border border-border bg-muted p-3 md:order-none">
              <div className="relative mx-auto w-full max-w-[260px] overflow-hidden bg-white shadow-sm" style={{ aspectRatio: thumb ? `${thumb.w} / ${thumb.h}` : "1 / 1.414", containerType: "inline-size" }}>
                {thumb ? <img src={thumb.url} alt="" className="h-full w-full" /> : <Loader2 className="absolute inset-0 m-auto animate-spin text-muted-foreground" size={20} />}
                {thumb && (
                  <span
                    className="absolute whitespace-nowrap font-sans leading-none text-neutral-700"
                    style={{
                      // Same proportions as the PDF: points scaled to the preview's width.
                      fontSize: `${(opts.fontSize / thumb.w) * 100}cqw`,
                      ...(vertical === "top" ? { top: `${(opts.margin / thumb.h) * 100}%` } : { bottom: `${(opts.margin / thumb.h) * 100}%` }),
                      ...(horizontal === "left" ? { left: `${(opts.margin / thumb.w) * 100}%` }
                        : horizontal === "right" ? { right: `${(opts.margin / thumb.w) * 100}%` }
                        : { left: "50%", transform: "translateX(-50%)" }),
                    }}
                  >
                    {sample}
                  </span>
                )}
              </div>
              <figcaption className="mt-2 text-center text-xs text-muted-foreground">Preview of page {Math.min(opts.fromPage, pageCount || 1)}</figcaption>
            </figure>
          </div>
        )}
      </div>
    </section>
  );
};

export default AddPageNumbers;
