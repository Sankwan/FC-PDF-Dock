import QRCode from "qrcode";
import jsQR from "jsqr";

export function createQrMatrix(text: string) {
  if (!text.trim()) throw new Error("Enter text or a link first.");
  if (new TextEncoder().encode(text).length > 2000)
    throw new Error(
      "Use 2,000 UTF-8 bytes or fewer so the code stays readable.",
    );
  return QRCode.create(text, { errorCorrectionLevel: "M" }).modules;
}
export function qrPixels(text: string, scale = 8) {
  if (!Number.isInteger(scale) || scale < 2 || scale > 16)
    throw new Error("Invalid QR size.");
  const modules = createQrMatrix(text);
  const size = (modules.size + 8) * scale; // Four-module quiet zone on every side.
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let y = 0; y < modules.size; y++)
    for (let x = 0; x < modules.size; x++) {
      if (!modules.get(y, x)) continue;
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const p = (((y + 4) * scale + dy) * size + (x + 4) * scale + dx) * 4;
          pixels[p] = pixels[p + 1] = pixels[p + 2] = 0;
        }
    }
  return { pixels, size };
}
export function readQr(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
) {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    pixels.length !== width * height * 4
  )
    throw new Error("Invalid QR image data.");
  if (width * height > 25_000_000)
    throw new Error("Use an image smaller than 25 megapixels.");
  const found = jsQR(pixels, width, height, {
    inversionAttempts: "attemptBoth",
  });
  if (!found)
    throw new Error(
      "No QR code found. Try a clear, tightly cropped image with its full border visible.",
    );
  return found.data;
}
