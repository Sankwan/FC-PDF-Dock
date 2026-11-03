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

/** Chrome, Firefox, Edge etc. on iPhone can't add to the home screen on older iOS; Safari always can. */
export const isIosNonSafari = () => /CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);

// `beforeinstallprompt` fires once, often before React mounts, and its
// prompt() can only be used once. Capture it here and share it with every
// component that offers installing (header, banner, install guide).
let deferred: BeforeInstallPromptEvent | null = null;
let installed = typeof window !== "undefined" && detectStandalone();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    notify();
  });
}

/**
 * Wraps the PWA install flow: which platform the visitor is on (each needs
 * different instructions — iOS Safari has no programmatic install API at
 * all), whether the browser can trigger a native install prompt directly
 * (`beforeinstallprompt`, Chromium-only), and whether the app is already
 * installed.
 */
export const useInstallPrompt = () => {
  const [, rerender] = useState(0);
  const [platform] = useState<Platform>(detectPlatform);

  useEffect(() => {
    const l = () => rerender((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);

  const promptInstall = useCallback(async () => {
    const event = deferred;
    if (!event) return false;
    deferred = null;
    notify();
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome === "accepted";
  }, []);

  return {
    platform,
    isStandalone: installed,
    /** True only when the browser can show its own native install prompt
     *  (Chrome/Edge on desktop or Android). Everywhere else — including
     *  every browser on iOS — falls back to manual instructions. */
    canPromptDirectly: deferred !== null,
    promptInstall,
  };
};
