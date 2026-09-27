import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, FileText, FileType2, Loader2, PenSquare, RotateCcw, Upload } from "lucide-react";
import ToolHeader from "@/components/ToolHeader";
import FileUpload from "@/components/FileUpload";
import SaveShareButtons from "@/components/SaveShareButtons";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/Auth";
import { DIVISIONS } from "@/fc/org";
import { loadPdfDocument, renderPdfPageToCanvas } from "@/lib/pdfjs";
import {
  applyLetterhead, blankLetterheadPdf, buildLetterPdf, detailsFor, ordinalDate, type ApplyOptions, type Letter, type LetterheadDetails,
} from "@/lib/letterhead";
import { letterheadDocx } from "@/lib/letterheadDocx";

type Mode = "write" | "apply" | "blank";

const store = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(`pdfdock.${key}`);
      return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(`pdfdock.${key}`, JSON.stringify(value));
    } catch {
      /* private mode: settings just aren't remembered */
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(`pdfdock.${key}`);
    } catch {
      /* ignore */
    }
  },
};

const field = "mt-1.5 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

const Letterhead = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>("write");

  // The last division chosen on this device.
  const [divisionId, setDivisionIdState] = useState(() => store.get<{ id: string }>("letterhead.division", { id: "wd" }).id);
  const setDivisionId = (id: string) => {
    setDivisionIdState(id);
    store.set("letterhead.division", { id });
  };
  const division = DIVISIONS.find((d) => d.id === divisionId)!;
  const [head, setHead] = useState<LetterheadDetails>(() => store.get(`letterhead.${divisionId}`, detailsFor(division)));
  const [editHead, setEditHead] = useState(false);

  useEffect(() => {
    setHead(store.get(`letterhead.${divisionId}`, detailsFor(DIVISIONS.find((d) => d.id === divisionId)!)));
  }, [divisionId]);

  const saveHead = (next: LetterheadDetails) => {
    setHead(next);
    store.set(`letterhead.${divisionId}`, { subtitle: next.subtitle, lines: next.lines });
  };

  const [letter, setLetter] = useState<Letter>(() => ({
    ourRef: "",
    yourRef: "",
    date: ordinalDate(),
    recipient: "",
    salutation: "Dear Sir/Madam,",
    subject: "",
    body: "",
    closing: "Yours faithfully,",
    signatoryName: user ? `${user.firstName} ${user.lastName}` : "",
    signatoryTitle: "",
    forLine: "",
    cc: "",
    letterheadOnEveryPage: false,
    ...store.get("letter.signatory", {}),
  }));
  const set = (k: keyof Letter) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const v = e.target.value;
    setLetter((l) => ({ ...l, [k]: v }));
    if (k === "signatoryName" || k === "signatoryTitle" || k === "forLine" || k === "closing") {
      store.set("letter.signatory", { ...store.get("letter.signatory", {}), [k]: v });
    }
  };

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [applyOpts, setApplyOpts] = useState<ApplyOptions>({ pages: "first", mode: "fit" });

  // Live preview: build the real PDF and render it.
  const [preview, setPreview] = useState<string[]>([]);
  const [output, setOutput] = useState<File | null>(null);
  const [rendering, setRendering] = useState(false);
  const [wordBusy, setWordBusy] = useState(false);
  const job = useRef(0);

  const inputs = useMemo(() => JSON.stringify({ mode, head, letter, applyOpts, file: pdfFile?.name, size: pdfFile?.size }), [mode, head, letter, applyOpts, pdfFile]);

  useEffect(() => {
    const id = ++job.current;
    if (mode === "apply" && !pdfFile) {
      setPreview([]);
      setOutput(null);
      return;
    }
    setRendering(true);
    const t = setTimeout(async () => {
      try {
        const file =
          mode === "write" ? await buildLetterPdf(head, letter) : mode === "blank" ? await blankLetterheadPdf(head) : await applyLetterhead(pdfFile!, head, applyOpts);
        if (id !== job.current) return;
        const pdf = await loadPdfDocument(file);
        const imgs: string[] = [];
        for (let n = 1; n <= Math.min(pdf.numPages, 4); n++) {
          const c = await renderPdfPageToCanvas(pdf, n, 1.3);
          imgs.push(c.toDataURL("image/jpeg", 0.85));
        }
        await pdf.destroy();
        if (id !== job.current) return;
        setOutput(file);
        setPreview(imgs);
      } catch (err) {
        console.error(err);
        if (id === job.current) toast({ variant: "destructive", title: "Couldn't build the preview", description: err instanceof Error ? err.message : "Try again." });
      } finally {
        if (id === job.current) setRendering(false);
      }
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs]);

  const downloadWord = async () => {
    setWordBusy(true);
    try {
      const file = await letterheadDocx({ ...head }, mode === "write" ? letter : undefined);
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Couldn't create the Word file", description: "Try again." });
    } finally {
      setWordBusy(false);
    }
  };

  const tab = (id: Mode, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === id}
      onClick={() => setMode(id)}
      className={`inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors sm:flex-none ${
        mode === id ? "bg-brand text-white" : "text-foreground hover:bg-muted"
      }`}
    >
      {icon} {label}
    </button>
  );

  return (
    <section className="min-h-[60vh] bg-background py-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <ToolHeader
          category="Official documents"
          title="Letterhead"
          description="Write a letter on the official Forestry Commission letterhead, put the letterhead on a PDF you already have, or download a blank letterhead to use in Word."
        />

        <div role="tablist" className="mb-4 flex max-w-xl gap-1 rounded-lg border border-border bg-card p-1">
          {tab("write", <PenSquare size={16} />, "Write a letter")}
          {tab("apply", <Upload size={16} />, "Add to a PDF")}
          {tab("blank", <FileText size={16} />, "Blank")}
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* Form */}
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[14rem] flex-1">
                  <Label htmlFor="division" className="text-sm font-semibold">Division</Label>
                  <Select value={divisionId} onValueChange={setDivisionId}>
                    <SelectTrigger id="division" className="mt-1.5 h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DIVISIONS.map((d) => <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <button type="button" onClick={() => setEditHead((e) => !e)} className="h-10 rounded-md border border-border px-3 text-sm font-medium hover:border-brand hover:text-brand">
                  {editHead ? "Done" : "Edit address lines"}
                </button>
              </div>
              {!division.confirmed && !store.get<{ lines?: string[] }>(`letterhead.${divisionId}`, {}).lines && (
                <p className="mt-3 flex gap-2 text-xs text-amber-800 dark:text-amber-200">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  These address lines haven't been confirmed by the division yet. Check them before sending, and correct them with "Edit address lines". Your corrections are remembered on this device.
                </p>
              )}
              {editHead && (
                <div className="mt-4 space-y-3 border-t border-border pt-4">
                  <div>
                    <Label htmlFor="subtitle" className="text-sm font-semibold">Division line <span className="font-normal text-muted-foreground">(printed in brackets)</span></Label>
                    <input id="subtitle" value={head.subtitle} onChange={(e) => saveHead({ ...head, subtitle: e.target.value })} className={`${field} h-10`} />
                  </div>
                  <div>
                    <Label htmlFor="lines" className="text-sm font-semibold">Address and contact lines <span className="font-normal text-muted-foreground">(one per line)</span></Label>
                    <textarea id="lines" rows={4} value={head.lines.join("\n")} onChange={(e) => saveHead({ ...head, lines: e.target.value.split("\n") })} className={`${field} py-2 font-mono text-xs`} />
                  </div>
                  <button type="button" onClick={() => { store.remove(`letterhead.${divisionId}`); setHead(detailsFor(division)); }} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-brand">
                    <RotateCcw size={13} /> Reset to the default lines
                  </button>
                </div>
              )}
            </div>

            {mode === "write" && (
              <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="ourRef" className="text-sm font-semibold">Our Ref</Label>
                    <input id="ourRef" value={letter.ourRef} onChange={set("ourRef")} placeholder={`${division.code}/…`} className={`${field} h-10`} />
                  </div>
                  <div>
                    <Label htmlFor="yourRef" className="text-sm font-semibold">Your Ref</Label>
                    <input id="yourRef" value={letter.yourRef} onChange={set("yourRef")} className={`${field} h-10`} />
                  </div>
                  <div>
                    <Label htmlFor="date" className="text-sm font-semibold">Date</Label>
                    <input id="date" value={letter.date} onChange={set("date")} className={`${field} h-10`} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="recipient" className="text-sm font-semibold">To</Label>
                  <textarea id="recipient" rows={4} value={letter.recipient} onChange={set("recipient")} placeholder={"The Regional Manager\nForest Services Division\nP. O. Box 123\nKumasi"} className={`${field} py-2`} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="salutation" className="text-sm font-semibold">Greeting</Label>
                    <input id="salutation" value={letter.salutation} onChange={set("salutation")} className={`${field} h-10`} />
                  </div>
                  <div>
                    <Label htmlFor="subject" className="text-sm font-semibold">Subject</Label>
                    <input id="subject" value={letter.subject} onChange={set("subject")} placeholder="e.g. Request for boundary inspection" className={`${field} h-10`} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="body" className="text-sm font-semibold">Letter</Label>
                  <textarea id="body" rows={10} value={letter.body} onChange={set("body")} placeholder="Type or paste the letter. Leave an empty line between paragraphs." className={`${field} py-2 leading-relaxed`} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="closing" className="text-sm font-semibold">Closing</Label>
                    <input id="closing" value={letter.closing} onChange={set("closing")} className={`${field} h-10`} />
                  </div>
                  <div>
                    <Label htmlFor="signatoryName" className="text-sm font-semibold">Signed by</Label>
                    <input id="signatoryName" value={letter.signatoryName} onChange={set("signatoryName")} className={`${field} h-10`} />
                  </div>
                  <div>
                    <Label htmlFor="signatoryTitle" className="text-sm font-semibold">Title</Label>
                    <input id="signatoryTitle" value={letter.signatoryTitle} onChange={set("signatoryTitle")} placeholder="e.g. Regional Manager" className={`${field} h-10`} />
                  </div>
                  <div>
                    <Label htmlFor="forLine" className="text-sm font-semibold">Signing for <span className="font-normal text-muted-foreground">(optional)</span></Label>
                    <input id="forLine" value={letter.forLine} onChange={set("forLine")} placeholder="e.g. Executive Director" className={`${field} h-10`} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="cc" className="text-sm font-semibold">Copies to (cc) <span className="font-normal text-muted-foreground">(one per line)</span></Label>
                  <textarea id="cc" rows={2} value={letter.cc} onChange={set("cc")} className={`${field} py-2`} />
                </div>
                <label htmlFor="everyPage" className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                  <input id="everyPage" type="checkbox" checked={letter.letterheadOnEveryPage} onChange={(e) => setLetter((l) => ({ ...l, letterheadOnEveryPage: e.target.checked }))} className="h-4 w-4 accent-[hsl(var(--brand))]" />
                  Letterhead on every page (usually only the first)
                </label>
              </div>
            )}

            {mode === "apply" && (
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                {!pdfFile ? (
                  <FileUpload accept=".pdf,application/pdf" maxSizeInMB={100} onFilesSelected={(f) => setPdfFile(f[0] ?? null)} title="Upload the letter as PDF" description="For example a letter saved from Word without the letterhead" buttonText="Select PDF" icon={<Upload size={32} />} />
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-2 text-sm">
                      <span className="truncate font-medium">{pdfFile.name}</span>
                      <button type="button" onClick={() => setPdfFile(null)} className="shrink-0 text-xs font-semibold text-muted-foreground hover:text-destructive">Change</button>
                    </div>
                    <fieldset>
                      <legend className="text-sm font-semibold text-foreground">Which pages</legend>
                      <div className="mt-2 flex gap-2">
                        {(["first", "all"] as const).map((p) => (
                          <button key={p} type="button" aria-pressed={applyOpts.pages === p} onClick={() => setApplyOpts((o) => ({ ...o, pages: p }))}
                            className={`h-9 rounded-md border px-3 text-sm ${applyOpts.pages === p ? "border-brand bg-brand-tint font-semibold text-brand" : "border-border"}`}>
                            {p === "first" ? "First page only" : "Every page"}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <fieldset>
                      <legend className="text-sm font-semibold text-foreground">Fitting</legend>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {([
                          ["fit", "Make room", "Shrinks the page slightly so nothing sits under the letterhead."],
                          ["overlay", "Print on top", "Keeps the page as it is. Use when it already has space at the top and bottom."],
                        ] as const).map(([id, title, hint]) => (
                          <button key={id} type="button" aria-pressed={applyOpts.mode === id} onClick={() => setApplyOpts((o) => ({ ...o, mode: id }))}
                            className={`rounded-md border p-3 text-left ${applyOpts.mode === id ? "border-brand bg-brand-tint" : "border-border"}`}>
                            <span className="block text-sm font-semibold text-foreground">{title}</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  </div>
                )}
              </div>
            )}

            {mode === "blank" && (
              <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
                Download the letterhead as a Word document and type your letter in Word: the letterhead stays on the first page and later pages get page numbers.
                Or save it as a PDF to print on.
              </div>
            )}
          </div>

          {/* Preview + actions */}
          <div className="space-y-3 lg:sticky lg:top-24">
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">Preview {rendering && <Loader2 size={14} className="ml-1 inline animate-spin text-muted-foreground" />}</span>
                {output && <span className="text-xs text-muted-foreground">{preview.length} page{preview.length === 1 ? "" : "s"}</span>}
              </div>
              <div className="max-h-[70vh] space-y-3 overflow-y-auto rounded-md bg-muted p-3">
                {preview.length ? (
                  preview.map((src, i) => <img key={i} src={src} alt={`Preview page ${i + 1}`} className="mx-auto w-full max-w-[520px] bg-white shadow" />)
                ) : (
                  <div className="grid aspect-[1/1.414] place-items-center text-sm text-muted-foreground">{mode === "apply" ? "Upload a PDF to see it here" : "Preparing preview…"}</div>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {output && <SaveShareButtons file={output} saveLabel="Save PDF" />}
              {mode !== "apply" && (
                <button type="button" onClick={downloadWord} disabled={wordBusy}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border px-5 text-sm font-semibold text-foreground hover:border-brand hover:text-brand disabled:opacity-60">
                  {wordBusy ? <Loader2 size={16} className="animate-spin" /> : <FileType2 size={16} />} Save as Word
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Letterhead;
