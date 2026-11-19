import { useEffect, useRef, useState } from "react";
import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";
import { AlertTriangle, Loader2, PanelTop } from "lucide-react";
import ToolHeader from "@/components/ToolHeader";
import FileUpload from "@/components/FileUpload";
import PagePreview from "@/components/PagePreview";
import ToolResult, { StickyAction, chipBtn, primaryBtn, secondaryBtn } from "@/components/ToolResult";
import { useToast } from "@/hooks/use-toast";
import { useFileVault } from "@/context/FileVault";
import { formatFileSize } from "@/lib/fileUtils";
import { useLivePreview } from "@/lib/livePreview";
import {
  applyHeaderFooter, DEFAULT_HEADER_FOOTER, findOverlaps, headerFooterPdf, isEmpty, pageInk, pageNumbering, TOKENS,
  type HeaderFooterOptions, type Slots,
} from "@/lib/headerFooter";

const QUICK: { label: string; apply: (o: HeaderFooterOptions) => HeaderFooterOptions }[] = [
  { label: "Page X of Y", apply: (o) => ({ ...o, footer: { ...o.footer, center: "Page {page} of {pages}" } }) },
  { label: "File name & date", apply: (o) => ({ ...o, header: { ...o.header, left: "{filename}", right: "{date}" } }) },
  { label: "Forestry Commission", apply: (o) => ({ ...o, header: { ...o.header, left: "Forestry Commission, Ghana" } }) },
  { label: "Confidential", apply: (o) => ({ ...o, header: { ...o.header, right: "CONFIDENTIAL" } }) },
  { label: "Reference no. (0001)", apply: (o) => ({ ...o, header: { ...o.header, right: "FC/REF/{page}" }, digits: o.digits || 4 }) },
];

type Ink = Awaited<ReturnType<typeof pageInk>>;

/** Pages where the text would land on the document's own content. Checked in the background. */
function useOverlaps(file: File | null, opts: HeaderFooterOptions, totalPages: number) {
  const [ink, setInk] = useState<{ file: File; pages: Ink } | null>(null);
  const font = useRef<PDFFont | null>(null);
  const [hits, setHits] = useState<number[]>([]);
  useEffect(() => {
    if (!file) return;
    let alive = true;
    (async () => {
      if (!font.current) font.current = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
      const pages = await pageInk(file);
      if (alive) setInk({ file, pages });
    })().catch((err) => console.warn("overlap check skipped", err));
    return () => { alive = false; };
  }, [file]);
  useEffect(() => {
    if (!file || ink?.file !== file || !font.current || isEmpty(opts)) { setHits([]); return; }
    const t = window.setTimeout(() => setHits(findOverlaps(opts, ink.pages, font.current!, file.name, totalPages || ink.pages.length)), 250);
    return () => window.clearTimeout(t);
  }, [file, ink, opts, totalPages]);
  return { hits, checked: ink?.file === file ? ink.pages.length : 0 };
}

const pageList = (pages: number[]) => {
  const shown = pages.slice(0, 8).join(", ");
  return pages.length > 8 ? `${shown} and ${pages.length - 8} more` : shown;
};

const SIZES = [{ label: "Small", value: 8 }, { label: "Medium", value: 10 }, { label: "Large", value: 12 }];

