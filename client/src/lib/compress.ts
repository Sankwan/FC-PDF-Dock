/**
 * Text-preserving PDF compression, entirely in the browser.
 *
 * The old Compress tool re-drew every page as a JPEG. That shrinks files but
 * turns letters, permits and reports into pictures: text can no longer be
 * searched, selected or copied, and small print blurs.
 *
 * This engine works the way desktop tools (Acrobat "Reduce File Size",
 * Ghostscript /ebook) do: images are what make PDFs big, so it
 * recompresses only the image objects inside the file and leaves text,
 * fonts and vector drawings exactly as they were. Then qpdf rewrites the file
 * structure losslessly (object streams, maximum Flate compression, unused
 * resources removed).
 *
 * Approach adapted from github.com/drikusroor/compress-pdf (permissive
 * licence): parse objects with pdf-lib, decode each image with the browser's
 * own codecs, optionally downsample, re-encode as JPEG, and keep the new
 * version only if it's smaller. Image types the browser can't round-trip
 * safely (CMYK, indexed colour, 1-bit scans, JPEG 2000, masks with custom
 * decode arrays) are left untouched rather than risk damaging them.
 */
import { PDFArray, PDFDict, PDFName, PDFNumber, PDFRawStream, PDFRef, type PDFDocument } from "pdf-lib";
import { loadPdfForEditing, makePdfFile } from "./pdfUtils";
import { optimizePdfStructure } from "./pdfEncryption";
import { brand } from "@/brand";

export type CompressLevel = "light" | "balanced" | "strong";

/**
 * maxDpi: images are downsampled so they're no sharper than this when
 * printed across a full A4 page (a 150dpi image across 11.7in = 1755px).
 * quality: JPEG quality for re-encoded images.
 */
export const COMPRESS_PRESETS: Record<CompressLevel, { maxDpi: number; quality: number; label: string; hint: string }> = {
  light: { maxDpi: 220, quality: 0.85, label: "Light", hint: "Best for documents you'll print. Smallest quality change." },
  balanced: { maxDpi: 150, quality: 0.72, label: "Balanced", hint: "Good for email and WhatsApp. Photos stay clear." },
  strong: { maxDpi: 110, quality: 0.58, label: "Strong", hint: "Smallest file. Photos lose some detail; text is unaffected." },
};

export interface CompressResult {
  file: File;
  originalBytes: number;
  outputBytes: number;
  imagesFound: number;
  imagesRecompressed: number;
  /** true when the result is the original file because nothing could be made smaller */
  unchanged: boolean;
  hadDigitalSignature: boolean;
}

export interface CompressOptions {
  level: CompressLevel;
  removeMetadata?: boolean;
  onProgress?: (done: number, total: number, stage: string) => void;
}

const A4_LONG_SIDE_INCHES = 11.69;
const MIN_IMAGE_BYTES = 12 * 1024;

const nameOf = (v: unknown) => (v instanceof PDFName ? v.decodeText() : undefined);
const num = (dict: PDFDict, key: string) => {
  const v = dict.lookup(PDFName.of(key));
  return v instanceof PDFNumber ? v.asNumber() : undefined;
};

/** Returns 1 (gray) or 3 (RGB) for colour spaces we can round-trip, otherwise null. */
const componentsOf = (doc: PDFDocument, cs: unknown): 1 | 3 | null => {
  const resolved = cs instanceof PDFRef ? doc.context.lookup(cs) : cs;
  const n = nameOf(resolved);
  if (n === "DeviceRGB" || n === "CalRGB") return 3;
  if (n === "DeviceGray" || n === "CalGray") return 1;
  if (resolved instanceof PDFArray && resolved.size() >= 1) {
    const family = nameOf(resolved.lookup(0));
    if (family === "ICCBased") {
      const profile = resolved.lookup(1);
      const stream = profile instanceof PDFRawStream ? profile : undefined;
      const count = stream ? num(stream.dict, "N") : undefined;
      if (count === 3) return 3;
      if (count === 1) return 1;
    }
    if (family === "CalRGB") return 3;
    if (family === "CalGray") return 1;
  }
  return null;
};

