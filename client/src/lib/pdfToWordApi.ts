/**
 * PDF -> Word is the one tool in this app that isn't purely static — it
 * calls a self-hosted backend (services/pdf-to-word/) because nothing
 * client-side can do this direction with real fidelity (see README.md's
 * "PDF to Word" section). Configure the deployment via env vars:
 *
 *   VITE_PDF2WORD_API_URL — base URL of the pdf-to-word service, e.g.
 *     https://pdf2word.your-tunnel.example (must be HTTPS if the site
 *     itself is served over HTTPS, e.g. on Vercel — browsers block a
 *     plain-HTTP request from an HTTPS page as mixed content).
 *   VITE_PDF2WORD_API_KEY — the same shared secret set as API_KEY in the
 *     service's own .env.
 *
 * IMPORTANT: both of these end up in the public JS bundle — any
 * VITE_-prefixed variable is inlined into client-side code Vite ships to
 * every visitor's browser, readable by anyone who opens dev tools. The
 * API key is NOT a real secret once deployed this way; it only filters
 * out casual/automated hits against the backend's public URL. Real access
 * control has to happen at the network layer instead (Cloudflare Access
 * in front of the tunnel, or keeping the backend on a private
 * Tailscale-only address) — see services/pdf-to-word/SECURITY.md.
 */

const API_URL = (import.meta.env.VITE_PDF2WORD_API_URL as string | undefined)?.replace(/\/$/, "");
const API_KEY = import.meta.env.VITE_PDF2WORD_API_KEY as string | undefined;

export const isPdfToWordConfigured = (): boolean => Boolean(API_URL);

export interface PdfToWordProgress {
  loadedBytes: number;
  totalBytes: number;
}

/**
 * Uploads a PDF to the self-hosted conversion service and resolves the
 * converted .docx. Uses XMLHttpRequest (not fetch) specifically for
 * upload-progress events — `fetch` has no standard API for that.
 */
export const convertPdfToWordRemote = (
  pdfFile: File,
  onProgress?: (p: PdfToWordProgress) => void
): Promise<File> => {
  if (!API_URL) {
    return Promise.reject(new Error("PDF to Word isn't configured for this deployment yet."));
  }

  const formData = new FormData();
  formData.append("file", pdfFile);

  return new Promise<File>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}/convert/pdf-to-word`);
    if (API_KEY) xhr.setRequestHeader("X-API-Key", API_KEY);
    xhr.responseType = "blob";

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.({ loadedBytes: e.loaded, totalBytes: e.total });
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const outName = pdfFile.name.replace(/\.pdf$/i, "") + ".docx";
        resolve(
          new File([xhr.response], outName, {
            type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          })
        );
      } else if (xhr.status === 401) {
        reject(new Error("The conversion service rejected this request (bad or missing API key)."));
      } else if (xhr.status === 413) {
        reject(new Error("That file is too large for the conversion service's configured limit."));
      } else if (xhr.status === 422) {
        reject(new Error("The conversion service couldn't process this PDF."));
      } else {
        reject(new Error(`Conversion service returned an unexpected error (${xhr.status}).`));
      }
    };
    xhr.onerror = () => {
      reject(new Error("Could not reach the conversion service — it may be offline, or blocked by a network/CORS setting."));
    };

    xhr.send(formData);
  });
};
