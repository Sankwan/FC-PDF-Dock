/** Same-origin server conversion. The proxy keeps its API key off the client. */
import { features } from "@/brand";

const ENDPOINT = "/api/pdf2word/convert/pdf-to-word";

export const isPdfToWordConfigured = (): boolean => features.pdfToWord;

export interface PdfToWordProgress {
  loadedBytes: number;
  totalBytes: number;
}

export class PdfToWordError extends Error {
  constructor(message: string, public kind: "offsite" | "signed-out" | "too-large" | "unreadable" | "unreachable" | "busy" | "other") {
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
      if (xhr.status >= 200 && xhr.status < 300 && type.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document")) {
        const outName = pdfFile.name.replace(/\.pdf$/i, "") + ".docx";
        resolve(new File([xhr.response], outName, { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
      } else if (xhr.status === 403) {
        reject(new PdfToWordError(features.demoMode ? "The test conversion service is not enabled yet. Ask the test coordinator to check its setup." : "PDF to Word only works on the head-office network for now.", "offsite"));
      } else if (xhr.status === 401) {
        reject(new PdfToWordError(features.demoMode ? "The test converter's server key needs checking. Contact the test coordinator." : "Your sign-in has expired. Sign out and sign in again, then retry.", "signed-out"));
      } else if (xhr.status === 413) {
        reject(new PdfToWordError("This file is larger than the 50MB limit for PDF to Word. Try Split PDF first.", "too-large"));
      } else if (xhr.status === 429) {
        reject(new PdfToWordError("The converter is busy. Wait a minute, then try again.", "busy"));
      } else if (xhr.status === 422) {
        reject(new PdfToWordError("This PDF could not be converted. Remove any password, try fewer pages, or use a clearer scan.", "unreadable"));
      } else if (xhr.status === 404 || xhr.status === 502 || xhr.status === 503 || xhr.status === 504 || type.includes("text/html")) {
        reject(new PdfToWordError("The conversion server is unavailable. Try again shortly.", "unreachable"));
      } else {
        reject(new PdfToWordError(`The conversion service returned an unexpected error (${xhr.status}).`, "other"));
      }
    };
    xhr.onerror = () => {
      reject(new PdfToWordError("The conversion server is unavailable. Try again shortly.", "unreachable"));
    };

    xhr.timeout = 310_000;
    xhr.ontimeout = () => reject(new PdfToWordError("Conversion took too long. Try a smaller PDF.", "unreachable"));
    xhr.send(formData);
  });
};
