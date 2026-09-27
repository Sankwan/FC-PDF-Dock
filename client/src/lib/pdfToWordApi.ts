/**
 * PDF to Word is the one tool that isn't purely client-side: it calls the
 * head-office pdf-to-word service (services/pdf-to-word/), because nothing
 * that runs in a browser can rebuild an editable Word document from a PDF
 * with real fidelity (see README.md, "PDF to Word").
 *
 * The browser calls it on the same origin, at /api/pdf2word. nginx on the
 * head-office server (deploy/headoffice/nginx.conf) then:
 *   - checks the staff session cookie with the auth service,
 *   - allows only head-office network addresses (HEADOFFICE_NETWORKS),
 *   - adds the service's API key itself, server side.
 * So no key or service address ships in the JavaScript bundle, and there is
 * no cross-origin (CORS) setup to get wrong.
 */
import { features } from "@/brand";

const ENDPOINT = "/api/pdf2word/convert/pdf-to-word";

export const isPdfToWordConfigured = (): boolean => features.pdfToWord;

export interface PdfToWordProgress {
  loadedBytes: number;
  totalBytes: number;
}

export class PdfToWordError extends Error {
  constructor(message: string, public kind: "offsite" | "signed-out" | "too-large" | "unreadable" | "unreachable" | "other") {
    super(message);
  }
}

/**
 * Uploads a PDF to the head-office conversion service and resolves the
 * converted .docx. Uses XMLHttpRequest (not fetch) for upload progress.
 */
export const convertPdfToWordRemote = (
  pdfFile: File,
  onProgress?: (p: PdfToWordProgress) => void
): Promise<File> => {
  const formData = new FormData();
  formData.append("file", pdfFile);

  return new Promise<File>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", ENDPOINT);
    xhr.withCredentials = true;
    xhr.responseType = "blob";

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.({ loadedBytes: e.loaded, totalBytes: e.total });
    };

    xhr.onload = () => {
      const type = xhr.getResponseHeader("Content-Type") || "";
      if (xhr.status >= 200 && xhr.status < 300 && !type.includes("text/html")) {
        const outName = pdfFile.name.replace(/\.pdf$/i, "") + ".docx";
        resolve(new File([xhr.response], outName, { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
      } else if (xhr.status === 403) {
        reject(new PdfToWordError("PDF to Word only works on the head-office network for now.", "offsite"));
      } else if (xhr.status === 401) {
        reject(new PdfToWordError("Your sign-in has expired. Sign out and sign in again, then retry.", "signed-out"));
      } else if (xhr.status === 413) {
        reject(new PdfToWordError("This file is larger than the 50MB limit for PDF to Word. Try Split PDF first.", "too-large"));
      } else if (xhr.status === 422) {
        reject(new PdfToWordError("The server couldn't read this PDF. It may be damaged.", "unreadable"));
      } else if (xhr.status === 404 || xhr.status === 502 || xhr.status === 503 || xhr.status === 504 || type.includes("text/html")) {
        reject(new PdfToWordError("The head-office conversion service isn't reachable from here.", "unreachable"));
      } else {
        reject(new PdfToWordError(`The conversion service returned an unexpected error (${xhr.status}).`, "other"));
      }
    };
    xhr.onerror = () => {
      reject(new PdfToWordError("The head-office conversion service isn't reachable from here.", "unreachable"));
    };

    xhr.send(formData);
  });
};
