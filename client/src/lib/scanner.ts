/**
 * Document scanner engine: find the paper in a photo, straighten it, and
 * clean it up, like a phone's notes app or CamScanner.
 *
 * Uses OpenCV.js (Apache-2.0), served from this app's own origin
 * (client/public/opencv/) and loaded only when the Scan tool opens. The
 * detection approach is the standard one (used by jscanify and most
 * open-source scanners): blur, edge-detect, find the largest four-cornered
 * outline, then a perspective transform to flatten it.
 */

// OpenCV.js has no useful TypeScript types; keep `any` contained here.
type CV = any;

let cvPromise: Promise<CV> | null = null;

export const loadOpenCv = (): Promise<CV> => {
  if (cvPromise) return cvPromise;
  cvPromise = new Promise<CV>((resolve, reject) => {
    const w = window as any;
    const timer = window.setTimeout(() => reject(new Error("The scanner took too long to load. Check your connection and retry.")), 60_000);
    const succeed = (cv: CV) => { clearTimeout(timer); resolve(cv); };
    const fail = (error: unknown) => { clearTimeout(timer); reject(error); };
    const finish = async () => {
      try {
        let cv = w.cv;
        if (cv && typeof cv.then === "function") cv = await cv;
        if (!cv?.Mat) await new Promise<void>((r) => (cv.onRuntimeInitialized = () => r()));
        succeed(cv);
      } catch (err) {
        fail(err);
      }
    };
    if (w.cv) {
      finish();
      return;
    }
    const script = document.createElement("script");
    script.src = "/opencv/opencv.js";
    script.async = true;
    script.onload = finish;
    script.onerror = () => {
      cvPromise = null;
      script.remove();
      fail(new Error("The scanner engine couldn't load. Check your connection and try again."));
    };
    document.head.appendChild(script);
  });
  cvPromise = cvPromise.catch(error => { cvPromise = null; throw error; });
  return cvPromise;
};

export interface Pt {
  x: number;
  y: number;
}

/** Corners in the order top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Pt, Pt, Pt, Pt];

export const orderQuad = (pts: Pt[]): Quad => {
  const bySum = [...pts].sort((a, b) => a.x + a.y - (b.x + b.y));
  const byDiff = [...pts].sort((a, b) => a.y - a.x - (b.y - b.x));
  return [bySum[0], byDiff[0], bySum[3], byDiff[3]];
};

export const fullQuad = (w: number, h: number, inset = 0): Quad => [
  { x: w * inset, y: h * inset },
  { x: w * (1 - inset), y: h * inset },
  { x: w * (1 - inset), y: h * (1 - inset) },
  { x: w * inset, y: h * (1 - inset) },
];

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

const polygonArea = (q: Pt[]) => {
  let s = 0;
  for (let i = 0; i < q.length; i++) {
    const a = q[i];
    const b = q[(i + 1) % q.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
};

/**
 * Finds the document's four corners. Works on a downscaled copy for speed
 * and returns points in the source's own pixel coordinates, or null when no
 * convincing page outline is found.
 */
export const detectDocument = (cv: CV, source: HTMLCanvasElement | HTMLVideoElement, maxSide = 480): Quad | null => {
  const sw = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
  const sh = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
  if (!sw || !sh) return null;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const small = document.createElement("canvas");
  small.width = Math.round(sw * scale);
  small.height = Math.round(sh * scale);
  small.getContext("2d")!.drawImage(source, 0, 0, small.width, small.height);

  const src = cv.imread(small);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const thresh = new cv.Mat();
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
  const minArea = small.width * small.height * 0.18;
  let best: Pt[] | null = null;
  let bestArea = 0;

  const consider = (bin: any) => {
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(bin, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const area = cv.contourArea(c);
      if (area > minArea && area > bestArea) {
        const approx = new cv.Mat();
        const hull = new cv.Mat();
        cv.convexHull(c, hull);
        const peri = cv.arcLength(hull, true);
        // Loosen the tolerance until the outline has four corners.
        for (const eps of [0.02, 0.03, 0.045, 0.06]) {
          cv.approxPolyDP(hull, approx, eps * peri, true);
          if (approx.rows === 4) break;
        }
        if (approx.rows === 4 && cv.isContourConvex(approx)) {
          const pts: Pt[] = [];
          for (let k = 0; k < 4; k++) pts.push({ x: approx.data32S[k * 2], y: approx.data32S[k * 2 + 1] });
          const a = polygonArea(pts);
          if (a > bestArea) {
            best = pts;
            bestArea = a;
          }
        }
        approx.delete();
        hull.delete();
      }
      c.delete();
    }
    contours.delete();
    hierarchy.delete();
  };

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    // Pass 1: edges (works on most backgrounds).
    cv.Canny(blurred, edges, 50, 150);
    cv.dilate(edges, edges, kernel);
    consider(edges);
    // Pass 2: bright paper on a darker surface (works when edges are faint).
    cv.threshold(blurred, thresh, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    cv.morphologyEx(thresh, thresh, cv.MORPH_CLOSE, kernel);
    consider(thresh);
  } finally {
    [src, gray, blurred, edges, thresh, kernel].forEach((m) => m.delete());
  }
  if (!best) return null;
  return orderQuad((best as Pt[]).map((p) => ({ x: p.x / scale, y: p.y / scale })));
};

