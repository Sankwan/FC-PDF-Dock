import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, PenLine, Trash2, Type, Undo2, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { imageCanvas } from "@/lib/addons/images";

export interface Signature { dataUrl: string; aspect: number }

const INKS = ["#10213f", "#111827", "#1d3a8a"];
const TYPE_STYLES = [
  { id: "casual", label: "Casual", font: "'Segoe Script','Bradley Hand','Snell Roundhand','Dancing Script',cursive" },
  { id: "formal", label: "Formal", font: "'Lucida Handwriting','Apple Chancery','Snell Roundhand',cursive" },
  { id: "print", label: "Print", font: "'Segoe Print','Marker Felt','Comic Sans MS',sans-serif" },
];
const SAVED_KEY = "pdfdock.saved-signatures";
const MAX_SAVED = 3;

const readSaved = (): Signature[] => {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || "[]"); } catch { return []; }
};
const writeSaved = (list: Signature[]) => {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(list.slice(0, MAX_SAVED))); } catch { /* storage full or blocked */ }
};

/** Crops a canvas to its ink (non-transparent pixels) with a little padding. */
const trim = (canvas: HTMLCanvasElement): Signature | null => {
  const ctx = canvas.getContext("2d")!;
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] > 8) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return null;
  const pad = Math.round(Math.max(width, height) * 0.01) + 4;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad); maxY = Math.min(height - 1, maxY + pad);
  const out = document.createElement("canvas");
  out.width = maxX - minX + 1; out.height = maxY - minY + 1;
  out.getContext("2d")!.drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return { dataUrl: out.toDataURL("image/png"), aspect: out.width / out.height };
};

/**
 * A photo of a signature on paper: the paper becomes transparent and the ink
 * keeps its darkness, so it sits naturally on the page.
 */
const liftInk = (source: HTMLCanvasElement, ink: string): HTMLCanvasElement => {
  const scale = Math.min(1, 1600 / Math.max(source.width, source.height));
  const c = document.createElement("canvas");
  c.width = Math.round(source.width * scale); c.height = Math.round(source.height * scale);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(source, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const lum = new Uint8Array(c.width * c.height);
  for (let i = 0; i < lum.length; i++) lum[i] = (img.data[i * 4] * 0.299 + img.data[i * 4 + 1] * 0.587 + img.data[i * 4 + 2] * 0.114) | 0;
  const sorted = Array.from(lum).sort((a, b) => a - b);
  const paper = sorted[Math.floor(sorted.length * 0.9)] || 255;
  const cut = paper * 0.78;
  const n = parseInt(ink.slice(1), 16);
  for (let i = 0; i < lum.length; i++) {
    const a = lum[i] >= cut ? 0 : Math.min(255, ((cut - lum[i]) / cut) * 255 * 2.2);
    img.data[i * 4] = (n >> 16) & 255; img.data[i * 4 + 1] = (n >> 8) & 255; img.data[i * 4 + 2] = n & 255; img.data[i * 4 + 3] = a;
  }
  ctx.putImageData(img, 0, 0);
  return c;
};

const DrawPad = ({ ink, onChange }: { ink: string; onChange: (sig: Signature | null) => void }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<{ x: number; y: number }[][]>([]);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  const redraw = useCallback(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = ink; ctx.fillStyle = ink;
    ctx.lineWidth = 2.6 * (c.width / (c.clientWidth || 1));
    for (const s of strokes.current) {
      ctx.beginPath();
      if (s.length === 1) { ctx.arc(s[0].x, s[0].y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); continue; }
      ctx.moveTo(s[0].x, s[0].y);
      // Smooth the line through midpoints so fast strokes don't look jagged.
      for (let i = 1; i < s.length - 1; i++) ctx.quadraticCurveTo(s[i].x, s[i].y, (s[i].x + s[i + 1].x) / 2, (s[i].y + s[i + 1].y) / 2);
      ctx.lineTo(s[s.length - 1].x, s[s.length - 1].y);
      ctx.stroke();
    }
  }, [ink]);

  useEffect(() => {
    const c = ref.current; if (!c) return;
    const fit = () => {
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const w = Math.floor(c.clientWidth * dpr), h = Math.floor(c.clientHeight * dpr);
      if (c.width === w && c.height === h) return;
      // Keep strokes when the pad resizes (phone rotation).
      const sx = c.width ? w / c.width : 1, sy = c.height ? h / c.height : 1;
      strokes.current = strokes.current.map((s) => s.map((p) => ({ x: p.x * sx, y: p.y * sy })));
      c.width = w; c.height = h; redraw();
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(c);
    return () => ro.disconnect();
  }, [redraw]);

  useEffect(() => { redraw(); if (!empty) onChange(trim(ref.current!)); }, [ink]); // eslint-disable-line react-hooks/exhaustive-deps

  const pt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * ref.current!.width, y: ((e.clientY - r.top) / r.height) * ref.current!.height };
  };
  const update = (isEmpty: boolean) => { setEmpty(isEmpty); onChange(isEmpty ? null : trim(ref.current!)); };

  return (
    <div>
      <div className="relative">
        <canvas
          ref={ref}
          aria-label="Signature drawing area. Draw with a mouse, pen or finger."
          className="block h-44 w-full cursor-crosshair touch-none rounded-xl border border-border bg-white sm:h-48"
          onPointerDown={(e) => { e.preventDefault(); ref.current!.setPointerCapture(e.pointerId); drawing.current = true; strokes.current.push([pt(e)]); redraw(); }}
          onPointerMove={(e) => { if (!drawing.current) return; strokes.current[strokes.current.length - 1].push(pt(e)); redraw(); }}
          onPointerUp={() => { if (drawing.current) { drawing.current = false; update(false); } }}
          onPointerCancel={() => { drawing.current = false; }}
        />
        {empty && <span className="pointer-events-none absolute inset-x-6 bottom-10 border-b border-dashed border-neutral-300" aria-hidden />}
        {empty && <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-neutral-400">Sign here</span>}
      </div>
      <div className="mt-2 flex gap-2">
        <button type="button" disabled={empty} onClick={() => { strokes.current.pop(); redraw(); update(strokes.current.length === 0); }}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm disabled:opacity-40"><Undo2 size={15} /> Undo</button>
        <button type="button" disabled={empty} onClick={() => { strokes.current = []; redraw(); update(true); }}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm disabled:opacity-40"><Trash2 size={15} /> Clear</button>
      </div>
    </div>
  );
};

