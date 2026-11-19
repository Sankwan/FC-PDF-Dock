/**
 * The Edit PDF document model. Everything the person adds lives in a list of
 * objects on top of the original pages; the original PDF is only changed when
 * it is saved (see exportPdf.ts).
 *
 * Geometry is in PDF points on the page as it is displayed: origin at the
 * top-left, rotation already applied. That keeps font sizes real (12 means
 * 12 pt) and lets the screen scale everything with CSS.
 */

export type FontFamily = "sans" | "serif" | "mono";

export interface Point { x: number; y: number }

interface Base {
  id: string;
  /** 0-based page index */
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TextObject extends Base {
  kind: "text";
  text: string;
  font: FontFamily;
  /** font size in points */
  size: number;
  bold: boolean;
  italic: boolean;
  color: string;
  /** For edited existing text: the area of the original text that gets painted over. */
  cover?: { x: number; y: number; w: number; h: number };
}

export interface ImageObject extends Base {
  kind: "image";
  /** PNG or JPEG data URL */
  src: string;
  /** Marks the file as signed on save (signing time and change check). */
  signature?: boolean;
}

export interface ShapeObject extends Base {
  kind: "rect" | "ellipse" | "check" | "cross" | "whiteout";
  color: string;
  stroke: number;
}

export interface LineObject extends Base {
  kind: "line" | "arrow";
  /** End points in page points; x/y/w/h is their bounding box. */
  from: Point;
  to: Point;
  color: string;
  stroke: number;
}

export interface InkObject extends Base {
  kind: "ink";
  /** Strokes in page points. */
  strokes: Point[][];
  color: string;
  stroke: number;
  highlighter?: boolean;
}

export interface StampObject extends Base {
  kind: "stamp";
  text: string;
  color: string;
}

export type EditorObject = TextObject | ImageObject | ShapeObject | LineObject | InkObject | StampObject;
export type ObjectKind = EditorObject["kind"];

/** Size of each page as displayed, in points. */
export interface PageSize { width: number; height: number }

export const COLORS = [
  { id: "#111827", label: "Black" },
  { id: "#1d3a8a", label: "Blue" },
  { id: "#b91c1c", label: "Red" },
  { id: "#15803d", label: "Green" },
] as const;

export const STAMPS = ["APPROVED", "RECEIVED", "CERTIFIED TRUE COPY", "CONFIDENTIAL", "PAID", "COPY"];

let seq = 0;
export const newId = () => `o${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Bounding box of a set of points. */
export const boundsOf = (pts: Point[]) => {
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};

/** Moves an object by dx/dy, including any points it carries. */
export const moveObject = <T extends EditorObject>(o: T, dx: number, dy: number): T => {
  const shift = (p: Point) => ({ x: p.x + dx, y: p.y + dy });
  const moved = { ...o, x: o.x + dx, y: o.y + dy };
  if (o.kind === "line" || o.kind === "arrow") return { ...moved, from: shift(o.from), to: shift(o.to) };
  if (o.kind === "ink") return { ...moved, strokes: o.strokes.map((s) => s.map(shift)) };
  if (o.kind === "text" && o.cover) return { ...moved, cover: { ...o.cover, x: o.cover.x + dx, y: o.cover.y + dy } } as T;
  return moved;
};

/** Resizes an object to a new box, scaling any points it carries. */
export const resizeObject = <T extends EditorObject>(o: T, box: { x: number; y: number; w: number; h: number }): T => {
  const sx = o.w ? box.w / o.w : 1, sy = o.h ? box.h / o.h : 1;
  const map = (p: Point) => ({ x: box.x + (p.x - o.x) * sx, y: box.y + (p.y - o.y) * sy });
  const resized = { ...o, ...box };
  if (o.kind === "line" || o.kind === "arrow") return { ...resized, from: map(o.from), to: map(o.to) };
  if (o.kind === "ink") return { ...resized, strokes: o.strokes.map((s) => s.map(map)) };
  return resized;
};
