/// <reference lib="webworker" />
/**
 * Runs the Kokoro voice off the main thread so the page stays smooth.
 * Everything loads from this site: the model from /models/kokoro/, ONNX
 * Runtime from /ort/, and the voice files are put in the cache kokoro-js
 * looks in (under the address it would otherwise fetch) from /models/kokoro/voices/.
 */
import { env } from "@huggingface/transformers";
import { KokoroTTS } from "kokoro-js";

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = "/models/";
// Production serves ONNX Runtime from /ort/ (copied by vite.config.ts). The
// dev server won't let modules import files from public/, so use the package.
declare const __ORT_DEV_PATH__: string;
env.backends.onnx.wasm!.wasmPaths = import.meta.env.DEV ? __ORT_DEV_PATH__ : "/ort/";

const VOICES = ["bf_emma", "bm_george", "af_heart", "af_bella"];
const HF_VOICE = (id: string) => `https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/${id}.bin`;

let tts: KokoroTTS | null = null;

async function primeVoices() {
  const cache = await caches.open("kokoro-voices");
  for (const id of VOICES) {
    if (await cache.match(HF_VOICE(id))) continue;
    const res = await fetch(`/models/kokoro/voices/${id}.bin`);
    if (!res.ok) throw new Error(`Voice ${id} is missing from the server.`);
    await cache.put(HF_VOICE(id), new Response(await res.arrayBuffer()));
  }
}

self.onmessage = async (e: MessageEvent) => {
  const m = e.data;
  if (m.type === "load") {
    try {
      await primeVoices();
      const files = new Map<string, { loaded: number; total: number }>();
      tts = await KokoroTTS.from_pretrained("kokoro", {
        dtype: "q8",
        device: "wasm",
        progress_callback: (p: any) => {
          if (p.status !== "progress" || !p.file) return;
          files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
          let loaded = 0, total = 0;
          files.forEach((f) => { loaded += f.loaded; total += f.total; });
          if (total) self.postMessage({ type: "progress", fraction: loaded / total });
        },
      });
      self.postMessage({ type: "ready" });
    } catch (err: any) {
      self.postMessage({ type: "error", message: err?.message ?? String(err) });
    }
    return;
  }
  if (m.type === "speak") {
    try {
      if (!tts) throw new Error("The natural voice isn't loaded.");
      const audio = await tts.generate(m.text, { voice: m.voice, speed: m.speed });
      const samples = audio.audio as Float32Array;
      self.postMessage({ type: "audio", id: m.id, audio: samples }, [samples.buffer]);
    } catch (err: any) {
      self.postMessage({ type: "error", id: m.id, message: err?.message ?? String(err) });
    }
  }
};