const TypePad = ({ ink, onChange }: { ink: string; onChange: (sig: Signature | null) => void }) => {
  const [name, setName] = useState("");
  const [style, setStyle] = useState(TYPE_STYLES[0].id);
  const font = TYPE_STYLES.find((s) => s.id === style)!.font;

  useEffect(() => {
    if (!name.trim()) { onChange(null); return; }
    const c = document.createElement("canvas");
    c.width = 1400; c.height = 360;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = ink;
    let size = 180;
    ctx.font = `${size}px ${font}`;
    while (ctx.measureText(name).width > c.width - 80 && size > 40) { size -= 8; ctx.font = `${size}px ${font}`; }
    ctx.textBaseline = "middle";
    ctx.fillText(name, 40, c.height / 2);
    onChange(trim(c));
  }, [name, font, ink]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Type your name" autoComplete="name" aria-label="Your name"
        className="h-12 w-full rounded-xl border border-input bg-card px-3 text-base" />
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Signature style">
        {TYPE_STYLES.map((s) => (
          <button key={s.id} type="button" role="radio" aria-checked={style === s.id} onClick={() => setStyle(s.id)}
            className={`min-h-14 truncate rounded-xl border px-2 text-lg ${style === s.id ? "border-brand bg-brand-tint" : "border-border bg-white"}`}
            style={{ fontFamily: s.font, color: ink }}>
            {name.trim() || s.label}
          </button>
        ))}
      </div>
    </div>
  );
};

const PhotoPad = ({ ink, onChange }: { ink: string; onChange: (sig: Signature | null) => void }) => {
  const [source, setSource] = useState<HTMLCanvasElement | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!source) return;
    const sig = trim(liftInk(source, ink));
    setPreview(sig?.dataUrl ?? null);
    onChange(sig);
  }, [source, ink]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Sign on plain white paper, then take a photo or choose one. The paper is removed automatically.</p>
      <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-brand/60 bg-brand-tint/50 px-4 text-sm font-semibold text-brand">
        <Camera size={18} /> {source ? "Choose another photo" : "Take or choose a photo"}
        <input type="file" accept="image/*" className="sr-only" onChange={async (e) => {
          const file = e.currentTarget.files?.[0]; e.currentTarget.value = "";
          if (!file) return;
          try {
            if (file.size > 15 * 1024 * 1024) throw new Error("Choose an image smaller than 15 MB.");
            setError(null); setSource(await imageCanvas(file));
          } catch (err) { setError(err instanceof Error ? err.message : "Could not open this image."); }
        }} />
      </label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {preview && <div className="grid h-32 place-items-center rounded-xl border border-border bg-white p-3"><img src={preview} alt="Signature from photo" className="max-h-full max-w-full" /></div>}
    </div>
  );
};

