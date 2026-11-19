import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, CheckCircle2, ClipboardPen, FileText, Loader2, PenLine, RotateCcw, X } from "lucide-react";
import ToolHeader from "@/components/ToolHeader";
import FileUpload from "@/components/FileUpload";
import SaveShareButtons, { SAVE_HINT } from "@/components/SaveShareButtons";
import { useToast } from "@/hooks/use-toast";
import { useFileVault } from "@/context/FileVault";
import { downloadFile, formatFileSize } from "@/lib/fileUtils";
import { loadPdfDocument, pdfjs } from "@/lib/pdfjs";
import { makePdfFile } from "@/lib/pdfUtils";
import { handOff } from "@/lib/handoff";
import { fillForm, isAnswered, readForm, readTooltips, type FormPage, type FormValues, type FormWidget } from "@/lib/fillForm";

type View = "list" | "page";

/** One question in the list view: a group of boxes that share a field name. */
interface Question { name: string; label: string; page: number; kind: FormWidget["kind"]; widgets: FormWidget[]; options: { value: string; label: string }[] }

const optionLabel = (v: string) => v.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim() || v;

const toQuestions = (widgets: FormWidget[]): Question[] => {
  const byName = new Map<string, Question>();
  for (const w of widgets) {
    let q = byName.get(w.name);
    if (!q) {
      q = { name: w.name, label: w.label, page: w.page, kind: w.kind, widgets: [], options: [] };
      byName.set(w.name, q);
    }
    q.widgets.push(w);
    if ((w.kind === "radio" || w.kind === "checkbox") && w.onValue && !q.options.some((o) => o.value === w.onValue)) {
      q.options.push({ value: w.onValue, label: optionLabel(w.onValue) });
    }
    if (w.options && !q.options.length) q.options = w.options;
  }
  return [...byName.values()];
};

const inputCls = "w-full rounded-md border border-input bg-background px-3 text-foreground focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-60";

