/**
 * Reading aloud, one sentence at a time, with two voices to choose from:
 *
 * - "device": the voices built into the phone or computer (speechSynthesis).
 *   Free, instant, nothing to download. Quality depends on the device.
 * - "natural": Kokoro-82M (Apache 2.0), a neural voice that runs on this
 *   device in a background worker. The model (~92 MB) is served by PDFDock
 *   itself and downloaded once, when someone chooses it.
 *
 * Text never leaves the device with either voice.
 */

export type Engine = "device" | "natural";

export interface NaturalVoice { id: string; label: string }
export const NATURAL_VOICES: NaturalVoice[] = [
  { id: "bf_emma", label: "Emma (British)" },
  { id: "bm_george", label: "George (British)" },
  { id: "af_heart", label: "Heart (American)" },
  { id: "af_bella", label: "Bella (American)" },
];

export const deviceSpeechSupported = () => typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

/** English voices first, Ghanaian/British English before others, then the rest. */
export function deviceVoices(): SpeechSynthesisVoice[] {
  if (!deviceSpeechSupported()) return [];
  const rank = (v: SpeechSynthesisVoice) => {
    const l = v.lang.toLowerCase();
    return l === "en-gh" ? 0 : l === "en-gb" ? 1 : l.startsWith("en-ng") || l.startsWith("en-za") || l.startsWith("en-ke") ? 2 : l.startsWith("en") ? 3 : 9;
  };
  return [...speechSynthesis.getVoices()].sort((a, b) => rank(a) - rank(b) || Number(b.localService) - Number(a.localService) || a.name.localeCompare(b.name));
}

/** Voices load asynchronously on some browsers. */
export function onVoicesChanged(cb: () => void): () => void {
  if (!deviceSpeechSupported()) return () => {};
  speechSynthesis.addEventListener("voiceschanged", cb);
  return () => speechSynthesis.removeEventListener("voiceschanged", cb);
}

/** Speaks one piece of text with a device voice. Resolves when finished or stopped. */
export function speakWithDevice(text: string, opts: { rate: number; voice?: SpeechSynthesisVoice | null }): { done: Promise<"ended" | "stopped">; stop: () => void } {
  let settle: (v: "ended" | "stopped") => void = () => {};
  const done = new Promise<"ended" | "stopped">((r) => (settle = r));
  const u = new SpeechSynthesisUtterance(text);
  u.rate = opts.rate;
  if (opts.voice) { u.voice = opts.voice; u.lang = opts.voice.lang; } else u.lang = "en-GB";
  u.onend = () => settle("ended");
  // "interrupted"/"canceled" come from our own stop(); anything else, move on rather than hang.
  u.onerror = (e) => settle(e.error === "interrupted" || e.error === "canceled" ? "stopped" : "ended");
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
  // Chrome stops a long utterance after ~15 s unless nudged.
  const keepAlive = window.setInterval(() => { if (speechSynthesis.speaking && !speechSynthesis.paused) { speechSynthesis.pause(); speechSynthesis.resume(); } }, 10000);
  done.finally(() => window.clearInterval(keepAlive));
  return { done, stop: () => { speechSynthesis.cancel(); settle("stopped"); } };
}

// ---- Natural voice (Kokoro in a worker) ----

type Pending = { resolve: (a: Float32Array) => void; reject: (e: Error) => void };
let worker: Worker | null = null;
let ready: Promise<void> | null = null;
let seq = 0;
const pending = new Map<number, Pending>();
const progressListeners = new Set<(fraction: number) => void>();

/** Starts loading the natural voice. Safe to call more than once. */
export function loadNaturalVoice(onProgress?: (fraction: number) => void): Promise<void> {
  if (onProgress) progressListeners.add(onProgress);
  if (ready) return ready;
  ready = new Promise<void>((resolve, reject) => {
    worker = new Worker(new URL("./kokoroWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (m.type === "progress") progressListeners.forEach((l) => l(m.fraction));
      else if (m.type === "ready") resolve();
      else if (m.type === "error" && m.id === undefined) { reject(new Error(m.message)); ready = null; worker?.terminate(); worker = null; }
      else if (m.type === "audio") { pending.get(m.id)?.resolve(m.audio); pending.delete(m.id); }
      else if (m.type === "error") { pending.get(m.id)?.reject(new Error(m.message)); pending.delete(m.id); }
    };
    worker.onerror = (e) => { reject(new Error(e.message || "The natural voice couldn't start.")); ready = null; worker = null; };
    worker.postMessage({ type: "load" });
  });
  return ready;
}

export const naturalVoiceLoaded = () => !!worker && !!ready;

/** Makes the audio for one sentence (24 kHz mono samples). */
export async function synthesize(text: string, voice: string, speed: number): Promise<Float32Array> {
  await loadNaturalVoice();
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker!.postMessage({ type: "speak", id, text, voice, speed });
  });
}

let audioCtx: AudioContext | null = null;
/** Must be called from a tap so phones allow sound. */
export function unlockAudio() {
  audioCtx ??= new AudioContext();
  if (audioCtx.state === "suspended") void audioCtx.resume();
}

/** Plays samples. Resolves when finished or stopped. */
export function playSamples(samples: Float32Array, sampleRate = 24000): { done: Promise<"ended" | "stopped">; stop: () => void } {
  unlockAudio();
  const ctx = audioCtx!;
  const buffer = ctx.createBuffer(1, samples.length, sampleRate);
  buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  let settle: (v: "ended" | "stopped") => void = () => {};
  const done = new Promise<"ended" | "stopped">((r) => (settle = r));
  let stopped = false;
  src.onended = () => settle(stopped ? "stopped" : "ended");
  src.start();
  return { done, stop: () => { stopped = true; try { src.stop(); } catch { /* already ended */ } settle("stopped"); } };
}
