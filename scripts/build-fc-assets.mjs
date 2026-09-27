// Generates the Forestry Commission brand assets used by the app from one
// source logo (client/public/fc/fc-logo-src.jpg):
//
//   client/public/fc/fc-logo.png       full logo, background made transparent
//   client/public/fc/fc-mark.png       tree + "FC" only (no wordmark), for small sizes
//   client/public/icons/icon-192.png   PWA icons (white tile)
//   client/public/icons/icon-512.png
//   client/public/icons/maskable-512.png  logo inside the maskable safe zone
//   client/public/icons/apple-touch-icon.png  180x180
//
// Rerun with `npm run assets:fc` if FC Corporate Affairs supplies better
// (higher-resolution) artwork: replace fc-logo-src.jpg and adjust the crop
// boxes below.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pub = path.join(root, "client", "public");
const src = jpeg.decode(fs.readFileSync(path.join(pub, "fc", "fc-logo-src.jpg")), { useTArray: true });

// Crop boxes measured on the 440x375 source (inclusive coordinates).
const FULL = { x0: 16, y0: 98, x1: 421, y1: 283 };
const MARK = { x0: 16, y0: 98, x1: 421, y1: 233 };

const crop = (img, box, pad = 6, padBottom = pad) => {
  const w = box.x1 - box.x0 + 1 + pad * 2;
  const h = box.y1 - box.y0 + 1 + pad + padBottom;
  const out = { width: w, height: h, data: new Uint8Array(w * h * 4) };
  out.data.fill(255);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = box.x0 + x - pad;
      const sy = box.y0 + y - pad;
      if (sx < 0 || sy < 0 || sx >= img.width || sy >= img.height) continue;
      const si = (sy * img.width + sx) * 4;
      const di = (y * w + x) * 4;
      out.data[di] = img.data[si];
      out.data[di + 1] = img.data[si + 1];
      out.data[di + 2] = img.data[si + 2];
      out.data[di + 3] = 255;
    }
  }
  return out;
};

// Turns the JPEG's near-white background transparent with a soft ramp so
// anti-aliased edges don't leave a white halo on tinted surfaces.
const knockOutWhite = (img) => {
  for (let i = 0; i < img.data.length; i += 4) {
    const min = Math.min(img.data[i], img.data[i + 1], img.data[i + 2]);
    if (min >= 245) img.data[i + 3] = 0;
    else if (min >= 215) img.data[i + 3] = Math.round(((245 - min) / 30) * 255);
  }
  return img;
};

// Bilinear resample into a square tile with a white (or transparent) background.
const tile = (img, size, scale, background = [255, 255, 255, 255]) => {
  const out = { width: size, height: size, data: new Uint8Array(size * size * 4) };
  for (let i = 0; i < out.data.length; i += 4) out.data.set(background, i);
  const ratio = Math.min((size * scale) / img.width, (size * scale) / img.height);
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  const ox = Math.round((size - w) / 2);
  const oy = Math.round((size - h) / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const fx = Math.min(img.width - 1.001, (x + 0.5) / ratio - 0.5);
      const fy = Math.min(img.height - 1.001, (y + 0.5) / ratio - 0.5);
      const x0 = Math.max(0, Math.floor(fx));
      const y0 = Math.max(0, Math.floor(fy));
      const tx = fx - x0;
      const ty = fy - y0;
      const di = ((oy + y) * size + (ox + x)) * 4;
      for (let c = 0; c < 4; c++) {
        const p = (xx, yy) => img.data[(yy * img.width + xx) * 4 + c];
        const v =
          p(x0, y0) * (1 - tx) * (1 - ty) +
          p(x0 + 1, y0) * tx * (1 - ty) +
          p(x0, y0 + 1) * (1 - tx) * ty +
          p(x0 + 1, y0 + 1) * tx * ty;
        out.data[di + c] = Math.round(v);
      }
      // Composite over the tile background.
      const a = out.data[di + 3] / 255;
      if (background[3] === 255) {
        for (let c = 0; c < 3; c++) {
          out.data[di + c] = Math.round(out.data[di + c] * a + background[c] * (1 - a));
        }
        out.data[di + 3] = 255;
      }
    }
  }
  return out;
};

const writePng = (img, file) => {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
  console.log("wrote", path.relative(root, file), `${img.width}x${img.height}`);
};

const full = knockOutWhite(crop(src, FULL));
const mark = knockOutWhite(crop(src, MARK, 6, 0));

writePng(full, path.join(pub, "fc", "fc-logo.png"));
writePng(mark, path.join(pub, "fc", "fc-mark.png"));
writePng(tile(full, 192, 0.84), path.join(pub, "icons", "icon-192.png"));
writePng(tile(full, 512, 0.84), path.join(pub, "icons", "icon-512.png"));
writePng(tile(full, 512, 0.62), path.join(pub, "icons", "maskable-512.png"));
writePng(tile(full, 180, 0.84), path.join(pub, "icons", "apple-touch-icon.png"));
writePng(tile(mark, 64, 0.92), path.join(pub, "icons", "favicon-64.png"));
