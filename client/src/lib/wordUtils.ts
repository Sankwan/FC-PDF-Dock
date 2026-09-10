// The wasm binary's URL is imported separately (as a plain string, via
// Vite's `?url`) from the glue JS module (dynamically imported below) so we
// can fetch it ourselves with real byte progress, instead of letting
// wasm-bindgen's internal fetch hide that from the UI. Both resolve to the
// exact same file — office2pdf.js does `new URL('office2pdf_bg.wasm',
// import.meta.url)` internally, which is this same path relative to the
// same directory.
import wasmUrl from "./office2pdf-wasm/office2pdf_bg.wasm?url";

// Dynamically imported (not a static top-level import) so the office2pdf
// glue JS — and the ~47MB WASM binary it wraps — is only ever pulled in for
// visitors who actually open the Word to PDF tool, not bundled into every
// page's main chunk.
type Office2Pdf = typeof import("./office2pdf-wasm/office2pdf.js");

export interface DocxConvertProgress {
  /** Overall phase, for status text. */
  phase: "downloading-engine" | "converting";
  /** 0-100. Only meaningful during "downloading-engine"; -1 if the server
   *  didn't send a Content-Length (progress is then indeterminate). */
  percent: number;
  loadedBytes: number;
  totalBytes: number;
}

/** Fetches a URL, reporting real byte progress as it streams in. */
const fetchWithProgress = async (
  url: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<ArrayBuffer> => {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const totalBytes = Number(response.headers.get("content-length") ?? 0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loadedBytes = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loadedBytes += value.byteLength;
    onProgress?.(loadedBytes, totalBytes);
  }

  const combined = new Uint8Array(loadedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined.buffer;
};

let modulePromise: Promise<Office2Pdf> | null = null;

/**
 * Loads and initializes the office2pdf WASM module exactly once, reporting
 * real download progress for the (large, one-time) wasm fetch.
 */
const ensureInit = (onProgress?: (p: DocxConvertProgress) => void): Promise<Office2Pdf> => {
  if (!modulePromise) {
    modulePromise = (async () => {
      const [mod, wasmBytes] = await Promise.all([
        import("./office2pdf-wasm/office2pdf.js"),
        fetchWithProgress(wasmUrl, (loaded, total) => {
          onProgress?.({
            phase: "downloading-engine",
            percent: total > 0 ? Math.round((loaded / total) * 100) : -1,
            loadedBytes: loaded,
            totalBytes: total,
          });
        }),
      ]);
      await mod.default(wasmBytes);
      return mod;
    })().catch((err) => {
      modulePromise = null; // let a retry re-attempt init after a real failure
      throw err;
    });
  }
  return modulePromise;
};

/**
 * Converts a .docx file to PDF entirely in the browser — no upload, no
 * server. Powered by office2pdf (Rust/WASM, Apache-2.0): pdf-lib and PDF.js
 * (used elsewhere in this app) only read/write PDFs, so DOCX support needed
 * a real OOXML-to-PDF renderer, which is what office2pdf provides.
 */
export const convertDocxToPdf = async (
  docxFile: File,
  onProgress?: (p: DocxConvertProgress) => void
): Promise<File> => {
  const office2pdf = await ensureInit(onProgress);

  onProgress?.({ phase: "converting", percent: -1, loadedBytes: 0, totalBytes: 0 });
  const bytes = new Uint8Array(await docxFile.arrayBuffer());
  const pdfBytes = office2pdf.convertDocxToPdf(bytes);

  // Normalise to a fresh, non-shared ArrayBuffer — wasm-bindgen's returned
  // Uint8Array is typed as ArrayBufferLike, which File/Blob don't accept.
  const copy = new Uint8Array(pdfBytes.byteLength);
  copy.set(pdfBytes);

  const outName = docxFile.name.replace(/\.docx$/i, "") + ".pdf";
  return new File([copy], outName, { type: "application/pdf" });
};
