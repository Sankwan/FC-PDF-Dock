import { useEffect, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { loadPdfDocument, renderPdfPageToCanvas } from "./pdfjs";

/**
 * Previews a change exactly as it will be saved: the page is copied into a
 * one-page PDF, the tool's own function changes it, and the result is
 * rendered. Watermark, headers & footers and crop use the same code for the
 * preview and for the final file, so what people see is what they get.
 */
export type PageTransform = (doc: PDFDocument, pageNumber: number, totalPages: number) => Promise<PDFDocument | void> | PDFDocument | void;

export interface PagePreview {
  url: string;
  /** displayed size in points */
  width: number;
  height: number;
}

export async function renderPreview(src: PDFDocument, pageNumber: number, transform: PageTransform, pixelWidth = 560): Promise<PagePreview> {
  const one = await PDFDocument.create();
  const [page] = await one.copyPages(src, [pageNumber - 1]);
  one.addPage(page);
  const changed = (await transform(one, pageNumber, src.getPageCount())) ?? one;
  const pdf = await loadPdfDocument(await changed.save());
  try {
    const p = await pdf.getPage(1);
    const { width, height } = p.getViewport({ scale: 1 });
    const canvas = await renderPdfPageToCanvas(pdf, 1, pixelWidth / width);
    const url = canvas.toDataURL("image/jpeg", 0.82);
    canvas.width = canvas.height = 0;
    return { url, width, height };
  } finally {
    await pdf.destroy();
  }
}

/**
 * Keeps a preview of one page up to date as settings change. The source is
 * parsed once per file; updates are debounced and stale renders discarded.
 */
export function useLivePreview(file: File | null, pageNumber: number, transform: PageTransform, deps: unknown[], pixelWidth = 560) {
  const [preview, setPreview] = useState<PagePreview | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const docRef = useRef<{ file: File; doc: Promise<PDFDocument> } | null>(null);
  const run = useRef(0);

  useEffect(() => {
    if (!file) { setPreview(null); setPageCount(0); docRef.current = null; return; }
    if (docRef.current?.file !== file) {
      docRef.current = { file, doc: file.arrayBuffer().then((b) => PDFDocument.load(b, { updateMetadata: false })) };
      setPreview(null);
    }
    const id = ++run.current;
    setBusy(true);
    const timer = window.setTimeout(async () => {
      try {
        const doc = await docRef.current!.doc;
        if (id !== run.current) return;
        const count = doc.getPageCount();
        setPageCount(count);
        const result = await renderPreview(doc, Math.min(Math.max(1, pageNumber), count), transform, pixelWidth);
        if (id === run.current) { setPreview(result); setError(null); }
      } catch (err) {
        console.error(err);
        if (id === run.current) setError(err instanceof Error ? err.message : "Couldn't preview this page.");
      } finally {
        if (id === run.current) setBusy(false);
      }
    }, preview ? 180 : 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, pageNumber, pixelWidth, ...deps]);

  return { preview, pageCount, error, busy };
}