const inflate = async (bytes: Uint8Array): Promise<Uint8Array> => {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

/** Reverses PNG row predictors (DecodeParms /Predictor 10-15). */
const unpredictPng = (data: Uint8Array, columns: number, colors: number): Uint8Array => {
  const bpp = colors;
  const rowLen = columns * colors;
  const rows = Math.floor(data.length / (rowLen + 1));
  const out = new Uint8Array(rows * rowLen);
  for (let r = 0; r < rows; r++) {
    const filter = data[r * (rowLen + 1)];
    const src = r * (rowLen + 1) + 1;
    const dst = r * rowLen;
    const prev = dst - rowLen;
    for (let i = 0; i < rowLen; i++) {
      const x = data[src + i];
      const left = i >= bpp ? out[dst + i - bpp] : 0;
      const up = r > 0 ? out[prev + i] : 0;
      const upLeft = r > 0 && i >= bpp ? out[prev + i - bpp] : 0;
      let v: number;
      switch (filter) {
        case 0: v = x; break;
        case 1: v = x + left; break;
        case 2: v = x + up; break;
        case 3: v = x + ((left + up) >> 1); break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          v = x + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
          break;
        }
        default: throw new Error("Unknown PNG predictor");
      }
      out[dst + i] = v & 0xff;
    }
  }
  return out;
};

const toImageData = (raw: Uint8Array, width: number, height: number, comps: 1 | 3): ImageData => {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const pixels = width * height;
  if (raw.length < pixels * comps) throw new Error("Image data is shorter than expected");
  for (let p = 0, s = 0, d = 0; p < pixels; p++, d += 4) {
    if (comps === 3) {
      rgba[d] = raw[s++];
      rgba[d + 1] = raw[s++];
      rgba[d + 2] = raw[s++];
    } else {
      const g = raw[s++];
      rgba[d] = rgba[d + 1] = rgba[d + 2] = g;
    }
    rgba[d + 3] = 255;
  }
  return new ImageData(rgba, width, height);
};

const encodeJpeg = async (bitmap: ImageBitmap, quality: number): Promise<Uint8Array> => {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff"; // JPEG has no alpha; transparency is kept by the SMask
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error("JPEG encoding failed");
  return new Uint8Array(await blob.arrayBuffer());
};

interface Candidate {
  ref: PDFRef;
  stream: PDFRawStream;
  width: number;
  height: number;
  comps: 1 | 3;
  filter: "DCTDecode" | "FlateDecode";
}

const findCandidates = (doc: PDFDocument): { candidates: Candidate[]; imagesFound: number } => {
  const candidates: Candidate[] = [];
  let imagesFound = 0;
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const dict = obj.dict;
    if (nameOf(dict.lookup(PDFName.of("Subtype"))) !== "Image") continue;
    imagesFound++;
    if (obj.contents.length < MIN_IMAGE_BYTES) continue;
    if (dict.lookup(PDFName.of("ImageMask"))) continue; // 1-bit stencil
    if (dict.get(PDFName.of("Decode")) || dict.get(PDFName.of("Mask"))) continue;
    if (num(dict, "BitsPerComponent") !== 8) continue;
    const width = num(dict, "Width");
    const height = num(dict, "Height");
    if (!width || !height) continue;

    let filterObj = dict.lookup(PDFName.of("Filter"));
    if (filterObj instanceof PDFArray) {
      if (filterObj.size() !== 1) continue;
      filterObj = filterObj.lookup(0);
    }
    const filter = nameOf(filterObj);
    if (filter !== "DCTDecode" && filter !== "FlateDecode") continue;

    const comps = componentsOf(doc, dict.get(PDFName.of("ColorSpace")));
    if (!comps) continue;

    if (filter === "FlateDecode") {
      const parms = dict.lookup(PDFName.of("DecodeParms"));
      if (parms instanceof PDFDict) {
        const predictor = num(parms, "Predictor") ?? 1;
        if (predictor !== 1 && predictor < 10) continue; // TIFF predictor: skip
      } else if (parms) continue;
    }
    candidates.push({ ref, stream: obj, width, height, comps, filter });
  }
  return { candidates, imagesFound };
};

