import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, BoxSelect, Loader2, Sheet as SheetIcon, Undo2, X } from "lucide-react";
import ToolHeader from "@/components/ToolHeader";
import FileUpload from "@/components/FileUpload";
import PagePreview from "@/components/PagePreview";
import ToolResult, { StickyAction, chipBtn, primaryBtn, secondaryBtn } from "@/components/ToolResult";
import { useToast } from "@/hooks/use-toast";
import { useFileVault } from "@/context/FileVault";
import { downloadFile, formatFileSize } from "@/lib/fileUtils";
import { useLivePreview } from "@/lib/livePreview";
import { cellKind, checkTotals, extractTables, joinContinued, tableInBox, type Extracted, type Table } from "@/lib/tables";
import { toCsv, writeXlsx, type Sheet } from "@/lib/xlsx";

type Scope = "tables" | "everything";
type Layout = "per-table" | "one-sheet";
type Selection = { kind: "col" | "row"; index: number } | null;

const colLetter = (i: number) => {
  let s = "";
  for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
};
const fmt = (n: number) => n.toLocaleString("en-GB", { maximumFractionDigits: 2 });
const pagesLabel = (t: Table) => (t.toPage ? `Pages ${t.page}–${t.toPage}` : `Page ${t.page}`);

/** Draw a box on a page to say "the table is here". Returns the box in points. */
const BoxPicker = ({ size, onBox }: { size: { width: number; height: number }; onBox: (b: { x0: number; y0: number; x1: number; y1: number }) => void }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const at = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  return (
    <div ref={ref} className="absolute inset-0 cursor-crosshair touch-none"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); const p = at(e); setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }); }}
      onPointerMove={(e) => { if (drag) { const p = at(e); setDrag({ ...drag, x1: p.x, y1: p.y }); } }}
      onPointerUp={() => {
        if (!drag) return;
        const b = { x0: Math.min(drag.x0, drag.x1) * size.width, y0: Math.min(drag.y0, drag.y1) * size.height, x1: Math.max(drag.x0, drag.x1) * size.width, y1: Math.max(drag.y0, drag.y1) * size.height };
        setDrag(null);
        if (b.x1 - b.x0 > 10 && b.y1 - b.y0 > 10) onBox(b);
      }}>
      {drag && (
        <div className="pointer-events-none absolute border-2 border-brand bg-brand/15"
          style={{ left: `${Math.min(drag.x0, drag.x1) * 100}%`, top: `${Math.min(drag.y0, drag.y1) * 100}%`, width: `${Math.abs(drag.x1 - drag.x0) * 100}%`, height: `${Math.abs(drag.y1 - drag.y0) * 100}%` }} />
      )}
    </div>
  );
};

