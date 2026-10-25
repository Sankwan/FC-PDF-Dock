/**
 * "Download tools for offline use".
 *
 * The basic app (every page, pdf.js, pdf-lib, the fonts) is saved on the
 * device when it's installed, about 4MB. Four tools also need a larger
 * engine, which is normally downloaded the first time someone opens that
 * tool. At an outstation with a weak connection, that first open could mean
 * a long wait, or no tool at all while offline.
 *
 * This fetches all four engines in one go, with a progress bar, while the
 * person is on good Wi-Fi (at head office, for example). The service worker
 * (vite.config.ts runtimeCaching) stores each response as it passes, so
 * afterwards every tool works with no connection.
 */
import office2pdfWasmUrl from "./office2pdf-wasm/office2pdf_bg.wasm?url";

export interface Engine {
  id: string;
  label: string;
  usedBy: string;
  urls: string[];
  /** approximate download size, for display before we know the real size */
  approxBytes: number;
}

export const ENGINES: Engine[] = [
  {
    id: "qpdf",
    label: "Encryption engine",
    usedBy: "Protect PDF, unlocking locked PDFs, Compress",
    urls: ["/qpdf/qpdf.wasm"],
    approxBytes: 1.3e6,
  },
  {
    id: "ocr",
    label: "Text recognition (OCR)",
    usedBy: "OCR PDF, PDF to Word scans, Redact PDF, Scan document",
    urls: [
      "/tesseract/worker.min.js",
      "/tesseract/core/tesseract-core-simd-lstm.wasm.js",
      "/tesseract/core/tesseract-core-simd-lstm.wasm",
      "/tesseract/lang/eng.traineddata.gz",
    ],
    approxBytes: 9.8e6,
  },
  {
    id: "scanner",
    label: "Document scanner",
    usedBy: "Scan document",
    urls: ["/opencv/opencv.js"],
    approxBytes: 13.3e6,
  },
  {
    id: "word",
    label: "Word to PDF engine",
    usedBy: "Word to PDF, Letterhead",
    urls: [office2pdfWasmUrl],
    approxBytes: 49.3e6,
  },
];

export const TOTAL_APPROX_BYTES = ENGINES.reduce((n, e) => n + e.approxBytes, 0);

const RUNTIME_CACHES = ["qpdf-engine", "ocr-engine", "scanner-engine", "office2pdf-engine"];

const isCached = async (url: string): Promise<boolean> => {
  if (!("caches" in window)) return false;
  const abs = new URL(url, location.origin).href;
  for (const name of RUNTIME_CACHES) {
    try {
      const cache = await caches.open(name);
      if (await cache.match(abs)) return true;
    } catch {
      /* cache storage unavailable */
    }
  }
  return false;
};

export const engineStatus = async (): Promise<Record<string, boolean>> => {
  const out: Record<string, boolean> = {};
  for (const e of ENGINES) {
    const all = await Promise.all(e.urls.map(isCached));
    out[e.id] = all.every(Boolean);
  }
  return out;
};

/** true when a service worker controls the page, i.e. downloads will be kept */
export const offlineSupported = () => "serviceWorker" in navigator && Boolean(navigator.serviceWorker.controller);

const fetchCounting = async (url: string, onBytes: (n: number) => void) => {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok || !res.body) throw new Error(`Couldn't download ${url} (${res.status})`);
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onBytes(value.byteLength);
  }
};

/**
 * Downloads every engine not already on the device. Asks the browser to
 * keep this site's storage (so it isn't cleared when the disk is low).
 */
export const downloadAllEngines = async (onProgress: (loaded: number, total: number, current: string) => void) => {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* optional */
  }
  const status = await engineStatus();
  const todo = ENGINES.filter((e) => !status[e.id]);
  const total = todo.reduce((n, e) => n + e.approxBytes, 0);
  let loaded = 0;
  for (const engine of todo) {
    for (const url of engine.urls) {
      await fetchCounting(url, (n) => {
        loaded += n;
        onProgress(Math.min(loaded, total), total, engine.label);
      });
    }
  }
  onProgress(total, total, "");
  return engineStatus();
};