const HeadersFooters = () => {
  const { toast } = useToast();
  const { files: vaultFiles, removeFile } = useFileVault();
  const [file, setFile] = useState<File | null>(null);
  const [opts, setOpts] = useState<HeaderFooterOptions>(DEFAULT_HEADER_FOOTER);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ file: File; changedText: boolean } | null>(null);
  const lastField = useRef<{ row: "header" | "footer"; pos: keyof Slots }>({ row: "footer", pos: "center" });

  const update = (next: HeaderFooterOptions) => { setOpts(next); setResult(null); };
  const setSlot = (row: "header" | "footer", pos: keyof Slots, value: string) => update({ ...opts, [row]: { ...opts[row], [pos]: value } });
  const insertToken = (token: string) => {
    const { row, pos } = lastField.current;
    setSlot(row, pos, (opts[row][pos] + (opts[row][pos] && !opts[row][pos].endsWith(" ") ? " " : "") + token).slice(0, 80));
  };

  const live = useLivePreview(file, page, async (doc, n, total) => {
    await applyHeaderFooter(doc, opts, { fileName: file?.name ?? "", totalPages: total, firstPage: n });
  }, [opts]);

  const overlaps = useOverlaps(file, opts, live.pageCount);
  const numbersUsed = /\{page|\{pages/i.test([...Object.values(opts.header), ...Object.values(opts.footer)].join(" "));
  const firstNumbered = live.pageCount ? pageNumbering(opts, opts.skipFirst ? 2 : 1, live.pageCount) : null;

  const apply = async () => {
    if (!file) return;
    setBusy(true);
    try {
      setResult(await headerFooterPdf(file, opts));
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Couldn't add headers and footers", description: "The file may be damaged. Try Repair PDF first." });
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    vaultFiles.filter((vf) => vf.file === file).forEach((vf) => removeFile(vf.id));
    setFile(null); setResult(null); setPage(1);
  };

  const row = (name: "header" | "footer", title: string) => (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold">{title}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {(["left", "center", "right"] as const).map((pos) => (
          <label key={pos} className="block">
            <span className="mb-1 block text-xs text-muted-foreground">{pos === "center" ? "Centre" : pos === "left" ? "Left" : "Right"}</span>
            <input value={opts[name][pos]} maxLength={80} onFocus={() => (lastField.current = { row: name, pos })}
              onChange={(e) => setSlot(name, pos, e.target.value)}
              className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm" />
          </label>
        ))}
      </div>
    </fieldset>
  );

  return (
    <section className="min-h-[60vh] bg-background py-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <ToolHeader category="Official documents" title="Headers & footers" description="Add a reference, department, date, classification or page numbers to the top and bottom of every page." />

        {!file ? (
          <div className="max-w-2xl rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
            <FileUpload accept=".pdf,application/pdf" maxSizeInMB={150} onFilesSelected={(f) => { setFile(f[0] ?? null); setResult(null); setPage(1); }}
              title="Choose a PDF" description="Drag & drop or click to browse" buttonText="Select PDF" icon={<PanelTop size={34} />} />
          </div>
        ) : (
          <div className="grid max-w-5xl items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
            <div className="space-y-5 rounded-xl border border-border bg-card p-4 pb-0 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{file.name}</span>
                  <span className="text-xs text-muted-foreground">{live.pageCount ? `${live.pageCount} pages · ` : ""}{formatFileSize(file.size)}</span>
                </span>
                <button type="button" onClick={reset} className="min-h-11 shrink-0 text-sm text-muted-foreground hover:text-brand">Change file</button>
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold">Quick start <span className="font-normal text-muted-foreground">· check the preview doesn't cover the page's own text</span></p>
                <div className="flex flex-wrap gap-2">
                  {QUICK.map((q) => <button key={q.label} type="button" className={chipBtn(false)} onClick={() => update(q.apply(opts))}>{q.label}</button>)}
                  <button type="button" className="min-h-11 px-2 text-sm text-muted-foreground underline underline-offset-4" onClick={() => update({ ...opts, header: { left: "", center: "", right: "" }, footer: { left: "", center: "", right: "" } })}>Clear all</button>
                </div>
              </div>

              {row("header", "Header (top of page)")}
              {row("footer", "Footer (bottom of page)")}

              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">Insert into the last box you tapped:</p>
                <div className="flex flex-wrap gap-1.5">
                  {TOKENS.map((t) => (
                    <button key={t.token} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertToken(t.token)}
                      className="min-h-9 rounded-full border border-border bg-card px-3 text-xs font-medium hover:border-brand hover:text-brand">{t.label}</button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
                <fieldset>
                  <legend className="mb-2 text-sm font-semibold">Text size</legend>
                  <div className="flex gap-2" role="radiogroup">
                    {SIZES.map((s) => <button key={s.value} type="button" role="radio" aria-checked={opts.fontSize === s.value} className={chipBtn(opts.fontSize === s.value)} onClick={() => update({ ...opts, fontSize: s.value })}>{s.label}</button>)}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="mb-2 text-sm font-semibold">Colour</legend>
                  <div className="flex gap-2" role="radiogroup">
                    {(["grey", "black"] as const).map((c) => <button key={c} type="button" role="radio" aria-checked={opts.colour === c} className={chipBtn(opts.colour === c)} onClick={() => update({ ...opts, colour: c })}>{c === "grey" ? "Grey" : "Black"}</button>)}
                  </div>
                </fieldset>
              </div>
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input type="checkbox" checked={opts.skipFirst} onChange={(e) => update({ ...opts, skipFirst: e.target.checked })} className="h-5 w-5 accent-[hsl(var(--brand))]" />
                Leave the first page (cover) blank
              </label>

              {numbersUsed && (
                <fieldset className="space-y-3 rounded-lg border border-border p-3">
                  <legend className="px-1 text-sm font-semibold">Numbering</legend>
                  <div className="flex flex-wrap gap-x-5 gap-y-3">
                    <label className="text-xs text-muted-foreground">
                      Start at
                      <input type="number" inputMode="numeric" min={0} max={99999} value={opts.startAt}
                        onChange={(e) => update({ ...opts, startAt: Math.min(99999, Math.max(0, Math.round(Number(e.target.value) || 0))) })}
                        className="mt-1 block h-11 w-24 rounded-md border border-input bg-card px-3 text-sm text-foreground" />
                    </label>
                    <fieldset>
                      <legend className="mb-1 text-xs text-muted-foreground">Digits</legend>
                      <div className="flex gap-2" role="radiogroup">
                        {[0, 3, 4].map((d) => (
                          <button key={d} type="button" role="radio" aria-checked={opts.digits === d} className={chipBtn(opts.digits === d)} onClick={() => update({ ...opts, digits: d })}>
                            {d === 0 ? "1" : "1".padStart(d, "0")}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  </div>
                  {opts.skipFirst && (
                    <label className="flex min-h-11 items-center gap-3 text-sm">
                      <input type="checkbox" checked={!opts.countCover} onChange={(e) => update({ ...opts, countCover: !e.target.checked })} className="h-5 w-5 accent-[hsl(var(--brand))]" />
                      Don't count the cover (the page after it is page {opts.startAt})
                    </label>
                  )}
                  {firstNumbered && (
                    <p className="text-xs text-muted-foreground">
                      Page {opts.skipFirst ? 2 : 1} of the file will show {String(firstNumbered.page).padStart(opts.digits, "0")}; the last page shows {String(firstNumbered.pages).padStart(opts.digits, "0")}.
                    </p>
                  )}
                </fieldset>
              )}

              {overlaps.hits.length > 0 && (
                <div role="alert" className="flex gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                  <div>
                    <p>This would print over, or right against, the document's own text on page{overlaps.hits.length === 1 ? "" : "s"} {pageList(overlaps.hits)}.</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" className="min-h-10 font-semibold underline underline-offset-4" onClick={() => setPage(overlaps.hits[0])}>Show page {overlaps.hits[0]}</button>
                      {opts.margin > 14 && <button type="button" className="min-h-10 font-semibold underline underline-offset-4" onClick={() => update({ ...opts, margin: 14 })}>Move closer to the edge</button>}
                      {opts.fontSize > 8 && <button type="button" className="min-h-10 font-semibold underline underline-offset-4" onClick={() => update({ ...opts, fontSize: 8 })}>Use small text</button>}
                    </div>
                  </div>
                </div>
              )}

              <StickyAction>
                {result ? (
                  <ToolResult files={[result.file]} detail="Added as real text, so it can be searched and copied."
                    actions={<><button type="button" className={secondaryBtn} onClick={() => setResult(null)}>Change settings</button><button type="button" className={secondaryBtn} onClick={reset}>Use another file</button></>}>
                    {result.changedText && <p className="text-xs text-amber-800 dark:text-amber-200">Some characters aren't in the PDF font and were replaced. Check the preview.</p>}
                  </ToolResult>
                ) : (
                  <button type="button" onClick={apply} disabled={busy || isEmpty(opts)} className={primaryBtn}>
                    {busy ? <Loader2 size={16} className="animate-spin" /> : <PanelTop size={16} />} Add to {live.pageCount || "all"} page{live.pageCount === 1 ? "" : "s"}
                  </button>
                )}
              </StickyAction>
            </div>

            <div className="order-first md:sticky md:top-24 md:order-none">
              <PagePreview preview={live.preview} busy={live.busy} error={live.error} page={page} pageCount={live.pageCount} onPage={setPage} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default HeadersFooters;
