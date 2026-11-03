import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Download, Share, X } from "lucide-react";
import { brand } from "@/brand";
import InstallGuide from "@/components/InstallGuide";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

const SNOOZE_KEY = "pdfdock.install-banner.snoozed-until";
const SNOOZE_DAYS = 14;
const SHOW_AFTER_MS = 4000;

const snoozed = () => {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) || 0) > Date.now();
  } catch {
    return false;
  }
};

const snooze = () => {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 864e5));
  } catch {
    /* private mode: the banner just shows again next visit */
  }
};

/**
 * On phones and tablets, suggests adding the app to the home screen: one tap
 * on Android (the browser's own install prompt), short instructions on
 * iPhone/iPad (Apple offers no install button). Hidden once installed, and
 * for two weeks after "Not now". Only offered on the home page, so it
 * never sits over a tool's buttons mid-task.
 */
const InstallBanner = () => {
  const { platform, isStandalone, canPromptDirectly, promptInstall } = useInstallPrompt();
  const [visible, setVisible] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [location] = useLocation();
  const onHome = location === "/";
  const mobile = platform !== "desktop" || (typeof window !== "undefined" && window.matchMedia("(max-width: 767px) and (pointer: coarse)").matches);

  useEffect(() => {
    if (!mobile || isStandalone || !onHome || snoozed()) {
      setVisible(false);
      return;
    }
    const t = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [mobile, isStandalone, onHome]);

  if (isStandalone) return null;

  const dismiss = () => { snooze(); setVisible(false); };
  const install = async () => {
    if (canPromptDirectly) {
      const accepted = await promptInstall();
      if (accepted) setVisible(false);
      else dismiss();
    } else {
      setGuideOpen(true);
    }
  };

  return (
    <>
      {/* Room at the end of the page so the banner never hides the last content. */}
      {visible && <div aria-hidden="true" className="h-36" />}
      {visible && (
        <div
          role="region"
          aria-label="Add to home screen"
          className="fixed inset-x-0 bottom-0 z-50 px-3 animate-in slide-in-from-bottom-4 fade-in duration-300"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-border bg-card p-3 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.35)]">
            <img src="/icons/icon-192.png" alt="" className="h-12 w-12 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Add {brand.shortName} to your home screen</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Opens like an app, full screen, and keeps working when you're offline.
              </p>
              <div className="mt-2.5 flex gap-2">
                <button type="button" onClick={install} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-sm font-semibold text-white hover:bg-brand-dark">
                  {canPromptDirectly ? <><Download size={15} /> Install</> : <><Share size={15} /> Show me how</>}
                </button>
                <button type="button" onClick={dismiss} className="min-h-10 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:text-foreground">
                  Not now
                </button>
              </div>
            </div>
            <button type="button" onClick={dismiss} aria-label="Close" className="-m-1 grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted">
              <X size={17} />
            </button>
          </div>
        </div>
      )}
      <InstallGuide open={guideOpen} onOpenChange={(open) => { setGuideOpen(open); if (!open) { snooze(); setVisible(false); } }} />
    </>
  );
};

export default InstallBanner;
