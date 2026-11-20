import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { useLocation } from "wouter";

/**
 * The app is saved for offline use, so a new release arrives in the
 * background and only shows after a reload. This makes that happen:
 * on the home page and guides it reloads straight away; inside a tool it
 * asks first, so nobody loses a half-filled form.
 */
const UpdateBanner = () => {
  const [location] = useLocation();
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    // No controller yet means this is the first install, not an update.
    let hadController = !!sw.controller;
    const onChange = () => {
      if (!hadController) { hadController = true; return; }
      setReady(true);
    };
    sw.addEventListener("controllerchange", onChange);

    // Look for a new release when the app is reopened, and hourly while open.
    let timer: number | undefined;
    sw.ready.then((reg) => {
      const check = () => reg.update().catch(() => {});
      const onVisible = () => document.visibilityState === "visible" && check();
      document.addEventListener("visibilitychange", onVisible);
      timer = window.setInterval(check, 60 * 60 * 1000);
    });
    return () => { sw.removeEventListener("controllerchange", onChange); if (timer) clearInterval(timer); };
  }, []);

  const safeToReload = location === "/" || location.startsWith("/guides");
  useEffect(() => {
    if (ready && safeToReload) window.location.reload();
  }, [ready, safeToReload]);

  if (!ready || hidden || safeToReload) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[60] flex justify-center px-3 pt-2">
      <div className="flex max-w-xl items-center gap-3 rounded-lg border border-brand/40 bg-card px-3 py-2 text-sm shadow-lg">
        <RefreshCw size={16} className="shrink-0 text-brand" />
        <span className="flex-1">PDFDock has been updated. Reload when you've saved your work.</span>
        <button type="button" onClick={() => window.location.reload()} className="min-h-9 rounded-md bg-brand px-3 font-semibold text-white hover:bg-brand-dark">Reload</button>
        <button type="button" onClick={() => setHidden(true)} aria-label="Later" className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-muted"><X size={16} /></button>
      </div>
    </div>
  );
};

export default UpdateBanner;