/** Draw, type or photograph a signature. Works as a bottom sheet on phones. */
const SignatureSheet = ({ open, onOpenChange, onPlace }: { open: boolean; onOpenChange: (open: boolean) => void; onPlace: (sig: Signature) => void }) => {
  const [tab, setTab] = useState<"draw" | "type" | "photo">("draw");
  const [ink, setInk] = useState(INKS[0]);
  const [sig, setSig] = useState<Signature | null>(null);
  const [saved, setSaved] = useState<Signature[]>([]);
  const [remember, setRemember] = useState(false);

  useEffect(() => { if (open) { setSaved(readSaved()); setSig(null); } }, [open]);

  const place = (s: Signature) => {
    if (remember && !saved.some((x) => x.dataUrl === s.dataUrl)) writeSaved([s, ...saved]);
    onPlace(s);
    onOpenChange(false);
  };

  const tabs = [
    { id: "draw" as const, label: "Draw", Icon: PenLine },
    { id: "type" as const, label: "Type", Icon: Type },
    { id: "photo" as const, label: "Photo", Icon: Camera },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="gap-0 p-0 max-sm:bottom-0 max-sm:top-auto max-sm:max-h-[92dvh] max-sm:max-w-none max-sm:translate-y-0 max-sm:rounded-b-none max-sm:data-[state=open]:slide-in-from-bottom-8 max-sm:data-[state=open]:zoom-in-100"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="px-5 pb-2 pt-5">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border sm:hidden" aria-hidden />
          <DialogTitle className="text-base">Add your signature</DialogTitle>
          <DialogDescription className="mt-0.5 text-xs">It stays on this device. Nothing is uploaded.</DialogDescription>
        </div>

        {saved.length > 0 && (
          <div className="px-5 pb-3">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saved on this device</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {saved.map((s, i) => (
                <div key={i} className="relative shrink-0">
                  <button type="button" onClick={() => place(s)} className="grid h-14 w-32 place-items-center rounded-xl border border-border bg-white p-2 hover:border-brand" aria-label={`Use saved signature ${i + 1}`}>
                    <img src={s.dataUrl} alt="" className="max-h-full max-w-full" />
                  </button>
                  <button type="button" onClick={() => { const next = saved.filter((_, j) => j !== i); writeSaved(next); setSaved(next); }}
                    aria-label={`Forget saved signature ${i + 1}`} className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-sm">
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="px-5">
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1" role="tablist">
            {tabs.map(({ id, label, Icon }) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setSig(null); }}
                className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold ${tab === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 py-4" role="tabpanel">
          {tab === "draw" && <DrawPad ink={ink} onChange={setSig} />}
          {tab === "type" && <TypePad ink={ink} onChange={setSig} />}
          {tab === "photo" && <PhotoPad ink={ink} onChange={setSig} />}
        </div>

        <div className="space-y-3 border-t border-border px-5 py-4" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2" role="radiogroup" aria-label="Ink colour">
              <span className="text-xs font-semibold text-muted-foreground">Ink</span>
              {INKS.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={ink === c} aria-label={c === "#1d3a8a" ? "Blue ink" : "Black ink"} onClick={() => setInk(c)}
                  className={`grid h-9 w-9 place-items-center rounded-full border-2 ${ink === c ? "border-brand" : "border-transparent"}`}>
                  <span className="h-6 w-6 rounded-full" style={{ background: c }} />
                </button>
              ))}
            </div>
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--brand))]" />
              Save for next time
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => onOpenChange(false)} className="h-12 rounded-xl border border-border text-sm font-semibold">Cancel</button>
            <button type="button" disabled={!sig} onClick={() => sig && place(sig)}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand text-sm font-semibold text-white disabled:opacity-40">
              <Check size={17} /> Place signature
            </button>
          </div>
          {remember && <p className="text-xs text-muted-foreground">Only on this browser. Don't save on a shared computer.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SignatureSheet;