/** List view control: big, phone-friendly. */
const QuestionField = ({ q, value, onChange }: { q: Question; value: string | string[] | undefined; onChange: (v: string | string[]) => void }) => {
  const id = `q-${q.name}`;
  const ro = q.widgets.every((w) => w.readOnly);
  const w = q.widgets[0];
  if (q.kind === "signature") {
    return (
      <div className="flex items-start gap-2 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
        <PenLine size={16} className="mt-0.5 shrink-0" /><span><span className="font-semibold text-foreground">{q.label}</span>: sign it with Sign PDF after you save.</span>
      </div>
    );
  }
  if (q.kind === "checkbox" && q.options.length <= 1) {
    const on = q.options[0]?.value ?? "Yes";
    return (
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
        <input type="checkbox" className="h-5 w-5 accent-[hsl(var(--brand))]" disabled={ro} checked={value === on} onChange={(e) => onChange(e.target.checked ? on : "Off")} />
        <span>{q.label}</span>
      </label>
    );
  }
  if (q.kind === "radio" || q.kind === "checkbox") {
    return (
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">{q.label}</legend>
        <div className="flex flex-wrap gap-2">
          {q.options.map((o) => {
            const sel = value === o.value;
            return (
              <button key={o.value} type="button" disabled={ro} aria-pressed={sel}
                onClick={() => onChange(sel && q.kind === "checkbox" ? "Off" : o.value)}
                className={`min-h-11 rounded-md border px-3 text-sm font-medium ${sel ? "border-brand bg-brand text-white" : "border-input bg-background hover:border-brand/60"}`}>
                {o.label}
              </button>
            );
          })}
          {q.kind === "radio" && value && value !== "Off" && !ro && (
            <button type="button" onClick={() => onChange("Off")} className="min-h-11 px-2 text-xs text-muted-foreground underline">Clear</button>
          )}
        </div>
      </fieldset>
    );
  }
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{q.label}</label>
      {q.kind === "dropdown" ? (
        <select id={id} disabled={ro} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className={`${inputCls} min-h-11`}>
          <option value="">Choose…</option>
          {q.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : q.kind === "list" ? (
        <select id={id} multiple disabled={ro} value={(value as string[]) ?? []} onChange={(e) => onChange([...e.target.selectedOptions].map((o) => o.value))} className={`${inputCls} min-h-24 py-2`}>
          {q.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : w.multiline ? (
        <textarea id={id} disabled={ro} rows={3} maxLength={w.maxLen} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className={`${inputCls} py-2`} />
      ) : (
        <input id={id} disabled={ro} maxLength={w.maxLen} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className={`${inputCls} min-h-11`} />
      )}
      {w.maxLen ? <p className="mt-1 text-xs text-muted-foreground">Up to {w.maxLen} characters</p> : null}
    </div>
  );
};

/** On-the-page view: the page drawn without its form, with real inputs on top. */
const FormPageView = ({ pdf, page, widgets, values, onChange }: {
  pdf: any; page: FormPage; widgets: FormWidget[]; values: FormValues; onChange: (name: string, v: string | string[]) => void;
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [near, setNear] = useState(false);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: "800px 0px" });
    const ro = new ResizeObserver(() => setScale(el.clientWidth / page.width));
    io.observe(el); ro.observe(el);
    return () => { io.disconnect(); ro.disconnect(); };
  }, [page.width]);
  useEffect(() => {
    if (!near) return;
    let alive = true;
    (async () => {
      const p = await pdf.getPage(page.page);
      const width = (ref.current?.clientWidth || 700) * Math.min(2, window.devicePixelRatio || 1);
      const vp = p.getViewport({ scale: width / page.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Leave the form's own boxes out; ours go on top.
      await p.render({ canvas, canvasContext: ctx, viewport: vp, annotationMode: pdfjs.AnnotationMode.DISABLE } as any).promise;
      if (alive) setSrc(canvas.toDataURL("image/jpeg", 0.88));
      canvas.width = canvas.height = 0;
    })().catch(() => {});
    return () => { alive = false; };
  }, [near, pdf, page]);

  const pct = (v: number, t: number) => `${(v / t) * 100}%`;
  return (
    <div ref={ref} className="relative mx-auto w-full bg-white shadow-sm ring-1 ring-black/5" style={{ aspectRatio: `${page.width} / ${page.height}` }}>
      {src ? <img src={src} alt={`Page ${page.page}`} className="h-full w-full select-none" draggable={false} />
        : <span className="absolute inset-0 grid place-items-center"><Loader2 size={18} className="animate-spin text-muted-foreground" /></span>}
      {widgets.map((w) => {
        const style: React.CSSProperties = { left: pct(w.box.x, page.width), top: pct(w.box.y, page.height), width: pct(w.box.w, page.width), height: pct(w.box.h, page.height) };
        const v = values[w.name];
        const font = Math.max(7, Math.min(w.multiline ? 12 : w.box.h * 0.62, 14) * scale);
        const base = "absolute !min-h-0 !min-w-0 rounded-[2px] bg-sky-100/70 ring-1 ring-sky-500/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand disabled:bg-transparent disabled:ring-0";
        if (w.kind === "signature") return <span key={w.id} title="Sign with Sign PDF after saving" style={style} className="absolute grid !min-h-0 place-items-center rounded-[2px] border border-dashed border-sky-500/70 text-[10px] text-sky-700">Sign later</span>;
        if (w.kind === "checkbox" || w.kind === "radio") {
          const on = v === w.onValue;
          return (
            <button key={w.id} type="button" title={w.label} aria-label={`${w.label}${w.kind === "radio" ? `: ${optionLabel(w.onValue ?? "")}` : ""}`} aria-pressed={on} disabled={w.readOnly}
              onClick={() => onChange(w.name, on ? "Off" : w.onValue!)} style={{ ...style, fontSize: Math.max(8, w.box.h * 0.8 * scale) }}
              className={`${base} grid place-items-center font-bold leading-none text-foreground ${w.kind === "radio" ? "rounded-full" : ""}`}>
              {on ? (w.kind === "radio" ? "●" : "✓") : ""}
            </button>
          );
        }
        if (w.kind === "dropdown" || w.kind === "list") {
          return (
            <select key={w.id} title={w.label} aria-label={w.label} disabled={w.readOnly} value={Array.isArray(v) ? v[0] ?? "" : v ?? ""}
              onChange={(e) => onChange(w.name, w.kind === "list" ? [e.target.value] : e.target.value)} style={{ ...style, fontSize: font }} className={`${base} px-0.5`}>
              <option value="" />
              {w.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          );
        }
        const common = { title: w.label, "aria-label": w.label, disabled: w.readOnly, maxLength: w.maxLen, value: (v as string) ?? "", style: { ...style, fontSize: font, textAlign: (["left", "center", "right"] as const)[w.align ?? 0] } };
        return w.multiline
          ? <textarea key={w.id} {...common} onChange={(e) => onChange(w.name, e.target.value)} className={`${base} resize-none px-1 leading-tight`} />
          : <input key={w.id} {...common} onChange={(e) => onChange(w.name, e.target.value)} className={`${base} px-1`} />;
      })}
      <span className="absolute bottom-1 right-2 rounded bg-black/50 px-1.5 text-[11px] text-white">{page.page}</span>
    </div>
  );
};

const FillForm = () => {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { files: vaultFiles, removeFile } = useFileVault();
  const [file, setFile] = useState<File | null>(null);
  const [pdf, setPdf] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<{ widgets: FormWidget[]; pages: FormPage[]; xfa: boolean } | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const [original, setOriginal] = useState<FormValues>({});
  const [view, setView] = useState<View>(() => (typeof window !== "undefined" && window.innerWidth < 640 ? "list" : "page"));
  const [lock, setLock] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<File | null>(null);

  const questions = useMemo(() => (form ? toQuestions(form.widgets) : []), [form]);
  const answerable = questions.filter((q) => q.kind !== "signature" && !q.widgets.every((w) => w.readOnly));
  const answered = answerable.filter((q) => isAnswered(values[q.name])).length;
  const dirty = JSON.stringify(values) !== JSON.stringify(original);

  useEffect(() => () => { pdf?.destroy?.(); }, [pdf]);
  // Answers live only in this tab: warn before they're lost.
  useEffect(() => {
    if (!dirty || result) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, result]);

  const open = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f); setResult(null); setLoading(true); setForm(null);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const [doc, tips] = await Promise.all([loadPdfDocument(bytes), readTooltips(bytes)]);
      const r = await readForm(doc, tips);
      setPdf(doc);
      setForm({ widgets: r.widgets, pages: r.pages, xfa: !!(doc as any).isPureXfa });
      setValues(r.values); setOriginal(r.values);
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Couldn't open this PDF", description: err instanceof Error ? err.message : undefined });
      setFile(null);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    vaultFiles.filter((vf) => vf.file === file).forEach((vf) => removeFile(vf.id));
    setFile(null); setForm(null); setValues({}); setOriginal({}); setResult(null);
    pdf?.destroy?.(); setPdf(null);
  };

  const setValue = (name: string, v: string | string[]) => setValues((s) => ({ ...s, [name]: v }));
  const clearAll = () => setValues(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Array.isArray(v) ? [] : form?.widgets.find((w) => w.name === k && (w.kind === "checkbox" || w.kind === "radio")) ? "Off" : ""])));

  const build = async (locked: boolean) => {
    const r = await fillForm(await file!.arrayBuffer(), values, { lock: locked });
    const name = file!.name.replace(/\.pdf$/i, "") + (locked ? "_filled.pdf" : "_filled_editable.pdf");
    return { file: makePdfFile(r.bytes, name), substituted: r.substituted };
  };

  const save = async () => {
    if (!file) return;
    setSaving(true);
    try {
      const r = await build(lock);
      setResult(r.file);
      if (r.substituted) toast({ title: "Some characters were changed", description: "The form's font doesn't have every character, so ₵ became GH¢ and letters like ɛ and ɔ became e and o. Anything else shows as ?." });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Couldn't save the form", description: err instanceof Error ? err.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  const saveUnlocked = async () => {
    try {
      const r = await build(false);
      downloadFile(r.file, r.file.name, r.file.type);
    } catch {
      toast({ variant: "destructive", title: "Couldn't make the editable copy" });
    }
  };

  const sendToEdit = () => {
    if (!file) return;
    handOff({ files: [file], from: "Fill in forms", to: "/edit-pdf", via: "next" });
    navigate("/edit-pdf");
  };

  const byPage = (n: number) => questions.filter((q) => q.page === n);

  return (
    <section className="min-h-[60vh] bg-background py-10">
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <ToolHeader category="Official documents" title="Fill in forms"
          description="Type into a PDF form's own boxes, tick its boxes and pick its options, like in Adobe Reader. Works with HR, leave and procurement forms that have fillable fields." />

        {!file ? (
          <div className="max-w-2xl rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
            <FileUpload accept=".pdf,application/pdf" maxSizeInMB={100} onFilesSelected={open} title="Choose a PDF form"
              description="Drag & drop or click to browse" buttonText="Select PDF" icon={<ClipboardPen size={34} />} />
          </div>
        ) : loading ? (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Finding the form's boxes…</p>
        ) : form && !form.widgets.length ? (
          <div className="max-w-2xl space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
            <div className="flex gap-3">
              <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600" />
              <div className="text-sm leading-6">
                <p className="font-semibold text-foreground">This PDF has no boxes to fill in</p>
                {form.xfa ? (
                  <p className="text-muted-foreground">It's an older Adobe LiveCycle (XFA) form, which only Adobe Reader can fill. Open it in Adobe Reader, or use Edit PDF to type on a printed copy saved as PDF.</p>
                ) : (
                  <p className="text-muted-foreground">It's probably a scan, or a form saved from Word without fillable fields. You can still fill it: Edit PDF lets you type text, add ticks and dates anywhere on the page.</p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={sendToEdit} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark"><FileText size={16} /> Fill it in Edit PDF</button>
              <button type="button" onClick={reset} className="min-h-11 px-3 text-sm font-medium text-muted-foreground hover:text-brand">Choose another file</button>
            </div>
          </div>
        ) : form && result ? (
          <div className="max-w-2xl space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
            <div role="status" className="rounded-lg border border-brand/40 bg-brand-tint p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground"><CheckCircle2 size={17} className="text-brand" /> Form filled · {answered} of {answerable.length} answered · {formatFileSize(result.size)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {lock ? "The answers are locked into the page, so they look the same in every app and can't be changed." : "The form is still fillable, so you or others can change the answers later."}
              </p>
            </div>
            <SaveShareButtons file={result} />
            <p className="text-xs text-muted-foreground">{SAVE_HINT}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-sm">
              {lock && <button type="button" onClick={saveUnlocked} className="min-h-11 font-semibold text-brand underline-offset-4 hover:underline">Also save an editable copy</button>}
              <button type="button" onClick={() => setResult(null)} className="min-h-11 font-medium text-muted-foreground hover:text-brand">Change answers</button>
              <button type="button" onClick={reset} className="min-h-11 font-medium text-muted-foreground hover:text-brand">Fill another form</button>
            </div>
          </div>
        ) : form ? (
          <div className="rounded-xl border border-border bg-card shadow-sm">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
              <span className="min-w-0 basis-full truncate text-sm font-medium sm:basis-auto sm:flex-1">{file.name}</span>
              <div role="tablist" aria-label="View" className="inline-flex rounded-md border border-input p-0.5">
                {([["list", "Form"], ["page", "On the page"]] as const).map(([id, label]) => (
                  <button key={id} role="tab" type="button" aria-selected={view === id} onClick={() => setView(id)}
                    className={`min-h-9 rounded px-3 text-sm font-medium ${view === id ? "bg-brand text-white" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>
                ))}
              </div>
              <span className="text-xs text-muted-foreground" aria-live="polite">{answered} of {answerable.length} answered</span>
              <button type="button" onClick={clearAll} className="inline-flex min-h-9 items-center gap-1 px-2 text-xs font-medium text-muted-foreground hover:text-brand"><RotateCcw size={13} /> Clear all</button>
              <button type="button" onClick={reset} aria-label="Close this form" className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-muted"><X size={16} /></button>
            </div>

            {view === "list" ? (
              <div className="space-y-6 p-4 sm:p-6">
                {form.pages.map((p) => {
                  const qs = byPage(p.page);
                  if (!qs.length) return null;
                  return (
                    <div key={p.page}>
                      {form.pages.length > 1 && <h2 className="mb-3 border-b border-border pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Page {p.page}</h2>}
                      <div className="space-y-4">{qs.map((q) => <QuestionField key={q.name} q={q} value={values[q.name]} onChange={(v) => setValue(q.name, v)} />)}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-4 bg-muted/50 p-2 sm:p-4">
                <p className="text-center text-xs text-muted-foreground">Tap a blue box to type or tick. On a phone, the Form view is easier.</p>
                {form.pages.map((p) => (
                  <FormPageView key={p.page} pdf={pdf} page={p} widgets={form.widgets.filter((w) => w.page === p.page)} values={values} onChange={setValue} />
                ))}
              </div>
            )}

            {/* Save */}
            <div className="sticky bottom-0 z-10 flex items-center gap-3 rounded-b-xl border-t border-border bg-card/95 p-3 backdrop-blur">
              <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 text-sm">
                <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[hsl(var(--brand))]" checked={lock} onChange={(e) => setLock(e.target.checked)} />
                <span><span className="font-medium">Lock the answers into the page</span><span className="hidden text-xs text-muted-foreground sm:block">Best for sending: answers show in every app and can't be changed. Untick to keep it fillable.</span></span>
              </label>
              <button type="button" onClick={save} disabled={saving} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60 sm:px-5">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} <span>Save<span className="hidden sm:inline"> filled form</span></span>
              </button>
            </div>
          </div>
        ) : null}

        <p className="mt-4 max-w-2xl text-xs text-muted-foreground">
          Answers stay on this device and aren't kept after you leave the page, so save before closing. To sign the form, save it, then tap Sign under Keep going with this file.
        </p>
      </div>
    </section>
  );
};

export default FillForm;