const PdfToExcel = () => {
  const { toast } = useToast();
  const { files: vaultFiles, removeFile } = useFileVault();
  const [file, setFile] = useState<File | null>(null);
  const [scope, setScope] = useState<Scope>("tables");
  const [layout, setLayout] = useState<Layout>("per-table");
  const [headerRow, setHeaderRow] = useState(true);
  const [join, setJoin] = useState(true);
  const [found, setFound] = useState<Extracted | null>(null);
  const [picked, setPicked] = useState<Table[]>([]);
  const [edited, setEdited] = useState<Table[] | null>(null);
  const [reading, setReading] = useState(0);
  const [shown, setShown] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [picking, setPicking] = useState(false);
  const [pickPage, setPickPage] = useState(1);
  const [result, setResult] = useState<File | null>(null);
  const base = file?.name.replace(/\.pdf$/i, "") ?? "tables";

  useEffect(() => {
    if (!file) return;
    let alive = true;
    setReading(1); setFound(null); setResult(null); setShown(0); setPicked([]); setEdited(null);
    extractTables(file, scope === "everything", (d, t) => alive && setReading(Math.max(1, Math.round((d / t) * 100))))
      .then((r) => alive && setFound(r))
      .catch((err) => { console.error(err); toast({ variant: "destructive", title: "Couldn't read this PDF", description: "It may be damaged. Try Repair PDF first." }); })
      .finally(() => alive && setReading(0));
    return () => { alive = false; };
  }, [file, scope, toast]);

  // Tables as found, with any areas picked by hand replacing what was found on that page.
  const baseline = useMemo((): Table[] => {
    if (!found) return [];
    const pickedPages = new Set(picked.map((t) => t.page));
    const list = [...found.tables.filter((t) => !pickedPages.has(t.page)), ...picked].sort((a, b) => a.page - b.page);
    return join && scope === "tables" ? joinContinued(list) : list;
  }, [found, picked, join, scope]);

  // Any change to what was found throws away hand edits, which point at old rows.
  useEffect(() => { setEdited(null); setSelection(null); setResult(null); setShown((s) => Math.min(s, Math.max(0, baseline.length - 1))); }, [baseline]);

  const tables = edited ?? baseline;
  const table = tables[shown];

  const edit = (fn: (rows: string[][]) => string[][]) => {
    const next = tables.map((t, i) => (i === shown ? { ...t, rows: fn(t.rows.map((r) => [...r])) } : t)).filter((t) => t.rows.length && t.rows[0].length);
    setEdited(next); setSelection(null); setResult(null);
    if (shown >= next.length) setShown(Math.max(0, next.length - 1));
  };
  const actions = {
    deleteCol: (c: number) => edit((rows) => rows.map((r) => r.filter((_, i) => i !== c))),
    mergeRight: (c: number) => edit((rows) => rows.map((r) => [...r.slice(0, c), [r[c], r[c + 1]].filter(Boolean).join(" "), ...r.slice(c + 2)])),
    deleteRow: (r: number) => edit((rows) => rows.filter((_, i) => i !== r)),
    headingsHere: (r: number) => edit((rows) => rows.slice(r)),
    deleteTable: () => edit(() => []),
  };

  const problems = useMemo(() => tables.map((t) => checkTotals(t.rows, headerRow)), [tables, headerRow]);
  const problemCount = problems.reduce((n, p) => n + p.length, 0);
  const shownProblems = problems[shown] ?? [];
  const problemAt = (r: number, c: number) => shownProblems.find((p) => p.row === r && p.col === c);

  const sheets = useMemo((): Sheet[] => {
    if (!tables.length) return [];
    if (layout === "one-sheet") {
      const rows: string[][] = [];
      tables.forEach((t, i) => { if (i) rows.push([]); rows.push(...t.rows); });
      return [{ name: base, rows, boldFirstRow: headerRow && tables.length === 1 }];
    }
    const perPage = new Map<number, number>();
    return tables.map((t) => {
      const n = (perPage.get(t.page) ?? 0) + 1;
      perPage.set(t.page, n);
      const several = tables.filter((x) => x.page === t.page).length > 1;
      return { name: `${pagesLabel(t)}${several && scope === "tables" ? ` table ${n}` : ""}`, rows: t.rows, boldFirstRow: headerRow };
    });
  }, [tables, layout, headerRow, base, scope]);

  const preview = useLivePreview(picking ? file : null, pickPage, () => undefined, []);
  const onBox = (box: { x0: number; y0: number; x1: number; y1: number }) => {
    const pieces = found?.pieces[pickPage - 1] ?? [];
    const t = tableInBox(pieces, pickPage, box);
    if (!t) { toast({ title: "No text in that area", description: "Draw the box around the whole table, headings included." }); return; }
    setPicked((p) => [...p.filter((x) => x.page !== pickPage), t]);
    setPicking(false);
    toast({ title: `Table taken from page ${pickPage}`, description: `${t.rows.length} rows × ${t.rows[0].length} columns. It replaces what was found on that page.` });
  };

  const save = async () => {
    const blob = await writeXlsx(sheets);
    setResult(new File([blob], `${base}.xlsx`, { type: blob.type }));
  };

  const saveCsv = () => {
    if (!table) return;
    const csv = new File([toCsv(table.rows)], `${base}_${pagesLabel(table).toLowerCase().replace(/\s+/g, "")}.csv`, { type: "text/csv" });
    downloadFile(csv, csv.name, csv.type);
  };

  const reset = () => {
    vaultFiles.filter((vf) => vf.file === file).forEach((vf) => removeFile(vf.id));
    setFile(null); setFound(null); setResult(null); setPicked([]); setEdited(null); setPicking(false);
  };

  const noText = found && found.textPages === 0;
  const noTables = found && !noText && tables.length === 0;
  const rowsShown = table ? (showAll ? table.rows : table.rows.slice(0, 40)) : [];
  const joinedAny = baseline.some((t) => t.toPage);

  return (
    <section className="min-h-[60vh] bg-background py-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <ToolHeader category="Scan & convert" title="PDF to Excel" description="Pull tables such as inventories, schedules and budgets out of a PDF into a spreadsheet, without retyping. Numbers, amounts and dates come through as real values." />

        {!file ? (
          <div className="max-w-2xl rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
            <FileUpload accept=".pdf,application/pdf" maxSizeInMB={150} onFilesSelected={(f) => setFile(f[0] ?? null)}
              title="Choose a PDF with tables" description="Drag & drop or click to browse" buttonText="Select PDF" icon={<SheetIcon size={34} />} />
          </div>
        ) : (
          <div className="max-w-4xl space-y-5 rounded-xl border border-border bg-card p-4 pb-0 shadow-sm sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{file.name}</span>
                <span className="text-xs text-muted-foreground">{found ? `${found.pages} page${found.pages === 1 ? "" : "s"} · ` : ""}{formatFileSize(file.size)}</span>
              </span>
              <button type="button" onClick={reset} className="min-h-11 shrink-0 text-sm text-muted-foreground hover:text-brand">Change file</button>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-4">
              <fieldset>
                <legend className="mb-2 text-sm font-semibold">Take</legend>
                <div className="flex flex-wrap gap-2" role="radiogroup">
                  <button type="button" role="radio" aria-checked={scope === "tables"} className={chipBtn(scope === "tables")} onClick={() => setScope("tables")}>Tables only</button>
                  <button type="button" role="radio" aria-checked={scope === "everything"} className={chipBtn(scope === "everything")} onClick={() => setScope("everything")}>All text, in columns</button>
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-2 text-sm font-semibold">Put on</legend>
                <div className="flex flex-wrap gap-2" role="radiogroup">
                  <button type="button" role="radio" aria-checked={layout === "per-table"} className={chipBtn(layout === "per-table")} onClick={() => { setLayout("per-table"); setResult(null); }}>{scope === "tables" ? "A sheet per table" : "A sheet per page"}</button>
                  <button type="button" role="radio" aria-checked={layout === "one-sheet"} className={chipBtn(layout === "one-sheet")} onClick={() => { setLayout("one-sheet"); setResult(null); }}>One sheet</button>
                </div>
              </fieldset>
            </div>
            <div className="space-y-1">
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input type="checkbox" checked={headerRow} onChange={(e) => { setHeaderRow(e.target.checked); setResult(null); }} className="h-5 w-5 accent-[hsl(var(--brand))]" />
                First row is column headings (bold, stays in view when scrolling)
              </label>
              {scope === "tables" && (
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input type="checkbox" checked={join} onChange={(e) => setJoin(e.target.checked)} className="h-5 w-5 accent-[hsl(var(--brand))]" />
                  <span>Join tables that carry on over the next page{joinedAny && join ? <span className="text-muted-foreground"> · joined</span> : null}</span>
                </label>
              )}
            </div>

            {reading > 0 && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Reading pages… {reading}%</p>}

            {noText && (
              <div className="flex gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <p>This PDF has no text to read, so it's probably a scan or photo. Run <Link href="/ocr-pdf" className="font-semibold underline">OCR PDF</Link> on it first, then bring the result back here.</p>
              </div>
            )}
            {noTables && !picking && (
              <div className="rounded-lg border border-border bg-muted p-3 text-sm">
                <p>No tables were found. Tables need text lined up in columns.</p>
                <div className="mt-2 flex flex-wrap gap-x-4">
                  <button type="button" className="min-h-10 font-semibold text-brand underline underline-offset-4" onClick={() => setPicking(true)}>Draw a box around the table</button>
                  <button type="button" className="min-h-10 font-semibold text-brand underline underline-offset-4" onClick={() => setScope("everything")}>Take all text in columns instead</button>
                </div>
              </div>
            )}

            {found && !noText && (
              picking ? (
                <div className="grid items-start gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
                  <div className="space-y-2 text-sm">
                    <p className="font-semibold">Draw a box around the table</p>
                    <p className="text-muted-foreground">Go to the right page with the arrows, then drag from one corner of the table to the other, headings included. What's inside becomes the table for that page.</p>
                    <button type="button" className={secondaryBtn} onClick={() => setPicking(false)}><X size={16} /> Cancel</button>
                  </div>
                  <PagePreview preview={preview.preview} busy={preview.busy} error={preview.error} page={pickPage} pageCount={found.pages} onPage={setPickPage} caption="Drag over the table">
                    {preview.preview && <BoxPicker size={preview.preview} onBox={onBox} />}
                  </PagePreview>
                </div>
              ) : tables.length > 0 && (
                <button type="button" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-brand underline underline-offset-4" onClick={() => { setPickPage(table?.page ?? 1); setPicking(true); }}>
                  <BoxSelect size={16} /> A table is missing or split wrongly? Draw a box around it
                </button>
              )
            )}

            {problemCount > 0 && !picking && (
              <div role="alert" className="flex gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">{problemCount} total{problemCount === 1 ? " doesn't" : "s don't"} add up</p>
                  <ul className="mt-1 space-y-0.5">
                    {problems.flatMap((ps, ti) => ps.map((p) => ({ ...p, ti }))).slice(0, 4).map((p, i) => (
                      <li key={i}>
                        <button type="button" className="text-left underline underline-offset-2" onClick={() => setShown(p.ti)}>
                          {pagesLabel(tables[p.ti])}, column {colLetter(p.col)}{headerRow && tables[p.ti].rows[0][p.col] ? ` (${tables[p.ti].rows[0][p.col]})` : ""}: says {fmt(p.stated)}, the rows above add up to {fmt(p.added)}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs">Often a misread digit in a scan, or a typing slip in the original. Check against the PDF.</p>
                </div>
              </div>
            )}

            {table && !picking && (
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {scope === "tables" ? `${tables.length} table${tables.length === 1 ? "" : "s"}` : `${tables.length} page${tables.length === 1 ? "" : "s"} of text`}
                    {found!.textPages < found!.pages && <span className="font-normal text-muted-foreground"> · {found!.pages - found!.textPages} page{found!.pages - found!.textPages === 1 ? "" : "s"} without text skipped</span>}
                  </p>
                  {tables.length > 1 && (
                    <select value={shown} onChange={(e) => { setShown(Number(e.target.value)); setSelection(null); }} aria-label="Table to preview" className="h-10 rounded-md border border-input bg-card px-2 text-sm">
                      {tables.map((t, i) => <option key={i} value={i}>{sheets[i]?.name ?? pagesLabel(t)} · {t.rows.length} rows{problems[i]?.length ? " · check totals" : ""}</option>)}
                    </select>
                  )}
                </div>

                <div className="mb-2 flex min-h-11 flex-wrap items-center gap-2 rounded-lg bg-muted px-2 py-1.5 text-sm">
                  {!selection ? (
                    <span className="px-1 text-xs text-muted-foreground">Tap a column letter or row number to fix the table.</span>
                  ) : selection.kind === "col" ? (
                    <>
                      <span className="px-1 font-semibold">Column {colLetter(selection.index)}</span>
                      {selection.index < table.rows[0].length - 1 && <button type="button" className={chipBtn(false)} onClick={() => actions.mergeRight(selection.index)}>Join with {colLetter(selection.index + 1)}</button>}
                      <button type="button" className={chipBtn(false)} onClick={() => actions.deleteCol(selection.index)}>Delete column</button>
                      <button type="button" aria-label="Close" className="ml-auto grid h-10 w-10 place-items-center rounded-md hover:bg-card" onClick={() => setSelection(null)}><X size={16} /></button>
                    </>
                  ) : (
                    <>
                      <span className="px-1 font-semibold">Row {selection.index + 1}</span>
                      <button type="button" className={chipBtn(false)} onClick={() => actions.deleteRow(selection.index)}>Delete row</button>
                      {selection.index > 0 && <button type="button" className={chipBtn(false)} onClick={() => actions.headingsHere(selection.index)}>Headings start here</button>}
                      <button type="button" aria-label="Close" className="ml-auto grid h-10 w-10 place-items-center rounded-md hover:bg-card" onClick={() => setSelection(null)}><X size={16} /></button>
                    </>
                  )}
                  {edited && !selection && (
                    <button type="button" className="ml-auto inline-flex min-h-10 items-center gap-1.5 px-2 text-xs font-semibold text-brand" onClick={() => { setEdited(null); setResult(null); }}><Undo2 size={14} /> Undo my changes</button>
                  )}
                </div>

                <div className="max-h-96 overflow-auto rounded-lg border border-border">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="sticky top-0 z-10 bg-muted">
                        <th className="sticky left-0 z-10 border-b border-r border-border bg-muted" />
                        {table.rows[0].map((_, ci) => (
                          <th key={ci} className="border-b border-r border-border p-0">
                            <button type="button" onClick={() => setSelection({ kind: "col", index: ci })} aria-pressed={selection?.kind === "col" && selection.index === ci}
                              className={`h-8 w-full min-w-10 font-semibold ${selection?.kind === "col" && selection.index === ci ? "bg-brand text-white" : "text-muted-foreground hover:text-brand"}`}>{colLetter(ci)}</button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rowsShown.map((r, ri) => {
                        const rowSel = selection?.kind === "row" && selection.index === ri;
                        return (
                          <tr key={ri} className={rowSel ? "bg-brand-tint" : ri === 0 && headerRow ? "bg-muted font-semibold" : "odd:bg-card even:bg-muted/40"}>
                            <td className="sticky left-0 border-r border-border bg-muted p-0">
                              <button type="button" onClick={() => setSelection({ kind: "row", index: ri })} aria-pressed={rowSel} aria-label={`Row ${ri + 1}`}
                                className={`h-7 w-full min-w-8 px-1.5 text-right tabular-nums ${rowSel ? "bg-brand text-white" : "text-muted-foreground hover:text-brand"}`}>{ri + 1}</button>
                            </td>
                            {r.map((c, ci) => {
                              const k = ri === 0 && headerRow ? null : cellKind(c);
                              const bad = problemAt(ri, ci);
                              const colSel = selection?.kind === "col" && selection.index === ci;
                              return (
                                <td key={ci} title={bad ? `Rows above add up to ${fmt(bad.added)}` : undefined}
                                  className={`whitespace-nowrap border-r border-border px-2 py-1 ${k && k.type !== "text" ? "text-right tabular-nums" : ""} ${bad ? "bg-amber-200 font-semibold text-amber-950 dark:bg-amber-800 dark:text-amber-50" : colSel ? "bg-brand-tint" : ""}`}>{c}</td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {table.rows.length > 40 && (
                    <button type="button" className="mr-1 font-semibold text-brand underline underline-offset-2" onClick={() => setShowAll((v) => !v)}>
                      {showAll ? "Show first 40 rows" : `Show all ${table.rows.length} rows`}
                    </button>
                  )}
                  Right-aligned cells become numbers or dates in Excel; GH₵ amounts keep two decimals. Check merged or wrapped cells before relying on totals.
                </p>
              </div>
            )}

            <StickyAction>
              {result ? (
                <ToolResult files={[result]} detail={`${sheets.length} sheet${sheets.length === 1 ? "" : "s"}. Opens in Excel, Google Sheets and WPS.`}
                  actions={<><button type="button" className={secondaryBtn} onClick={saveCsv}>Save shown table as CSV</button><button type="button" className={secondaryBtn} onClick={() => setResult(null)}>Keep editing</button><button type="button" className={secondaryBtn} onClick={reset}>Use another file</button></>} />
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button type="button" onClick={save} disabled={!tables.length || reading > 0 || picking} className={primaryBtn}>
                    <SheetIcon size={16} /> Create Excel file
                  </button>
                  {table && <button type="button" onClick={saveCsv} className={`${secondaryBtn} hidden sm:inline-flex`}>Save as CSV</button>}
                </div>
              )}
            </StickyAction>
          </div>
        )}
      </div>
    </section>
  );
};

export default PdfToExcel;
