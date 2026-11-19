import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight, Bold, CalendarDays, Check, ChevronLeft, ChevronRight, Circle, Copy, Download, Eraser, Highlighter, Image as ImageIcon,
  Italic, Loader2, Minus, MousePointer2, PenLine, Pencil, Plus, Redo2, Shapes, Square, Stamp, Trash2, Type, Undo2, X, ZoomIn, ZoomOut, Slash,
} from "lucide-react";
import { loadPdfDocument, renderPdfPageToCanvas } from "@/lib/pdfjs";
import { BASELINE, exportEditedPdf } from "@/lib/editor/exportPdf";
import { CSS_FONT, measureText, rasterizeText } from "@/lib/editor/measure";
import { readTextBlocks, blockAt, signatureLabel, type TextBlock } from "@/lib/editor/pageText";
import {
  COLORS, STAMPS, boundsOf, moveObject, newId, resizeObject,
  type EditorObject, type ObjectKind, type PageSize, type Point, type TextObject,
} from "@/lib/editor/types";
import { addSignRecord } from "@/lib/signRecord";
import { writeEditDraft } from "@/lib/editor/draft";
import { imageCanvas } from "@/lib/addons/images";
import { useToast } from "@/hooks/use-toast";
import SignatureSheet, { type Signature } from "./SignatureSheet";
import { ObjectView, cq } from "./ObjectView";
import ResultSheet from "./ResultSheet";

type PdfDoc = Awaited<ReturnType<typeof loadPdfDocument>>;
type Tool = "select" | "text" | "pen" | "highlighter";
type Drag =
  | { mode: "move"; id: string; start: Point; origin: EditorObject; moved: boolean; snapshot: EditorObject[]; wasSelected: boolean }
  | { mode: "resize"; id: string; start: Point; origin: EditorObject; snapshot: EditorObject[]; keepAspect: boolean }
  | { mode: "end"; id: string; which: "from" | "to"; snapshot: EditorObject[] }
  | { mode: "ink"; page: number; points: Point[]; tool: "pen" | "highlighter" };

const MAX_PAGE_WIDTH = 920;
const HISTORY = 60;

const hint: Record<Tool, string> = {
  select: "Tap any text to change it, or choose a tool below.",
  text: "Tap where you want to add text.",
  pen: "Draw with your finger, pen or mouse. Tap Done when you've finished.",
  highlighter: "Drag over text to highlight it. Tap Done when you've finished.",
};

const today = () => new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

interface Props {
  file: File;
  /** Open the signature sheet as soon as the document is ready. */
  startWithSignature?: boolean;
  /** Objects from a recovered draft. */
  initialObjects?: EditorObject[];
  /** Where this person's draft is kept (see lib/editor/draft.ts). */
  draftScope: string;
  onClose: () => void;
}

