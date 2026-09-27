import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Loader2, LockKeyhole, LockKeyholeOpen } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { decryptPdf, QpdfError } from "@/lib/pdfEncryption";
import { inspectPdfLock, isPdf, type LockState } from "@/lib/pdfLock";

/**
 * Locked PDFs used to go straight into the tools, which loaded them with
 * pdf-lib's `ignoreEncryption` and produced blank or corrupted output with
 * no explanation. Now every file picked through FileUpload passes through
 * `ensureUnlocked` first: an encrypted PDF opens this dialog, and the tool
 * only receives the decrypted copy (or nothing, if the person cancels).
 * Decryption happens on the device with qpdf; the password is never stored.
 */

interface Request {
  file: File;
  state: Exclude<LockState, "none">;
  resolve: (file: File | null) => void;
}

let queue: Request[] = [];
let notify: (() => void) | null = null;

const enqueue = (req: Request) => {
  queue.push(req);
  notify?.();
};

export const ensureUnlocked = async (files: File[]): Promise<File[]> => {
  const out: File[] = [];
  for (const file of files) {
    if (!isPdf(file)) {
      out.push(file);
      continue;
    }
    const state = await inspectPdfLock(file);
    if (state === "none") {
      out.push(file);
      continue;
    }
    // No dialog mounted (shouldn't happen inside the app): pass the file on
    // untouched rather than silently dropping it.
    if (!notify) {
      out.push(file);
      continue;
    }
    const unlocked = await new Promise<File | null>((resolve) => enqueue({ file, state, resolve }));
    if (unlocked) out.push(unlocked);
  }
  return out;
};

const UnlockPdfDialog = () => {
  const [current, setCurrent] = useState<Request | null>(null);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    notify = () => setCurrent((c) => c ?? queue[0] ?? null);
    notify();
    return () => {
      notify = null;
    };
  }, []);

  const finish = (file: File | null) => {
    if (!current) return;
    current.resolve(file);
    queue = queue.filter((r) => r !== current);
    setPassword("");
    setError(null);
    setShow(false);
    setCurrent(queue[0] ?? null);
  };

  const unlock = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!current) return;
    if (current.state === "password" && !password) {
      setError("Enter the password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const file = await decryptPdf(current.file, password);
      finish(file);
    } catch (err) {
      setError(
        err instanceof QpdfError && err.exitCode === 2
          ? "That password isn't right. Check capital letters and try again."
          : "This PDF couldn't be unlocked. It may be damaged."
      );
      inputRef.current?.select();
    } finally {
      setBusy(false);
    }
  };

  const needsPassword = current?.state === "password";

  return (
    <Dialog open={Boolean(current)} onOpenChange={(open) => !open && !busy && finish(null)}>
      <DialogContent className="max-w-md">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-brand-tint text-brand">
            <LockKeyhole size={18} />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-lg">{needsPassword ? "This PDF is password-protected" : "This PDF has editing restrictions"}</DialogTitle>
            <DialogDescription className="mt-1 break-words">
              <span className="font-medium text-foreground">{current?.file.name}</span>
              {needsPassword
                ? " needs its password before the tools can work on it."
                : " opens normally but is locked against changes. Unlock a copy on this device to continue. The original file isn't changed."}
            </DialogDescription>
          </div>
        </div>

        <form onSubmit={unlock} className="mt-2 space-y-4">
          {needsPassword && (
            <div>
              <Label htmlFor="unlock-password" className="text-sm font-semibold">Password</Label>
              <div className="relative mt-1.5">
                <Input
                  id="unlock-password"
                  ref={inputRef}
                  type={show ? "text" : "password"}
                  autoComplete="off"
                  autoFocus
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  className="h-11 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? "Hide password" : "Show password"}
                  className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center text-muted-foreground hover:text-foreground"
                >
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}
          {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => finish(null)} disabled={busy}
              className="h-10 rounded-md border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted">
              Don't use this file
            </button>
            <button type="submit" disabled={busy}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <LockKeyholeOpen size={15} />}
              Unlock
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default UnlockPdfDialog;