const decodeToBitmap = async (c: Candidate, target: { width: number; height: number }): Promise<ImageBitmap> => {
  const resize = target.width < c.width ? { resizeWidth: target.width, resizeHeight: target.height, resizeQuality: "high" as const } : {};
  if (c.filter === "DCTDecode") {
    return createImageBitmap(new Blob([c.stream.contents as BlobPart], { type: "image/jpeg" }), resize);
  }
  let raw = await inflate(c.stream.contents);
  const parms = c.stream.dict.lookup(PDFName.of("DecodeParms"));
  if (parms instanceof PDFDict && (num(parms, "Predictor") ?? 1) >= 10) {
    raw = unpredictPng(raw, num(parms, "Columns") ?? c.width, num(parms, "Colors") ?? c.comps);
  }
  return createImageBitmap(toImageData(raw, c.width, c.height, c.comps), resize);
};

export const detectDigitalSignature = (doc: PDFDocument): boolean => {
  const acro = doc.catalog.lookupMaybe(PDFName.of("AcroForm"), PDFDict);
  const flags = acro ? num(acro, "SigFlags") ?? 0 : 0;
  return (flags & 1) === 1;
};

export const compressPdfKeepText = async (pdfFile: File, options: CompressOptions): Promise<CompressResult> => {
  const { level, removeMetadata = false, onProgress } = options;
  const preset = COMPRESS_PRESETS[level];
  const maxLongSide = Math.round(preset.maxDpi * A4_LONG_SIDE_INCHES);

  const originalBytes = pdfFile.size;
  const doc = await loadPdfForEditing(await pdfFile.arrayBuffer());
  const hadDigitalSignature = detectDigitalSignature(doc);
  const { candidates, imagesFound } = findCandidates(doc);

  let imagesRecompressed = 0;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    onProgress?.(i, candidates.length, "Recompressing images");
    try {
      const scale = Math.min(1, maxLongSide / Math.max(c.width, c.height));
      const target = { width: Math.max(1, Math.round(c.width * scale)), height: Math.max(1, Math.round(c.height * scale)) };
      // An already-small JPEG at the target size gains little from a
      // second lossy pass; skip it to avoid generation loss.
      if (c.filter === "DCTDecode" && scale === 1 && preset.quality >= 0.8) continue;
      const bitmap = await decodeToBitmap(c, target);
      const outW = bitmap.width;
      const outH = bitmap.height;
      const jpeg = await encodeJpeg(bitmap, preset.quality);
      bitmap.close();
      if (jpeg.length >= c.stream.contents.length * 0.92) continue;

      const dict = c.stream.dict.clone(doc.context);
      dict.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));
      dict.delete(PDFName.of("DecodeParms"));
      dict.set(PDFName.of("Width"), PDFNumber.of(outW));
      dict.set(PDFName.of("Height"), PDFNumber.of(outH));
      dict.set(PDFName.of("BitsPerComponent"), PDFNumber.of(8));
      // Canvas always writes 3-channel JPEGs; a gray source becomes RGB.
      if (c.comps === 1) dict.set(PDFName.of("ColorSpace"), PDFName.of("DeviceRGB"));
      doc.context.assign(c.ref, PDFRawStream.of(dict, jpeg));
      imagesRecompressed++;
    } catch (err) {
      // One odd image never fails the whole document; it just stays as-is.
      console.warn("Skipped an image during compression", err);
    }
  }

  if (removeMetadata) {
    doc.setTitle("");
    doc.setAuthor("");
    doc.setSubject("");
    doc.setKeywords([]);
  }
  doc.setProducer(brand.name);

  onProgress?.(candidates.length, candidates.length, "Optimising file structure");
  let bytes = await doc.save({ useObjectStreams: true });
  try {
    bytes = await optimizePdfStructure(bytes);
  } catch (err) {
    console.warn("qpdf optimisation skipped", err);
  }

  const outName = pdfFile.name.replace(/\.pdf$/i, "") + "_compressed.pdf";
  if (bytes.byteLength >= originalBytes) {
    return {
      file: new File([pdfFile], outName, { type: "application/pdf" }),
      originalBytes,
      outputBytes: originalBytes,
      imagesFound,
      imagesRecompressed: 0,
      unchanged: true,
      hadDigitalSignature,
    };
  }
  return {
    file: makePdfFile(bytes, outName),
    originalBytes,
    outputBytes: bytes.byteLength,
    imagesFound,
    imagesRecompressed,
    unchanged: false,
    hadDigitalSignature,
  };
};
