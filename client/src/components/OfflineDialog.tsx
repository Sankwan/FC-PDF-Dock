import { useEffect, useState } from "react";
import { CheckCircle2, CloudDownload, Loader2, WifiOff } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { formatFileSize } from "@/lib/fileUtils";
import { ENGINES, TOTAL_APPROX_BYTES, downloadAllEngines, engineStatus, offlineSupported } from "@/lib/offlinePrep";

const OfflineDialog = ({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) => {
  const [status, setStatus] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ loaded: 0, total: 0, current: "" });
  const [error, setError] = useState<string | null>(null);
  const supported = offlineSupported();

  useEffect(() => {
    if (open) engineStatus().then(setStatus);
  }, [open]);

  const ready = ENGINES.filter((e) => status[e.id]).length;
  const allReady = ready === ENGINES.length;
  const remaining = ENGINES.filter((e) => !status[e.id]).reduce((n, e) => n + e.approxBytes, 0);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await downloadAllEngines((loaded, total, current) => setProgress({ loaded, total, current })));
    } catch {
      setError("The download stopped. Check your connection and try again; finished parts are kept.");
      engineStatus().then(setStatus);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-brand-tint text-brand">
            <WifiOff size={18} />
          </span>
          <div>
            <DialogTitle className="text-lg">Set up offline access</DialogTitle>
            <DialogDescription className="mt-1">
              This is optional. Save the larger scanning, text recognition and conversion components now so they're ready without internet.
              Otherwise, they load automatically when you first use those tools. These tools process your documents on this device.
            </DialogDescription>
          </div>
        </div>

        <ul className="mt-2 divide-y divide-border rounded-md border border-border">
          {ENGINES.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">{e.label}</div>
                <div className="truncate text-xs text-muted-foreground">{e.usedBy}</div>
              </div>
              {status[e.id] ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand">
                  <CheckCircle2 size={14} /> On this device
                </span>
              ) : (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatFileSize(e.approxBytes)}</span>
              )}
            </li>
          ))}
        </ul>

        {busy && (
          <div>
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>Downloading {progress.current}…</span>
              <span className="tabular-nums">
                {formatFileSize(progress.loaded)} of {formatFileSize(progress.total || remaining)}
              </span>
            </div>
            <Progress value={progress.total ? (progress.loaded / progress.total) * 100 : 0} className="h-1.5" />
          </div>
        )}

        {error && <p className="text-sm font-medium text-destructive">{error}</p>}

        {!supported && (
          <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            Offline storage isn't active in this window yet. Reload the page once (or install the app from the browser menu) and try again.
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {allReady ? "Everything is ready for offline use." : `${ready} of ${ENGINES.length} ready · about ${formatFileSize(remaining || TOTAL_APPROX_BYTES)} to download`}
          </span>
          {!allReady && (
            <button
              type="button"
              onClick={start}
              disabled={busy || !supported}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <CloudDownload size={15} />}
              {busy ? "Saving components…" : "Save for offline use"}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OfflineDialog;
