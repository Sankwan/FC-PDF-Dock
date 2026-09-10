import { useEffect, useState, useCallback } from "react";

export type Platform = "ios" | "android" | "desktop";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const detectPlatform = (): Platform => {
  const ua = navigator.userAgent;
  // iPadOS 13+ reports as "Macintosh" but is touch-capable — real Macs aren't.
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  if (isIOS) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
};

const detectStandalone = (): boolean =>
  window.matchMedia("(display-mode: standalone)").matches ||
  // iOS Safari's own (non-standard) flag — not covered by the media query above.
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/**
 * Wraps the PWA install flow: which platform the visitor is on (each needs
 * different instructions — iOS Safari has no programmatic install API at
 * all), whether the browser can trigger a native install prompt directly
 * (`beforeinstallprompt`, Chromium-only), and whether the app is already
 * installed.
 */
export const useInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(detectStandalone);
  const [platform] = useState<Platform>(detectPlatform);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return outcome === "accepted";
  }, [deferredPrompt]);

  return {
    platform,
    isStandalone,
    /** True only when the browser can show its own native install prompt
     *  (Chrome/Edge on desktop or Android). Everywhere else — including
     *  every browser on iOS — falls back to manual instructions. */
    canPromptDirectly: deferredPrompt !== null,
    promptInstall,
  };
};