/** Longest side of a straightened page, in pixels (about 250dpi on A4). */
const MAX_OUTPUT_SIDE = 2900;

/** Cuts the quad out of the image and straightens it into a rectangle. */
export const warpDocument = (cv: CV, image: HTMLCanvasElement, quad: Quad): HTMLCanvasElement => {
  const [tl, tr, br, bl] = quad;
  let w = Math.max(dist(tl, tr), dist(bl, br));
  let h = Math.max(dist(tl, bl), dist(tr, br));
  const s = Math.min(1, MAX_OUTPUT_SIDE / Math.max(w, h));
  w = Math.max(1, Math.round(w * s));
  h = Math.max(1, Math.round(h * s));

  const src = cv.imread(image);
  const dst = new cv.Mat();
  const from = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
  const to = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, w, 0, w, h, 0, h]);
  const m = cv.getPerspectiveTransform(from, to);
  try {
    cv.warpPerspective(src, dst, m, new cv.Size(w, h), cv.INTER_CUBIC, cv.BORDER_REPLICATE, new cv.Scalar());
    const out = document.createElement("canvas");
    cv.imshow(out, dst);
    return out;
  } finally {
    [src, dst, from, to, m].forEach((x) => x.delete());
  }
};

export type ScanFilter = "enhanced" | "original" | "grayscale" | "bw";

export const FILTERS: { id: ScanFilter; label: string }[] = [
  { id: "enhanced", label: "Auto" },
  { id: "original", label: "Original" },
  { id: "grayscale", label: "Grey" },
  { id: "bw", label: "B&W" },
];

/**
 * Evens out lighting: estimates the paper's background (the page with text
 * removed, by dilating and median-blurring) and divides it out, which
 * removes shadows and makes the paper white while keeping ink dark.
 */
const flattenLighting = (cv: CV, channel: any, out: any, k: number) => {
  const bg = new cv.Mat();
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(7, 7));
  try {
    cv.dilate(channel, bg, kernel);
    cv.medianBlur(bg, bg, k);
    cv.divide(channel, bg, out, 255);
  } finally {
    bg.delete();
    kernel.delete();
  }
};

export const applyFilter = (cv: CV, input: HTMLCanvasElement, filter: ScanFilter): HTMLCanvasElement => {
  if (filter === "original") return input;
  const src = cv.imread(input);
  // Background blur size scales with the image; it must be odd.
  const k = Math.min(99, Math.max(21, Math.round(Math.min(input.width, input.height) / 40) | 1));
  const out = new cv.Mat();
  try {
    if (filter === "enhanced") {
      const rgb = new cv.Mat();
      cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
      const planes = new cv.MatVector();
      cv.split(rgb, planes);
      const merged = new cv.MatVector();
      for (let i = 0; i < 3; i++) {
        const p = planes.get(i);
        const f = new cv.Mat();
        flattenLighting(cv, p, f, k);
        // Stretch contrast a little so ink stays strong after flattening.
        f.convertTo(f, -1, 1.12, -18);
        merged.push_back(f);
        p.delete();
        f.delete();
      }
      cv.merge(merged, out);
      rgb.delete();
      planes.delete();
      merged.delete();
    } else {
      const gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      if (filter === "grayscale") {
        flattenLighting(cv, gray, out, k);
        out.convertTo(out, -1, 1.1, -12);
      } else {
        const flat = new cv.Mat();
        flattenLighting(cv, gray, flat, k);
        const block = Math.max(15, (Math.round(Math.min(input.width, input.height) / 60) | 1));
        cv.adaptiveThreshold(flat, out, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, block, 10);
        flat.delete();
      }
      gray.delete();
    }
    const canvas = document.createElement("canvas");
    cv.imshow(canvas, out);
    return canvas;
  } finally {
    src.delete();
    out.delete();
  }
};

/** Rotates a canvas by a multiple of 90 degrees. */
export const rotateCanvas = (input: HTMLCanvasElement, degrees: number): HTMLCanvasElement => {
  const d = ((degrees % 360) + 360) % 360;
  if (!d) return input;
  const out = document.createElement("canvas");
  const swap = d === 90 || d === 270;
  out.width = swap ? input.height : input.width;
  out.height = swap ? input.width : input.height;
  const ctx = out.getContext("2d")!;
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((d * Math.PI) / 180);
  ctx.drawImage(input, -input.width / 2, -input.height / 2);
  return out;
};

/** Loads an image file into a canvas, capped in size, respecting EXIF orientation. */
export const fileToCanvas = async (file: Blob, maxSide = 4000): Promise<HTMLCanvasElement> => {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  const s = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bitmap.width * s);
  c.height = Math.round(bitmap.height * s);
  c.getContext("2d")!.drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close();
  return c;
};

export const canvasToBlob = (c: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Image encoding failed"))), type, quality));
