import { lazy, Suspense, useEffect, useState } from "react";
import { FilePenLine, History, Loader2, PenLine, Shapes, Type } from "lucide-react";
import ToolHeader from "@/components/ToolHeader";
import FileUpload from "@/components/FileUpload";
import SignatureCheck from "@/components/SignatureCheck";
import { useFileVault } from "@/context/FileVault";
import { useAuth } from "@/context/Auth";
import { readEditDraft, writeEditDraft, type EditDraft } from "@/lib/editor/draft";
import type { EditorObject } from "@/lib/editor/types";

const EditorWorkspace = lazy(() => import("@/components/editor/EditorWorkspace"));

const COPY = {
  edit: {
    category: "Edit & sign",
    title: "Edit PDF",
    description: "Change existing text, add text, signatures, ticks, dates, stamps and drawings. Everything happens on this device.",
    upload: "Choose a PDF to edit",
  },
  sign: {
    category: "Official documents",
    title: "Sign PDF",
    description: "Draw, type or photograph your signature and place it on the page. The signing time is recorded so changes can be checked later.",
    upload: "Choose a PDF to sign",
  },
};

/** Edit PDF and Sign PDF share one editor; Sign opens with the signature sheet ready. */
const EditPdf = ({ intent = "edit" }: { intent?: "edit" | "sign" }) => {
  const copy = COPY[intent];
  const [file, setFile] = useState<File | null>(null);
  const [restored, setRestored] = useState<EditorObject[] | undefined>();
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const { files: vaultFiles, removeFile } = useFileVault();
  const { user } = useAuth();
  const draftScope = user?.email ?? "local-preview";

  useEffect(() => {
    if (file) return;
    let alive = true;
    readEditDraft(draftScope).then((d) => alive && setDraft(d)).catch(() => undefined);
    return () => { alive = false; };
  }, [draftScope, file]);

  const startNew = (f: File | null) => {
    // A new file replaces any earlier unfinished session.
    if (f && draft) writeEditDraft(null, draftScope).catch(() => undefined);
    setDraft(null);
    setRestored(undefined);
    setFile(f);
  };

  const close = () => {
    vaultFiles.filter((vf) => vf.file === file).forEach((vf) => removeFile(vf.id));
    setFile(null);
    setRestored(undefined);
  };

  const features = [
    { Icon: Type, title: "Fix text", body: "Tap any line to retype it in a matching style." },
    { Icon: PenLine, title: "Sign", body: "Draw, type or photograph your signature." },
    { Icon: Shapes, title: "Mark up", body: "Ticks, dates, stamps, boxes, highlighter and pen." },
  ];

  return (
    <section className="min-h-[60vh] bg-background py-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <ToolHeader category={copy.category} title={copy.title} description={copy.description} />
        <div className="max-w-2xl space-y-4">
          {draft && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand/40 bg-brand-tint p-4">
              <History size={20} className="shrink-0 text-brand" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">Continue editing {draft.name}?</p>
                <p className="text-xs text-muted-foreground">{draft.objects.length} change{draft.objects.length === 1 ? "" : "s"} kept on this device · {new Date(draft.savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { writeEditDraft(null, draftScope).catch(() => undefined); setDraft(null); }} className="min-h-11 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-card">Discard</button>
                <button type="button" onClick={() => { setRestored(draft.objects); setFile(new File([draft.file], draft.name, { type: "application/pdf" })); setDraft(null); }}
                  className="min-h-11 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark">Continue</button>
              </div>
            </div>
          )}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
            <FileUpload
              accept=".pdf,application/pdf"
              maxSizeInMB={100}
              onFilesSelected={(f) => startNew(f[0] ?? null)}
              title={copy.upload}
              description="Drag & drop or click to browse. It never leaves this device."
              buttonText="Select PDF"
              icon={intent === "sign" ? <PenLine size={34} /> : <FilePenLine size={34} />}
            />
          </div>
          {intent === "edit" && (
            <ul className="grid gap-3 sm:grid-cols-3">
              {features.map(({ Icon, title, body }) => (
                <li key={title} className="rounded-xl border border-border bg-card p-4">
                  <Icon size={18} className="text-brand" />
                  <p className="mt-2 text-sm font-semibold">{title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>
                </li>
              ))}
            </ul>
          )}
          {intent === "sign" && <SignatureCheck />}
        </div>
      </div>
      {file && (
        <Suspense fallback={<div role="status" className="fixed inset-0 z-50 grid place-items-center bg-background/90"><Loader2 className="animate-spin text-brand" /></div>}>
          <EditorWorkspace key={file.name + file.size + file.lastModified} file={file} startWithSignature={intent === "sign"} initialObjects={restored} draftScope={draftScope} onClose={close} />
        </Suspense>
      )}
    </section>
  );
};

export default EditPdf;