const EditorWorkspace = ({ file, startWithSignature, initialObjects, draftScope, onClose }: Props) => {
  const { toast } = useToast();
  const [pdf, setPdf] = useState<PdfDoc | null>(null);
  const [sizes, setSizes] = useState<PageSize[]>([]);
  const [images, setImages] = useState<Record<number, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [objects, setObjects] = useState<EditorObject[]>(initialObjects ?? []);
  const [past, setPast] = useState<EditorObject[][]>([]);
  const [future, setFuture] = useState<EditorObject[][]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [ink, setInk] = useState<string>(COLORS[1].id);
  const [menu, setMenu] = useState<null | "draw" | "insert" | "stamp">(null);
  const [signOpen, setSignOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [areaWidth, setAreaWidth] = useState(0);
  const [current, setCurrent] = useState(0);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ file: File; signed: boolean; covered: boolean } | null>(null);
  const [savedVersion, setSavedVersion] = useState<EditorObject[] | null>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const blocks = useRef(new Map<number, TextBlock[]>());
  const drag = useRef<Drag | null>(null);
  const [liveInk, setLiveInk] = useState<{ page: number; points: Point[]; tool: "pen" | "highlighter" } | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const autoSign = useRef(startWithSignature);

  const selected = objects.find((o) => o.id === selectedId) ?? null;
  const dirty = objects !== savedVersion && objects.length > 0;

  /* ---------------- document loading ---------------- */

  useEffect(() => {
    let alive = true;
    let doc: PdfDoc | null = null;
    (async () => {
      try {
        doc = await loadPdfDocument(file);
        const s: PageSize[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const vp = (await doc.getPage(i)).getViewport({ scale: 1 });
          s.push({ width: vp.width, height: vp.height });
        }
        if (!alive) return;
        setPdf(doc);
        setSizes(s);
      } catch (err) {
        console.error(err);
        if (alive) setLoadError("This PDF couldn't be opened. It may be damaged; try Repair PDF first.");
      }
    })();
    return () => { alive = false; doc?.destroy(); };
  }, [file]);

  // Render pages as they come near the screen.
  useEffect(() => {
    if (!pdf || !sizes.length) return;
    const pending = new Set<number>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const i = Number((e.target as HTMLElement).dataset.page);
        if (!e.isIntersecting || pending.has(i)) continue;
        pending.add(i);
        (async () => {
          const target = Math.min(2200, MAX_PAGE_WIDTH * Math.min(2.5, window.devicePixelRatio || 1));
          const canvas = await renderPdfPageToCanvas(pdf, i + 1, target / sizes[i].width);
          const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.9));
          canvas.width = canvas.height = 0;
          if (blob) setImages((m) => ({ ...m, [i]: URL.createObjectURL(blob) }));
        })().catch(() => pending.delete(i));
      }
    }, { root: scrollRef.current, rootMargin: "1200px 0px" });
    pageRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [pdf, sizes]);
  const imagesRef = useRef(images);
  imagesRef.current = images;
  useEffect(() => () => Object.values(imagesRef.current).forEach(URL.revokeObjectURL), []);

  // Track the page in view.
  useEffect(() => {
    if (!sizes.length) return;
    const io = new IntersectionObserver((entries) => {
      const best = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (best) setCurrent(Number((best.target as HTMLElement).dataset.page));
    }, { root: scrollRef.current, threshold: [0.25, 0.5, 0.75] });
    pageRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [sizes]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAreaWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Full-screen editor: keep the page behind it still, and warn before losing work.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (sizes.length && autoSign.current && !initialObjects?.length) { autoSign.current = false; setSignOpen(true); }
  }, [sizes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep a draft on this device while there is work to lose.
  useEffect(() => {
    if (!objects.length) return;
    const t = window.setTimeout(() => {
      writeEditDraft({ version: 1, savedAt: Date.now(), file, name: file.name, objects }, draftScope).catch(() => undefined);
    }, 700);
    return () => window.clearTimeout(t);
  }, [objects, file, draftScope]);
  const finish = () => { writeEditDraft(null, draftScope).catch(() => undefined); onClose(); };

  const textBlocks = useCallback(async (page: number) => {
    if (!pdf) return [];
    if (!blocks.current.has(page)) blocks.current.set(page, await readTextBlocks(pdf, page + 1).catch(() => []));
    return blocks.current.get(page)!;
  }, [pdf]);

  /* ---------------- history ---------------- */

  const commit = useCallback((next: EditorObject[] | ((prev: EditorObject[]) => EditorObject[]), snapshot?: EditorObject[]) => {
    setObjects((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      if (value === prev) return prev;
      setPast((p) => [...p.slice(-HISTORY), snapshot ?? prev]);
      setFuture([]);
      return value;
    });
  }, []);
  const undo = () => {
    if (!past.length) return;
    setFuture((f) => [objects, ...f]);
    setObjects(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
    setEditingId(null);
  };
  const redo = () => {
    if (!future.length) return;
    setPast((p) => [...p, objects]);
    setObjects(future[0]);
    setFuture((f) => f.slice(1));
  };

  const update = (id: string, change: Partial<EditorObject> | ((o: EditorObject) => EditorObject), record = true) => {
    const apply = (prev: EditorObject[]) => prev.map((o) => {
      if (o.id !== id) return o;
      let next = (typeof change === "function" ? change(o) : { ...o, ...change }) as EditorObject;
      if (next.kind === "text") next = { ...next, ...measureText(next) };
      return next;
    });
    record ? commit(apply) : setObjects(apply);
  };

  const remove = (id: string) => { commit((prev) => prev.filter((o) => o.id !== id)); setSelectedId(null); setEditingId(null); };
  const duplicate = (id: string) => {
    const o = objects.find((x) => x.id === id);
    if (!o) return;
    const copy = { ...moveObject(o, 12, 12), id: newId() };
    commit((prev) => [...prev, copy]);
    setSelectedId(copy.id);
  };

  // Typing is one undo step, and an empty new text box disappears when you finish.
  const editStart = useRef<{ id: string; before: EditorObject[] } | null>(null);
  useEffect(() => {
    const prevEdit = editStart.current;
    editStart.current = editingId ? { id: editingId, before: objects } : null;
    if (!prevEdit || prevEdit.id === editingId) return;
    const edited = objects.find((o) => o.id === prevEdit.id);
    if (edited?.kind === "text" && !edited.text.trim() && !edited.cover) {
      // Abandoned new box: remove it, and the undo step that added it.
      setObjects(objects.filter((o) => o.id !== edited.id));
      setPast((p) => p.slice(0, -1));
      setSelectedId((id) => (id === edited.id ? null : id));
      return;
    }
    const original = prevEdit.before.find((o) => o.id === prevEdit.id);
    if (edited && original && edited !== original) setPast((p) => [...p.slice(-HISTORY), prevEdit.before]);
  }, [editingId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------- geometry ---------------- */

  const fitWidth = Math.max(240, Math.min(areaWidth - 24, MAX_PAGE_WIDTH));
  const pageCssWidth = (i: number) => fitWidth * zoom * (sizes[i] ? sizes[i].width / Math.max(...sizes.map((s) => s.width)) : 1);

  /** Pointer position in page points. */
  const toPage = (page: number, e: { clientX: number; clientY: number }): Point => {
    const el = pageRefs.current[page]!;
    const r = el.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * sizes[page].width, y: ((e.clientY - r.top) / r.height) * sizes[page].height };
  };

  /** The middle of the part of a page that's on screen, in page points. */
  const viewCenter = (page: number): Point => {
    const el = pageRefs.current[page], area = scrollRef.current;
    if (!el || !area) return { x: sizes[page].width / 2, y: sizes[page].height / 2 };
    const r = el.getBoundingClientRect(), a = area.getBoundingClientRect();
    const top = Math.max(r.top, a.top), bottom = Math.min(r.bottom, a.bottom - 120);
    return toPage(page, { clientX: r.left + r.width / 2, clientY: bottom > top ? (top + bottom) / 2 : r.top + r.height / 2 });
  };

  const clampBox = (page: number, b: { x: number; y: number; w: number; h: number }) => {
    const s = sizes[page];
    const w = Math.min(b.w, s.width), h = Math.min(b.h, s.height);
    return { x: Math.min(Math.max(0, b.x), s.width - w), y: Math.min(Math.max(0, b.y), s.height - h), w, h };
  };

  const add = (o: EditorObject, opts: { edit?: boolean } = {}) => {
    // Inserting twice without moving: step the new one down and right so they don't stack.
    let placed = o;
    for (let i = 0; i < 20 && objects.some((x) => x.page === placed.page && Math.abs(x.x + x.w / 2 - placed.x - placed.w / 2) < 6 && Math.abs(x.y + x.h / 2 - placed.y - placed.h / 2) < 6); i++) {
      placed = moveObject(placed, 0, Math.max(14, placed.h + 6));
    }
    o = placed;
    commit((prev) => [...prev, o]);
    setSelectedId(o.id);
    setEditingId(opts.edit ? o.id : null);
    setTool("select");
    setMenu(null);
  };

  const newText = (page: number, at: Point, init: Partial<TextObject> = {}): TextObject => {
    const base: TextObject = { id: newId(), page, kind: "text", x: at.x, y: at.y, w: 0, h: 0, text: "", font: "sans", size: 12, bold: false, italic: false, color: "#111827", ...init };
    return { ...base, ...measureText(base) };
  };

  /* ---------------- placing things ---------------- */

  const placeSignature = async (sig: Signature) => {
    const page = current;
    const s = sizes[page];
    let w = Math.min(s.width * 0.3, 190), h = w / sig.aspect;
    if (h > s.height * 0.12) { h = s.height * 0.12; w = h * sig.aspect; }
    const at = viewCenter(page);
    let box = { x: at.x - w / 2, y: at.y - h / 2, w, h };
    // Land it on a "Signature: ____" line when the page has one.
    const label = signatureLabel(await textBlocks(page));
    if (label) {
      const colon = label.text.search(/[:_]/);
      const startX = colon > 0 ? label.x + (label.w * (colon + 1)) / label.text.length + 6 : label.x + label.w + 8;
      box = { x: startX, y: label.baseline - h * 0.8, w, h };
    }
    const id = newId();
    add({ id, page, kind: "image", ...clampBox(page, box), src: sig.dataUrl, signature: true });
    // Bring it into view (it may have landed on the signature line further down).
    setTimeout(() => document.querySelector(`[data-object="${id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
  };

  const insert = (kind: ObjectKind | "date", extra?: string) => {
    const page = current;
    const c = viewCenter(page);
    const color = kind === "check" ? "#15803d" : kind === "cross" ? "#b91c1c" : ink;
    if (kind === "date") return add(newText(page, { x: c.x - 40, y: c.y - 7 }, { text: today() }));
    if (kind === "stamp") {
      const text = extra ?? "APPROVED", h = 30, w = Math.max(90, text.length * h * 0.42 + 24);
      return add({ id: newId(), page, kind: "stamp", ...clampBox(page, { x: c.x - w / 2, y: c.y - h / 2, w, h }), text, color: "#b91c1c" });
    }
    if (kind === "line" || kind === "arrow") {
      const from = { x: c.x - 60, y: c.y }, to = { x: c.x + 60, y: c.y };
      return add({ id: newId(), page, kind, ...boundsOf([from, to]), from, to, color, stroke: 2 });
    }
    const size = kind === "check" || kind === "cross" ? 18 : kind === "whiteout" ? 60 : 90;
    const h = kind === "whiteout" ? 18 : kind === "check" || kind === "cross" ? 18 : 60;
    add({ id: newId(), page, kind: kind as "rect", ...clampBox(page, { x: c.x - size / 2, y: c.y - h / 2, w: size, h }), color: kind === "whiteout" ? "#ffffff" : color, stroke: 2 });
  };

  const insertImage = async (f: File) => {
    try {
      const canvas = await imageCanvas(f);
      const scale = Math.min(1, 1600 / Math.max(canvas.width, canvas.height));
      const out = document.createElement("canvas");
      out.width = Math.round(canvas.width * scale); out.height = Math.round(canvas.height * scale);
      out.getContext("2d")!.drawImage(canvas, 0, 0, out.width, out.height);
      const png = f.type === "image/png";
      const src = out.toDataURL(png ? "image/png" : "image/jpeg", 0.88);
      const page = current, c = viewCenter(page), s = sizes[page];
      const w = Math.min(s.width * 0.5, out.width), h = w * (out.height / out.width);
      add({ id: newId(), page, kind: "image", ...clampBox(page, { x: c.x - w / 2, y: c.y - h / 2, w, h }), src });
    } catch (err) {
      toast({ variant: "destructive", title: "Couldn't add this image", description: err instanceof Error ? err.message : "Choose a JPG or PNG." });
    }
  };

  /* ---------------- pointer handling ---------------- */

  const onPagePointerDown = (page: number, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (tool === "pen" || tool === "highlighter") {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const p = toPage(page, e);
      drag.current = { mode: "ink", page, points: [p], tool };
      setLiveInk({ page, points: [p], tool });
    }
  };

  const onPageClick = async (page: number, e: React.MouseEvent) => {
    if (tool === "pen" || tool === "highlighter") return;
    if ((e.target as HTMLElement).closest("[data-object]")) return;
    const p = toPage(page, e);
    if (editingId) { setEditingId(null); setSelectedId(null); return; }
    if (tool === "text") return add(newText(page, { x: p.x, y: p.y - 8 }), { edit: true });
    if (selectedId) { setSelectedId(null); return; }
    // Tap on existing text: cover it and put an editable copy in the same place.
    const block = blockAt(await textBlocks(page), p.x, p.y);
    if (!block) return;
    const cover = { x: block.x - 1, y: block.y - 1, w: block.w + 2, h: block.h + 2 };
    // Same left edge, baseline, size and style as the original.
    add(newText(page, { x: block.x, y: block.baseline - block.size * BASELINE[block.font] }, {
      text: block.text, font: block.font, size: Math.round(block.size * 10) / 10, bold: block.bold, italic: block.italic, cover,
    }), { edit: true });
  };

  const startObjectDrag = (o: EditorObject, e: React.PointerEvent, mode: "move" | "resize" | "from" | "to") => {
    if (e.button !== 0 || tool !== "select") return;
    e.stopPropagation();
    if (editingId === o.id && mode === "move") return; // typing: let the cursor move
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSelectedId(o.id);
    if (editingId && editingId !== o.id) setEditingId(null);
    const start = toPage(o.page, e);
    drag.current = mode === "from" || mode === "to"
      ? { mode: "end", id: o.id, which: mode, snapshot: objects }
      : mode === "move"
        ? { mode: "move", id: o.id, start, origin: o, moved: false, snapshot: objects, wasSelected: selectedId === o.id }
        : { mode: "resize", id: o.id, start, origin: o, snapshot: objects, keepAspect: o.kind === "image" || o.kind === "text" || o.kind === "stamp" };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.mode === "ink") {
      d.points.push(toPage(d.page, e));
      setLiveInk({ page: d.page, points: [...d.points], tool: d.tool });
      return;
    }
    const o = objects.find((x) => x.id === d.id);
    if (!o) return;
    const p = toPage(o.page, e);
    if (d.mode === "move") {
      const dx = p.x - d.start.x, dy = p.y - d.start.y;
      if (!d.moved && Math.hypot(dx, dy) < 2) return;
      d.moved = true;
      const b = clampBox(o.page, { x: d.origin.x + dx, y: d.origin.y + dy, w: d.origin.w, h: d.origin.h });
      update(d.id, () => moveObject(d.origin, b.x - d.origin.x, b.y - d.origin.y), false);
    } else if (d.mode === "resize") {
      const s = sizes[o.page];
      let w = Math.max(8, Math.min(p.x, s.width) - d.origin.x), h = Math.max(6, Math.min(p.y, s.height) - d.origin.y);
      if (d.keepAspect) h = w * (d.origin.h / d.origin.w);
      if (d.origin.kind === "text") {
        const size = Math.max(4, Math.min(144, d.origin.size * (w / d.origin.w)));
        update(d.id, { size } as Partial<EditorObject>, false);
      } else {
        update(d.id, () => resizeObject(d.origin, { x: d.origin.x, y: d.origin.y, w, h }), false);
      }
    } else if (d.mode === "end") {
      update(d.id, (x) => {
        if (x.kind !== "line" && x.kind !== "arrow") return x;
        const next = { ...x, [d.which]: p };
        return { ...next, ...boundsOf([next.from, next.to]) };
      }, false);
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.mode === "ink") {
      setLiveInk(null);
      if (d.points.length < 1) return;
      const stroke = d.tool === "highlighter" ? 10 : 2;
      const b = boundsOf(d.points);
      commit((prev) => [...prev, {
        id: newId(), page: d.page, kind: "ink", ...b, strokes: [d.points], color: d.tool === "highlighter" ? "#facc15" : ink, stroke, highlighter: d.tool === "highlighter",
      }]);
      return;
    }
    if (d.mode === "move" && !d.moved) {
      // A tap on a selected text object starts typing.
      const o = objects.find((x) => x.id === d.id);
      if (o?.kind === "text" && d.wasSelected) setEditingId(o.id);
      return;
    }
    // One undo step for the whole drag.
    setPast((p) => [...p.slice(-HISTORY), d.snapshot]);
    setFuture([]);
  };

  /* ---------------- keyboard ---------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest("input, textarea, [contenteditable]");
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z" && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (mod && e.key.toLowerCase() === "y" && !typing) { e.preventDefault(); redo(); return; }
      if (e.key === "Escape") {
        if (editingId) setEditingId(null);
        else if (selectedId) setSelectedId(null);
        else setTool("select");
        setMenu(null);
        return;
      }
      if (typing || !selected) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(selected.id); }
      else if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicate(selected.id); }
      else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const n = e.shiftKey ? 10 : 1;
        const [dx, dy] = { ArrowLeft: [-n, 0], ArrowRight: [n, 0], ArrowUp: [0, -n], ArrowDown: [0, n] }[e.key] ?? [0, 0];
        update(selected.id, (o) => moveObject(o, dx, dy));
      } else if (e.key === "Enter" && selected.kind === "text") { e.preventDefault(); setEditingId(selected.id); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ---------------- saving ---------------- */

  const save = async () => {
    setEditingId(null);
    setSelectedId(null);
    setSaving(true);
    try {
      // Empty text boxes add nothing; drop them.
      const kept = objects.filter((o) => o.kind !== "text" || o.text.trim() || o.cover);
      const out = await exportEditedPdf(await file.arrayBuffer(), kept, { rasterizeText });
      const bytes = out.signed ? await addSignRecord(out.bytes) : out.bytes;
      const name = file.name.replace(/\.pdf$/i, "") + (out.signed ? "_signed.pdf" : "_edited.pdf");
      setResult({ file: new File([bytes as BlobPart], name, { type: "application/pdf" }), signed: out.signed, covered: out.covered });
      setSavedVersion(objects);
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Couldn't create the PDF", description: err instanceof Error ? err.message : "Try again." });
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    if (dirty && !window.confirm("Leave without saving? Your changes to this PDF will be lost.")) return;
    finish();
  };

  const goTo = (page: number) => pageRefs.current[page]?.scrollIntoView({ behavior: "smooth", block: "start" });

  /* ---------------- render helpers ---------------- */

  const inkMode = tool === "pen" || tool === "highlighter";
  const btn = "grid h-11 w-11 place-items-center rounded-lg text-foreground hover:bg-muted disabled:opacity-35";
  const swatches = (value: string, onPick: (c: string) => void) => (
    <div className="flex shrink-0 items-center gap-1" role="radiogroup" aria-label="Colour">
      {COLORS.map((c) => (
        <button key={c.id} type="button" role="radio" aria-checked={value === c.id} aria-label={c.label} onClick={() => onPick(c.id)}
          className={`grid h-10 w-10 place-items-center rounded-full border-2 ${value === c.id ? "border-brand" : "border-transparent"}`}>
          <span className="h-6 w-6 rounded-full ring-1 ring-black/10" style={{ background: c.id }} />
        </button>
      ))}
    </div>
  );

  const contextual = selected && (
    <div className="flex min-w-0 items-center gap-1">
      {selected.kind === "text" && (
        <>
          <div className="flex shrink-0 rounded-lg bg-muted p-0.5" role="radiogroup" aria-label="Font">
            {(["sans", "serif", "mono"] as const).map((f) => (
              <button key={f} type="button" role="radio" aria-checked={selected.font === f} onClick={() => update(selected.id, { font: f } as Partial<EditorObject>)}
                className={`h-10 rounded-md px-2.5 text-sm ${selected.font === f ? "bg-card font-semibold shadow-sm" : "text-muted-foreground"}`}
                style={{ fontFamily: f === "sans" ? "Helvetica, Arial" : f === "serif" ? "Times New Roman, serif" : "Courier New, monospace" }}>
                {f === "sans" ? "Sans" : f === "serif" ? "Serif" : "Mono"}
              </button>
            ))}
          </div>
          <div className="flex shrink-0 items-center">
            <button type="button" className={btn} aria-label="Smaller text" onClick={() => update(selected.id, { size: Math.max(4, selected.size - 1) } as Partial<EditorObject>)}><Minus size={16} /></button>
            <span className="w-9 text-center text-sm tabular-nums" aria-label="Text size">{Math.round(selected.size)}</span>
            <button type="button" className={btn} aria-label="Larger text" onClick={() => update(selected.id, { size: Math.min(144, selected.size + 1) } as Partial<EditorObject>)}><Plus size={16} /></button>
          </div>
          <button type="button" className={`${btn} ${selected.bold ? "bg-muted" : ""}`} aria-pressed={selected.bold} aria-label="Bold" onClick={() => update(selected.id, { bold: !selected.bold } as Partial<EditorObject>)}><Bold size={16} /></button>
          <button type="button" className={`${btn} ${selected.italic ? "bg-muted" : ""}`} aria-pressed={selected.italic} aria-label="Italic" onClick={() => update(selected.id, { italic: !selected.italic } as Partial<EditorObject>)}><Italic size={16} /></button>
        </>
      )}
      {"color" in selected && selected.kind !== "whiteout" && swatches(selected.color, (c) => update(selected.id, { color: c } as Partial<EditorObject>))}
      {"stroke" in selected && selected.kind !== "whiteout" && (
        <div className="flex shrink-0 rounded-lg bg-muted p-0.5" role="radiogroup" aria-label="Line thickness">
          {[1, 2, 4].map((w) => (
            <button key={w} type="button" role="radio" aria-checked={selected.stroke === w} aria-label={`${w === 1 ? "Thin" : w === 2 ? "Medium" : "Thick"} line`}
              onClick={() => update(selected.id, { stroke: w } as Partial<EditorObject>)}
              className={`grid h-10 w-10 place-items-center rounded-md ${selected.stroke === w ? "bg-card shadow-sm" : ""}`}>
              <span className="w-5 rounded-full bg-foreground" style={{ height: w + 1 }} />
            </button>
          ))}
        </div>
      )}
      <span className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden />
      <button type="button" className={btn} aria-label="Duplicate" title="Duplicate (Ctrl+D)" onClick={() => duplicate(selected.id)}><Copy size={16} /></button>
      <button type="button" className={`${btn} text-destructive`} aria-label="Delete" title="Delete" onClick={() => remove(selected.id)}><Trash2 size={16} /></button>
    </div>
  );

  const tools: { id: string; label: string; Icon: typeof Type; active: boolean; onClick: () => void }[] = [
    { id: "select", label: "Edit", Icon: MousePointer2, active: tool === "select" && !menu, onClick: () => { setTool("select"); setMenu(null); } },
    { id: "text", label: "Text", Icon: Type, active: tool === "text", onClick: () => { setTool("text"); setMenu(null); setSelectedId(null); setEditingId(null); } },
    { id: "sign", label: "Sign", Icon: PenLine, active: signOpen, onClick: () => { setMenu(null); setSignOpen(true); } },
    { id: "draw", label: "Draw", Icon: Pencil, active: inkMode || menu === "draw", onClick: () => { setSelectedId(null); setEditingId(null); setMenu(menu === "draw" ? null : "draw"); } },
    { id: "insert", label: "Insert", Icon: Shapes, active: menu === "insert" || menu === "stamp", onClick: () => { setMenu(menu === "insert" || menu === "stamp" ? null : "insert"); } },
  ];

  const insertItems: { label: string; Icon: typeof Type; onClick: () => void }[] = [
    { label: "Image", Icon: ImageIcon, onClick: () => imageInput.current?.click() },
    { label: "Tick", Icon: Check, onClick: () => insert("check") },
    { label: "Cross", Icon: X, onClick: () => insert("cross") },
    { label: "Date", Icon: CalendarDays, onClick: () => insert("date") },
    { label: "Stamp", Icon: Stamp, onClick: () => setMenu("stamp") },
    { label: "Box", Icon: Square, onClick: () => insert("rect") },
    { label: "Circle", Icon: Circle, onClick: () => insert("ellipse") },
    { label: "Line", Icon: Slash, onClick: () => insert("line") },
    { label: "Arrow", Icon: ArrowUpRight, onClick: () => insert("arrow") },
    { label: "Cover", Icon: Eraser, onClick: () => insert("whiteout") },
  ];

  const selection = (o: EditorObject) => {
    const editing = editingId === o.id;
    if (o.kind === "line" || o.kind === "arrow") {
      return (["from", "to"] as const).map((which) => (
        <span key={which} onPointerDown={(e) => startObjectDrag(o, e, which)} aria-hidden
          className="absolute z-10 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 cursor-move place-items-center"
          style={{ left: cq(o[which].x - o.x, sizes[o.page].width), top: cq(o[which].y - o.y, sizes[o.page].width), touchAction: "none" }}>
          <span className="h-3.5 w-3.5 rounded-full border-2 border-white bg-brand shadow" />
        </span>
      ));
    }
    return (
      <>
        <span className={`pointer-events-none absolute -inset-1 rounded-sm outline-dashed outline-1 ${editing ? "outline-brand" : "outline-brand/80"}`} aria-hidden />
        {!editing && (
          <span onPointerDown={(e) => startObjectDrag(o, e, "resize")} aria-hidden
            className="absolute -bottom-[18px] -right-[18px] z-10 grid h-9 w-9 cursor-se-resize place-items-center" style={{ touchAction: "none" }}>
            <span className="h-3.5 w-3.5 rounded-full border-2 border-white bg-brand shadow" />
          </span>
        )}
      </>
    );
  };

  const objectsByPage = useMemo(() => {
    const m = new Map<number, EditorObject[]>();
    for (const o of objects) m.set(o.page, [...(m.get(o.page) ?? []), o]);
    return m;
  }, [objects]);

  /* ---------------- layout ---------------- */

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[hsl(var(--muted))]" role="dialog" aria-modal="true" aria-label={`Editing ${file.name}`}
      onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      {/* Top bar */}
      <header className="flex min-h-14 shrink-0 items-center gap-1 border-b border-border bg-card px-2 sm:px-3" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <button type="button" className={btn} onClick={close} aria-label="Close editor"><X size={20} /></button>
        <div className="min-w-0 flex-1 px-1">
          <p className="truncate text-sm font-semibold">{file.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {sizes.length ? `${sizes.length} page${sizes.length === 1 ? "" : "s"}` : "Opening…"}
            {dirty && <><span aria-hidden> · </span><span className="text-amber-700">not saved<span className="hidden sm:inline"> yet</span></span></>}
          </p>
        </div>
        <div className="hidden items-center gap-1 md:flex">
          <button type="button" className={btn} aria-label="Previous page" disabled={current === 0} onClick={() => goTo(current - 1)}><ChevronLeft size={18} /></button>
          <span className="w-16 text-center text-sm tabular-nums">{sizes.length ? `${current + 1} / ${sizes.length}` : ""}</span>
          <button type="button" className={btn} aria-label="Next page" disabled={current >= sizes.length - 1} onClick={() => goTo(current + 1)}><ChevronRight size={18} /></button>
          <span className="mx-1 h-6 w-px bg-border" aria-hidden />
        </div>
        <button type="button" className={btn} aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!past.length} onClick={undo}><Undo2 size={18} /></button>
        <button type="button" className={btn} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!future.length} onClick={redo}><Redo2 size={18} /></button>
        <button type="button" onClick={save} disabled={saving || !sizes.length}
          className="ml-1 inline-flex h-11 items-center gap-2 rounded-lg bg-brand px-3 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60 sm:px-4">
          {saving ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}<span className="hidden min-[380px]:inline">Save PDF</span>
        </button>
      </header>

      {/* Hint or desktop property bar */}
      <div className="flex min-h-12 shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-card/80 px-3 backdrop-blur" aria-live="polite">
        {selected && <div className="hidden md:flex">{contextual}</div>}
        <p className={`line-clamp-2 py-1 text-xs text-muted-foreground sm:text-sm ${selected ? "md:hidden" : ""}`}>
          {selected ? (editingId ? "Typing. Tap outside the text when you're done." : selected.kind === "image" && selected.signature ? "Drag the signature into place. Drag the dot to resize." : "Drag to move. Drag the dot to resize.") : hint[tool]}
        </p>
      </div>

      {/* Pages */}
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto" style={{ overscrollBehavior: "contain" }}>
        {loadError ? (
          <div role="alert" className="mx-auto mt-16 max-w-md rounded-xl border border-destructive/40 bg-card p-5 text-sm text-destructive">{loadError}</div>
        ) : !sizes.length ? (
          <div role="status" className="mt-24 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 size={18} className="animate-spin" /> Opening your PDF…</div>
        ) : (
          <div className="flex flex-col items-center gap-4 px-3 pb-40 pt-4 md:pb-28">
            {sizes.map((s, i) => (
              <div key={i}
                ref={(el) => { pageRefs.current[i] = el; }}
                data-page={i}
                className={`relative shrink-0 select-none bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12),0_8px_24px_-12px_rgba(0,0,0,0.25)] ${tool === "text" ? "cursor-text" : inkMode ? "cursor-crosshair" : ""}`}
                style={{ width: pageCssWidth(i), aspectRatio: `${s.width} / ${s.height}`, containerType: "inline-size", touchAction: inkMode ? "none" : "pan-x pan-y" }}
                onPointerDown={(e) => onPagePointerDown(i, e)}
                onClick={(e) => onPageClick(i, e)}
                aria-label={`Page ${i + 1}`}
              >
                {images[i] ? <img src={images[i]} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full" />
                  : <Loader2 size={20} className="absolute inset-0 m-auto animate-spin text-muted-foreground" />}

                {(objectsByPage.get(i) ?? []).map((o) => {
                  const isSel = selectedId === o.id;
                  const editing = editingId === o.id && o.kind === "text";
                  return (
                    <div key={o.id}>
                      {o.kind === "text" && o.cover && (
                        <div className="pointer-events-none absolute bg-white" style={{ left: cq(o.cover.x, s.width), top: cq(o.cover.y, s.width), width: cq(o.cover.w, s.width), height: cq(o.cover.h, s.width) }} />
                      )}
                      <div
                        data-object={o.id}
                        role="button"
                        tabIndex={0}
                        aria-label={o.kind === "text" ? `Text: ${o.text || "empty"}` : o.kind === "image" && o.signature ? "Signature" : o.kind}
                        aria-pressed={isSel}
                        onFocus={() => tool === "select" && setSelectedId(o.id)}
                        onPointerDown={(e) => startObjectDrag(o, e, "move")}
                        onClick={(e) => e.stopPropagation()}
                        className={`absolute ${tool === "select" ? (editing ? "cursor-text" : "cursor-move") : "pointer-events-none"} ${isSel ? "z-20" : "z-10"} focus:outline-none`}
                        style={{ left: cq(o.x, s.width), top: cq(o.y, s.width), width: cq(Math.max(o.w, 1), s.width), height: cq(Math.max(o.h, 1), s.width), touchAction: tool === "select" && !editing ? "none" : "auto" }}
                      >
                        {editing ? (
                          <textarea
                            autoFocus
                            value={o.text}
                            spellCheck
                            aria-label="Text"
                            onChange={(e) => update(o.id, { text: e.target.value } as Partial<EditorObject>, false)}
                            onFocus={(e) => { const t = e.currentTarget; t.setSelectionRange(t.value.length, t.value.length); }}
                            className="absolute left-0 top-0 m-0 resize-none overflow-hidden whitespace-pre border-0 bg-transparent p-0 outline-none"
                            style={{ width: cq(o.w + o.size, s.width), height: cq(o.h, s.width), fontFamily: CSS_FONT[o.font], fontSize: cq(o.size, s.width), lineHeight: 1.2, color: o.color, fontWeight: o.bold ? 700 : 400, fontStyle: o.italic ? "italic" : "normal" }}
                          />
                        ) : <ObjectView o={o} pw={s.width} />}
                        {isSel && tool === "select" && selection(o)}
                      </div>
                    </div>
                  );
                })}

                {liveInk?.page === i && (
                  <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${s.width} ${s.height}`}>
                    <polyline points={liveInk.points.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={liveInk.tool === "highlighter" ? "#facc15" : ink}
                      strokeOpacity={liveInk.tool === "highlighter" ? 0.35 : 1} strokeWidth={liveInk.tool === "highlighter" ? 10 : 2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating page pill (phones) and zoom (computers) */}
      {sizes.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] flex justify-between px-3 md:bottom-6">
          <span className="pointer-events-auto rounded-full border border-border bg-card/95 px-3 py-1.5 text-xs font-semibold tabular-nums shadow-sm md:hidden">{current + 1} / {sizes.length}</span>
          <div className="pointer-events-auto ml-auto flex items-center rounded-full border border-border bg-card/95 shadow-sm">
            <button type="button" className="grid h-9 w-9 place-items-center md:h-10 md:w-10" aria-label="Zoom out" disabled={zoom <= 0.5} onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}><ZoomOut size={16} /></button>
            <button type="button" className="min-w-11 text-xs font-semibold tabular-nums" onClick={() => setZoom(1)} aria-label="Fit page width">{Math.round(zoom * 100)}%</button>
            <button type="button" className="grid h-9 w-9 place-items-center md:h-10 md:w-10" aria-label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}><ZoomIn size={16} /></button>
          </div>
        </div>
      )}

      {/* Popovers above the dock */}
      {menu && (
        <div className="absolute inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-3 md:bottom-24">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-2 shadow-xl" role="menu">
            {menu === "draw" && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-1">
                  {([["pen", "Pen", PenLine], ["highlighter", "Highlighter", Highlighter]] as const).map(([id, label, Icon]) => (
                    <button key={id} type="button" role="menuitemradio" aria-checked={tool === id} onClick={() => { setTool(id); setMenu(null); }}
                      className={`flex min-h-14 min-w-20 flex-col items-center justify-center gap-1 rounded-xl px-3 text-xs font-semibold ${tool === id ? "bg-brand text-white" : "hover:bg-muted"}`}>
                      <Icon size={18} /> {label}
                    </button>
                  ))}
                </div>
                {swatches(ink, setInk)}
              </div>
            )}
            {menu === "insert" && (
              <div className="grid grid-cols-5 gap-1">
                {insertItems.map(({ label, Icon, onClick }) => (
                  <button key={label} type="button" role="menuitem" onClick={onClick}
                    className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium leading-tight hover:bg-muted">
                    <Icon size={19} /> {label}
                  </button>
                ))}
              </div>
            )}
            {menu === "stamp" && (
              <div>
                <button type="button" onClick={() => setMenu("insert")} className="mb-1 inline-flex min-h-10 items-center gap-1 px-2 text-sm text-muted-foreground"><ChevronLeft size={16} /> Insert</button>
                <div className="grid grid-cols-2 gap-1.5">
                  {STAMPS.map((t) => (
                    <button key={t} type="button" role="menuitem" onClick={() => insert("stamp", t)}
                      className="min-h-12 rounded-lg border-2 border-red-700/70 px-2 text-xs font-bold tracking-wide text-red-700 hover:bg-red-50">{t}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom dock: tools, or the selected object's actions on phones */}
      <nav className="relative z-30 shrink-0 border-t border-border bg-card md:absolute md:bottom-5 md:left-1/2 md:-translate-x-1/2 md:rounded-2xl md:border md:shadow-lg"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }} aria-label="Editing tools">
        {selected && tool === "select" ? (
          <div className="flex items-center md:hidden">
            <div className="flex min-w-0 flex-1 items-center overflow-x-auto px-2 py-1.5 [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)]">{contextual}<span className="w-6 shrink-0" aria-hidden /></div>
            <button type="button" onClick={() => { setSelectedId(null); setEditingId(null); }}
              className="m-1.5 inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl bg-foreground px-4 text-sm font-semibold text-background"><Check size={17} /> Done</button>
          </div>
        ) : inkMode ? (
          <div className="flex items-center justify-between gap-2 px-3 py-2 md:hidden">
            <span className="text-sm text-muted-foreground">{tool === "pen" ? "Drawing" : "Highlighting"}. Scrolling is paused.</span>
            <button type="button" onClick={() => setTool("select")} className="inline-flex h-12 items-center gap-1.5 rounded-xl bg-foreground px-4 text-sm font-semibold text-background"><Check size={17} /> Done</button>
          </div>
        ) : null}
        <div className={`grid grid-cols-5 gap-0.5 p-1 md:flex ${(selected && tool === "select") || inkMode ? "max-md:hidden" : ""}`}>
          {tools.map(({ id, label, Icon, active, onClick }) => (
            <button key={id} type="button" onClick={onClick} aria-pressed={active}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[11px] font-semibold md:min-w-16 ${active ? "bg-brand-tint text-brand" : "text-foreground hover:bg-muted"}`}>
              <Icon size={20} strokeWidth={1.9} /> {label}
            </button>
          ))}
          {inkMode && (
            <button type="button" onClick={() => setTool("select")} className="ml-1 hidden min-h-14 items-center gap-1.5 rounded-xl bg-foreground px-4 text-sm font-semibold text-background md:inline-flex"><Check size={17} /> Done drawing</button>
          )}
        </div>
      </nav>

      <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; setMenu(null); if (f) insertImage(f); }} />

      <SignatureSheet open={signOpen} onOpenChange={setSignOpen} onPlace={placeSignature} />
      <ResultSheet result={result} onClose={() => setResult(null)} onDone={finish} />
    </div>
  );
};

export default EditorWorkspace;
