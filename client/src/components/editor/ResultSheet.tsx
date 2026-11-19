import { CheckCircle2, FileText, Info, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import SaveShareButtons, { SAVE_HINT } from "@/components/SaveShareButtons";
import { formatFileSize } from "@/lib/fileUtils";

interface Props {
  result: { file: File; signed: boolean; covered: boolean } | null;
  onClose: () => void;
  /** Leave the editor (the file has been handled). */
  onDone: () => void;
}

/** "Your PDF is ready": save or share it, with an honest note about what changed. */
const ResultSheet = ({ result, onClose, onDone }: Props) => (
  <Dialog open={!!result} onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="gap-0 p-0 max-sm:bottom-0 max-sm:top-auto max-sm:max-w-none max-sm:translate-y-0 max-sm:rounded-b-none max-sm:data-[state=open]:slide-in-from-bottom-8 max-sm:data-[state=open]:zoom-in-100">
      {result && (
        <>
          <div className="flex items-start gap-3 px-5 pb-4 pt-5">
            <CheckCircle2 size={26} className="mt-0.5 shrink-0 text-brand" />
            <div>
              <DialogTitle className="text-base">Your PDF is ready</DialogTitle>
              <DialogDescription className="text-xs">Made on this device. Nothing was uploaded.</DialogDescription>
            </div>
          </div>
          <div className="mx-5 flex items-center gap-3 rounded-xl border border-border bg-background p-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand"><FileText size={20} /></span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{result.file.name}</span>
              <span className="text-xs text-muted-foreground">{formatFileSize(result.file.size)}</span>
            </span>
          </div>
          <div className="space-y-2 px-5 pt-3 text-xs leading-relaxed text-muted-foreground">
            {result.signed && (
              <p className="flex gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-brand" /><span>The signing time is recorded in the file. Anyone can use <Link href="/sign-pdf" className="underline">Check a signed PDF</Link> to see if it was changed afterwards.</span></p>
            )}
            {result.covered && (
              <p className="flex gap-2"><Info size={15} className="mt-0.5 shrink-0 text-amber-600" /><span>Text you changed is painted over, so the old words can still be copied out of the file. To remove sensitive text for good, use <Link href="/redact-pdf" className="underline">Redact PDF</Link>.</span></p>
            )}
          </div>
          <div className="space-y-3 px-5 pb-5 pt-4" style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
            <SaveShareButtons file={result.file} className="[&>button]:flex-1" />
            <p className="text-xs text-muted-foreground">{SAVE_HINT}</p>
            <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
              <button type="button" onClick={onClose} className="h-11 rounded-lg border border-border text-sm font-semibold">Keep editing</button>
              <button type="button" onClick={onDone} className="h-11 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-muted">Finish</button>
            </div>
          </div>
        </>
      )}
    </DialogContent>
  </Dialog>
);

export default ResultSheet;
