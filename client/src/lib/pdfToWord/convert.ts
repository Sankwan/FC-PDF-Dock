import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ImageRun, HeadingLevel, AlignmentType, type ISectionOptions } from "docx";
import { loadPdfDocument, renderPdfPageToCanvas, pdfjs } from "../pdfjs";
import { withAbort } from "./cancellation";
import { reconstructPage, spanText, type WordSpan, type WordLine } from "./layout";

export type WordMode = "editable" | "appearance";
interface Options { mode: WordMode; ocr: boolean; signal?: AbortSignal; onProgress?: (percent: number, status: string) => void }
export interface WordResult { file: File; warnings: string[]; pages: number; ocrPages: number }
const MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const abort = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException("Conversion cancelled", "AbortError"); };
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
const runs = (spans: WordSpan[]) => spans.map((s, i) => new TextRun({ text: (i && s.x - spans[i - 1].x - spans[i - 1].width > s.size * .15 && !/^\s/.test(s.text) ? " " : "") + s.text, bold: s.bold, italics: s.italic, size: Math.round(Math.min(72, Math.max(6, s.size)) * 2) }));

export async function convertPdfToWordLocal(file: File, options: Options): Promise<WordResult> {
  if (file.size > 50 * 1024 * 1024) throw new Error("Choose a PDF under 50 MB. Use Split PDF for larger documents.");
  abort(options.signal);
  const pdf = await loadPdfDocument(file).catch((error: unknown) => {
    if (error instanceof Error && error.name === "PasswordException") throw new Error("This PDF is password-protected. Unlock it first, then choose the unlocked PDF.");
    throw error;
  });
  let worker: Awaited<ReturnType<typeof import("../ocrUtils")["createLocalOcrWorker"]>> | undefined;
  const warnings = new Set<string>();
  let ocrPages = 0, totalPixels = 0;
  const cancel = () => { void worker?.terminate().catch(() => {}); void pdf.destroy().catch(() => {}); };
  options.signal?.addEventListener("abort", cancel, { once: true });
  try {
    if (pdf.numPages > 100) throw new Error("Choose up to 100 pages at a time. Use Split PDF to divide this document.");
    const sections: ISectionOptions[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      abort(options.signal);
      options.onProgress?.(Math.round((number - 1) / pdf.numPages * 90), `Reading page ${number} of ${pdf.numPages}`);
      await pause();
      const page = await pdf.getPage(number), viewport = page.getViewport({ scale: 1 });
      let children: (Paragraph | Table)[] = [];
      const width = viewport.width, height = viewport.height;
      if (options.mode === "appearance") {
        const scale = Math.min(1.5, Math.sqrt(4_000_000 / (width * height)));
        totalPixels += width * height * scale * scale;
        if (totalPixels > 80_000_000) throw new Error("This image-based Word file is too large for safe browser processing. Split the PDF or choose Editable text.");
        const canvas = await renderPdfPageToCanvas(pdf, number, scale);
        try {
          const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("Could not render this page.")), "image/jpeg", .92));
          const fit = Math.min((width - 12) / width, (height - 20) / height);
          children = [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [new ImageRun({ type: "jpg", data: new Uint8Array(await blob.arrayBuffer()), altText: { title: `Page ${number}`, description: "PDF page preserved as an image", name: `Page ${number}` }, transformation: { width: width * fit * 96 / 72, height: height * fit * 96 / 72 } })] })];
        } finally { canvas.width = canvas.height = 0; }
      } else {
        const content = await page.getTextContent();
        // Load font descriptors without rendering images; PDF.js resolves them
        // while preparing the operator list. Fall back gracefully if unavailable.
        await page.getOperatorList();
        let spans: WordSpan[] = content.items.flatMap(item => {
          if (!("str" in item) || !item.str.trim()) return [];
          const tx = pdfjs.Util.transform(viewport.transform, item.transform);
          const size = Math.hypot(tx[2], tx[3]);
          const font = content.styles[item.fontName]?.fontFamily || "";
          const descriptor = page.commonObjs.has(item.fontName) ? page.commonObjs.get(item.fontName) : undefined;
          if (Math.abs(tx[1]) > .5) warnings.add("Rotated text may need repositioning in Word.");
          return [{ text: item.str, x: tx[4], y: tx[5] - size, width: item.width, size, bold: Boolean(descriptor?.bold || descriptor?.black || /bold|black|heavy/i.test(font)), italic: Boolean(descriptor?.italic || /italic|oblique/i.test(font)) }];
        });
        if (spans.reduce((n, s) => n + s.text.trim().length, 0) < 5) {
          if (!options.ocr) warnings.add(`Page ${number}: no usable text found. Enable OCR or choose Page images.`);
          else {
            options.onProgress?.(Math.round((number - 1) / pdf.numPages * 90), `Recognising text on page ${number} of ${pdf.numPages}`);
            if (!worker) { const { createLocalOcrWorker } = await import("../ocrUtils"); const creation = createLocalOcrWorker();
              void creation.then(w => { if (options.signal?.aborted) void w.terminate(); }, () => {});
              worker = await withAbort(creation, options.signal); abort(options.signal); }
            const scale = Math.min(2.5, Math.sqrt(4_000_000 / (width * height)));
            const canvas = await renderPdfPageToCanvas(pdf, number, scale);
            try {
              const { data } = await withAbort(worker.recognize(canvas, {}, { text: true, blocks: true }), options.signal);
              ocrPages++;
              if (data.confidence < 75) warnings.add(`Page ${number}: OCR confidence is low. Check names and figures carefully.`);
              spans = data.blocks?.flatMap(b => b.paragraphs.flatMap(p => p.lines.flatMap(l => l.words.map(w => ({ text: w.text, x: w.bbox.x0 / scale, y: l.bbox.y0 / scale, width: (w.bbox.x1 - w.bbox.x0) / scale, size: Math.max(8, (l.bbox.y1 - l.bbox.y0) * .9 / scale) }))))) ?? [];
              if (!spans.length) warnings.add(`Page ${number}: OCR found no readable text. Try a clearer scan or Page images.`);
            } finally { canvas.width = canvas.height = 0; }
          }
        }
        abort(options.signal);
        const sizes = spans.flatMap(s => Array(Math.min(s.text.length, 100)).fill(s.size) as number[]).sort((a, b) => a - b);
        const bodySize = sizes[Math.floor(sizes.length / 2)] || 11;
        const paragraph = (lines: WordLine[], cell = false) => {
          const first = lines[0], title = !cell && first.size > bodySize * 1.22 && spanText(first.spans).length < 180;
          return new Paragraph({
            heading: title ? (first.size > bodySize * 1.65 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2) : undefined,
            spacing: { after: title ? 140 : 80 },
            alignment: first.spans[0]?.text.match(/^[\u0590-\u08ff]/) ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: lines.flatMap((line, i) => [...(i ? [new TextRun(" ")] : []), ...runs(line.spans)]),
          });
        };
        children = reconstructPage(spans).map(block => block.type === "paragraph" ? paragraph(block.lines) : new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: block.rows.map(row => new TableRow({ children: row.map(cell => new TableCell({ children: [paragraph([{ spans: cell, cells: [cell], y: cell[0].y, size: cell[0].size }], true)] })) })),
        }));
        if (!children.length) children = [new Paragraph("")];
      }
      sections.push({ properties: { page: { size: { width: Math.round(width * 20), height: Math.round(height * 20) }, margin: options.mode === "appearance" ? { top: 0, bottom: 0, left: 0, right: 0 } : { top: 600, bottom: 600, left: 600, right: 600 } } }, children });
      page.cleanup();
    }
    abort(options.signal);
    options.onProgress?.(95, "Building your Word document");
    await pause();
    const document = new Document({ creator: "FC PDFDock", styles: { default: { document: { run: { font: "Arial", size: 22 } } } }, sections });
    const blob = await Packer.toBlob(document);
    abort(options.signal);
    options.onProgress?.(100, "Ready to download");
    return { file: new File([blob], file.name.replace(/\.pdf$/i, "") + (options.mode === "appearance" ? "_pages" : "") + ".docx", { type: MIME }), warnings: [...warnings], pages: pdf.numPages, ocrPages };
  } catch (error) { abort(options.signal); throw error; }
  finally { options.signal?.removeEventListener("abort", cancel); await worker?.terminate().catch(() => {}); await pdf.destroy().catch(() => {}); }
}
