import type { FontFamily, TextObject } from "./types";
import { BASELINE, LINE_HEIGHT } from "./exportPdf";

/**
 * Screen fonts that match the standard PDF fonts used on save (Helvetica,
 * Times, Courier), so what you type lines up with what gets written.
 */
export const CSS_FONT: Record<FontFamily, string> = {
  sans: "Helvetica, Arial, 'Liberation Sans', sans-serif",
  serif: "'Times New Roman', Times, 'Liberation Serif', serif",
  mono: "'Courier New', Courier, 'Liberation Mono', monospace",
};

const cssFont = (o: Pick<TextObject, "font" | "size" | "bold" | "italic">, size = o.size) =>
  `${o.italic ? "italic " : ""}${o.bold ? "bold " : ""}${size}px ${CSS_FONT[o.font]}`;

let ctx: CanvasRenderingContext2D | null = null;

/** Box size (in points) for a text object's current text and style. */
export const measureText = (o: Pick<TextObject, "text" | "font" | "size" | "bold" | "italic">) => {
  ctx ??= document.createElement("canvas").getContext("2d")!;
  ctx.font = cssFont(o);
  const lines = (o.text || " ").split("\n");
  const w = Math.max(...lines.map((l) => ctx!.measureText(l || " ").width));
  return { w: Math.ceil(w + o.size * 0.15), h: lines.length * o.size * LINE_HEIGHT };
};

/** Text with characters the standard PDF fonts lack, drawn as a sharp PNG. */
export const rasterizeText = async (o: TextObject): Promise<Uint8Array> => {
  const scale = 4;
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(o.w * scale));
  c.height = Math.max(1, Math.ceil(o.h * scale));
  const g = c.getContext("2d")!;
  g.scale(scale, scale);
  g.font = cssFont(o);
  g.fillStyle = o.color;
  g.textBaseline = "alphabetic";
  o.text.split("\n").forEach((line, i) => g.fillText(line, 0, o.size * (BASELINE[o.font] + i * LINE_HEIGHT)));
  const blob = await new Promise<Blob>((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error("Could not draw text"))), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
};
