import { useCallback, useEffect, useRef, useState } from "react";
import {
  Copy, FilePlus2, GripVertical, LayoutGrid, Loader2, RotateCcw, RotateCw, Trash2, Undo2, FileMinus, Square,
} from "lucide-react";
import ToolHeader from "@/components/ToolHeader";
import FileUpload from "@/components/FileUpload";
import SaveShareButtons from "@/components/SaveShareButtons";
import { ensureUnlocked } from "@/components/UnlockPdfDialog";
import { useToast } from "@/hooks/use-toast";
import { useSortable } from "@/hooks/useSortable";
import { buildOrganizedPdf, newKey, readPages, type PageItem, type SourcePdf } from "@/lib/organize";
import { takeHandoff } from "@/lib/handoff";

const OrganizePdf = () => {
  const { toast } = useToast();
  const [sources, setSources] = useState<SourcePdf[]>([]);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [history, setHistory] = useState<PageItem[][]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [result, setResult] = useState<File | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const baseName = sources[0]?.file.name.replace(/\.pdf$/i, "") ?? "document";
  const [outputName, setOutputName] = useState<string | null>(null);
  const [cameFrom, setCameFrom] = useState<string | null>(null);

  /** Applies a change to the latest page list and records it for Undo. */
  const commit = useCallback((change: (prev: PageItem[]) => PageItem[]) => {
    setPages((prev) => {
      const next = change(prev);
      if (next !== prev) setHistory((h) => [...h.slice(-30), prev]);
      return next;
    });
    setResult(null);
  }, []);

  const undo = () => {
    setHistory((h) => {
      if (!h.length) return h;
      setPages(h[h.length - 1]);
      setResult(null);
      return h.slice(0, -1);
    });
  };

  const addFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setLoading(true);
    try {
      let first = true;
      for (const file of files) {
        const source = { id: newKey(), file };
        const items = await readPages(source, (key, url) =>
          setPages((prev) => prev.map((p) => (p.key === key ? { ...p, thumb: url } : p)))
        );
        // Add the cards straight away, before any thumbnail finishes, so no
        // thumbnail update arrives for a card that isn't in the list yet.
        const recordHistory = first;
        first = false;
        setSources((s) => [...s, source]);
        setPages((prev) => {
          if (recordHistory && prev.length) setHistory((h) => [...h, prev]);
          return [...prev, ...items];
        });
      }
      setResult(null);
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Couldn't open this PDF", description: err instanceof Error ? err.message : "Try a different file." });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Files passed from another tool (Merge → "Arrange pages first").
  useEffect(() => {
    const h = takeHandoff("/organize-pdf");
    if (!h?.files.length) return;
    setOutputName(h.outputName ?? null);
    setCameFrom(h.from ?? null);
    addFiles(h.files);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = () => {
    setOutputName(null);
    setCameFrom(null);
    setSources([]);
    setPages([]);
    setHistory([]);
    setSelected(new Set());
    setResult(null);
  };

  const toggle = (key: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  const targets = (key?: string) => (key ? [key] : Array.from(selected));

  const rotate = (delta: number, key?: string) => {
    const keys = new Set(targets(key));
    if (!keys.size) return;
    commit((prev) => prev.map((p) => (keys.has(p.key) ? { ...p, rotation: (p.rotation + delta + 360) % 360 } : p)));
  };

  const remove = (key?: string) => {
    const keys = new Set(targets(key));
    if (!keys.size) return;
    if (keys.size >= pages.length) {
      toast({ title: "Keep at least one page", description: "A PDF needs at least one page." });
      return;
    }
    commit((prev) => prev.filter((p) => !keys.has(p.key)));
    setSelected(new Set());
  };

  const duplicate = (key: string) =>
    commit((prev) => {
      const i = prev.findIndex((p) => p.key === key);
      if (i < 0) return prev;
      return [...prev.slice(0, i + 1), { ...prev[i], key: newKey() }, ...prev.slice(i + 1)];
    });

  const insertBlank = (key: string) =>
    commit((prev) => {
      const i = prev.findIndex((p) => p.key === key);
      if (i < 0) return prev;
      const ref = prev[i];
      const blank: PageItem = { key: newKey(), sourceId: "", index: -1, rotation: 0, baseRotation: 0, width: ref.width, height: ref.height };
      return [...prev.slice(0, i + 1), blank, ...prev.slice(i + 1)];
    });

  // Live reordering while dragging; the whole drag is one Undo step.
  const sortable = useSortable({
    count: pages.length,
    onStart: () => setHistory((h) => [...h.slice(-30), pages]),
    onMove: (from, to) =>
      setPages((prev) => {
        const next = [...prev];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        return next;
      }),
    onEnd: (moved) => {
      if (moved) setResult(null);
      else setHistory((h) => h.slice(0, -1));
    },
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const build = async (onlySelected: boolean) => {
    const chosen = onlySelected ? pages.filter((p) => selected.has(p.key)) : pages;
    if (!chosen.length) return;
    setBuilding(true);
    try {
      const name = onlySelected ? `${baseName}_pages.pdf` : outputName ?? `${baseName}_organised.pdf`;
      setResult(await buildOrganizedPdf(sources, chosen, name));
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Couldn't build the PDF", description: err instanceof Error ? err.message : "Try again." });
    } finally {
      setBuilding(false);
    }
  };

  const iconBtn = "grid h-11 w-11 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40";
  const toolbarBtn = "inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground hover:border-brand hover:text-brand disabled:pointer-events-none disabled:opacity-40";

  return (
    <section className="min-h-[60vh] bg-background py-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <ToolHeader category="Organise" title="Organise pages" description="Drag pages into order, rotate them, remove the ones you don't need, or pull out a few into a new PDF. Text and quality are kept exactly as they are." />

        {!pages.length ? (
          <div className="max-w-2xl rounded-xl border border-border bg-card p-6 shadow-sm">
            <FileUpload
              accept=".pdf,application/pdf"
              maxSizeInMB={150}
              multiple
              onFilesSelected={addFiles}
              title={loading ? "Opening…" : "Upload PDF"}
              description="Add one PDF, or several to combine and arrange together"
              buttonText="Select PDF"
              icon={loading ? <Loader2 size={34} className="animate-spin" /> : <LayoutGrid size={34} />}
            />
          </div>
        ) : (
          <>
            <div className="sticky top-[4.2rem] z-20 -mx-4 mb-4 border-y border-border bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-sm text-muted-foreground tabular-nums">
                  {selected.size ? `${selected.size} selected` : `${pages.length} page${pages.length === 1 ? "" : "s"}`}
                </span>
                <button type="button" className={toolbarBtn} onClick={() => setSelected(selected.size === pages.length ? new Set() : new Set(pages.map((p) => p.key)))}>
                  <Square size={15} /> {selected.size === pages.length ? "Select none" : "Select all"}
                </button>
                <button type="button" className={toolbarBtn} disabled={!selected.size} onClick={() => rotate(-90)}><RotateCcw size={15} /> Left</button>
                <button type="button" className={toolbarBtn} disabled={!selected.size} onClick={() => rotate(90)}><RotateCw size={15} /> Right</button>
                <button type="button" className={toolbarBtn} disabled={!selected.size} onClick={() => remove()}><Trash2 size={15} /> Delete</button>
                {selected.size === 1 && (
                  <button type="button" className={toolbarBtn} onClick={() => insertBlank(Array.from(selected)[0])}><FilePlus2 size={15} /> Blank page after</button>
                )}
                <button type="button" className={toolbarBtn} disabled={!history.length} onClick={undo} title="Undo (Ctrl+Z)"><Undo2 size={15} /> Undo</button>
                <button type="button" className={toolbarBtn} onClick={() => addInputRef.current?.click()}><FilePlus2 size={15} /> Add PDF</button>
                <input ref={addInputRef} type="file" accept=".pdf,application/pdf" multiple className="hidden"
                  onChange={async (e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; addFiles(await ensureUnlocked(f)); }} />
                <div className="ml-auto flex flex-wrap gap-2">
                  <button type="button" onClick={reset} className={toolbarBtn}>Start over</button>
                  {selected.size > 0 && (
                    <button type="button" onClick={() => build(true)} disabled={building} className={toolbarBtn}>
                      <FileMinus size={15} /> Extract selected
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => build(false)}
                    disabled={building}
                    className="inline-flex h-9 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                  >
                    {building && <Loader2 size={15} className="animate-spin" />} Create PDF
                  </button>
                </div>
              </div>
              {result && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                  <span className="text-sm text-foreground"><strong>{result.name}</strong> is ready.</span>
                  <SaveShareButtons file={result} />
                </div>
              )}
            </div>

            {cameFrom && sources.length > 1 && (
              <p className="mb-2 text-sm text-foreground">All {sources.length} files from {cameFrom} are here in order, {pages.length} pages. Arrange them, then tap Create PDF to get one merged file.</p>
            )}
            <p className="mb-3 text-xs text-muted-foreground">
              <span className="sm:hidden">Press and hold a page, then drag it to move it. Tap a page to select it.</span>
              <span className="hidden sm:inline">Drag a page to move it. Click a page to select it. Ctrl+Z undoes.</span>
            </p>

            <ol ref={sortable.containerRef} className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {pages.map((p, i) => {
                const isSel = selected.has(p.key);
                const turned = (p.baseRotation + p.rotation) % 180 !== 0;
                return (
                  <li
                    key={p.key}
                    {...sortable.itemProps(i)}
                    className={`sortable-item group relative flex flex-col rounded-lg border bg-card p-2 transition-shadow ${
                      isSel ? "border-brand ring-2 ring-brand/30" : "border-border"
                    } ${sortable.dragIndex === i ? "z-10 scale-[1.03] opacity-80 shadow-xl ring-2 ring-brand" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        aria-label={`Drag page ${i + 1}`}
                        {...sortable.handleProps(i)}
                        className="grid h-11 w-11 place-items-center rounded-md text-muted-foreground hover:bg-muted"
                      >
                        <GripVertical size={16} />
                      </button>
                      <span className="text-xs font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                      <input
                        type="checkbox"
                        aria-label={`Select page ${i + 1}`}
                        checked={isSel}
                        onChange={() => toggle(p.key)}
                        className="h-4 w-4 accent-[hsl(var(--brand))]"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => toggle(p.key)}
                      className="relative my-1 grid aspect-[3/4] place-items-center overflow-hidden rounded-md bg-muted"
                      aria-label={`Page ${i + 1}${isSel ? ", selected" : ""}`}
                    >
                      {p.index < 0 ? (
                        <span className="grid h-[88%] w-[66%] place-items-center border border-dashed border-border bg-white text-[11px] text-neutral-400">Blank page</span>
                      ) : p.thumb ? (
                        <img
                          src={p.thumb}
                          alt=""
                          draggable={false}
                          className="max-h-full max-w-full shadow-sm transition-transform duration-200"
                          style={{ transform: `rotate(${p.baseRotation + p.rotation}deg)`, maxWidth: turned ? "75%" : "100%", maxHeight: turned ? "75%" : "100%" }}
                        />
                      ) : (
                        <Loader2 size={18} className="animate-spin text-muted-foreground" />
                      )}
                    </button>

                    <div className="flex items-center justify-around">
                      <button type="button" className={iconBtn} aria-label={`Rotate page ${i + 1} left`} title="Rotate left" onClick={() => rotate(-90, p.key)}><RotateCcw size={15} /></button>
                      <button type="button" className={iconBtn} aria-label={`Rotate page ${i + 1} right`} title="Rotate right" onClick={() => rotate(90, p.key)}><RotateCw size={15} /></button>
                      <button type="button" className={iconBtn} aria-label={`Duplicate page ${i + 1}`} title="Duplicate" onClick={() => duplicate(p.key)}><Copy size={15} /></button>
                      <button type="button" className={iconBtn} aria-label={`Delete page ${i + 1}`} title="Delete" onClick={() => remove(p.key)}><Trash2 size={15} /></button>
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>
    </section>
  );
};

export default OrganizePdf;
