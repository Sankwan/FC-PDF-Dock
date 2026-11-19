// Puts the Kokoro text-to-speech model (Apache 2.0) where the app serves it,
// so the Read PDF "natural voice" runs on the device without contacting any
// other site (the head-office CSP allows connect-src 'self' only).
//
//   client/public/models/kokoro/   config, tokenizer, onnx/model_quantized.onnx (~92 MB)
//   client/public/models/kokoro/voices/   the voices offered in the reader
//
// Run by the Dockerfile before `npm run build`, or by hand: npm run vendor:kokoro
// If the download fails the app still works; the reader offers device voices only.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "client", "public", "models", "kokoro");
const REPO = "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main";
const FILES = ["config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model_quantized.onnx"];
export const VOICES = ["af_heart", "af_bella", "bf_emma", "bm_george"];

async function get(rel) {
  const dest = path.join(out, rel);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return console.log(`kokoro: have ${rel}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const res = await fetch(`${REPO}/${rel}`);
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  fs.writeFileSync(dest + ".part", Buffer.from(await res.arrayBuffer()));
  fs.renameSync(dest + ".part", dest);
  console.log(`kokoro: downloaded ${rel}`);
}

try {
  for (const f of FILES) await get(f);
  fs.mkdirSync(path.join(out, "voices"), { recursive: true });
  for (const v of VOICES) fs.copyFileSync(path.join(root, "node_modules", "kokoro-js", "voices", `${v}.bin`), path.join(out, "voices", `${v}.bin`));
  console.log("kokoro: ready");
} catch (err) {
  console.warn(`kokoro: skipped (${err.message}). Read PDF will use device voices only.`);
}
