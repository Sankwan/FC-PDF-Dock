import { Loader2 } from "lucide-react";
import { useState } from "react";
import ToolHeader from "@/components/ToolHeader";
import FileUpload from "@/components/FileUpload";
import SaveShareButtons from "@/components/SaveShareButtons";
import { qrPixels, readQr } from "@/lib/addons/qr";
import { canvasBlob, imageCanvas } from "@/lib/addons/images";

export default function QrTools() {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState<File | null>(null);
  const [decoded, setDecoded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generate = async () => {
    setBusy(true);
    setError("");
    setResult(null);
    setPreview("");
    try {
      const { pixels, size } = qrPixels(text);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      try {
        canvas
          .getContext("2d")!
          .putImageData(
            new ImageData(new Uint8ClampedArray(pixels), size, size),
            0,
            0,
          );
        setResult(
          new File([await canvasBlob(canvas)], "qrcode.png", {
            type: "image/png",
          }),
        );
        setPreview(canvas.toDataURL("image/png"));
      } finally {
        canvas.width = canvas.height = 0;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create a QR code.");
    } finally {
      setBusy(false);
    }
  };
  const read = async ([file]: File[]) => {
    if (!file) return;
    setBusy(true);
    setError("");
    setDecoded(null);
    let canvas: HTMLCanvasElement | undefined;
    try {
      if (file.size > 20 * 1024 * 1024)
        throw new Error("Choose an image smaller than 20 MB.");
      canvas = await imageCanvas(file);
      const scale = Math.min(1, 2048 / Math.max(canvas.width, canvas.height));
      const sample = document.createElement("canvas");
      sample.width = Math.max(1, Math.round(canvas.width * scale));
      sample.height = Math.max(1, Math.round(canvas.height * scale));
      try {
        const ctx = sample.getContext("2d")!;
        ctx.drawImage(canvas, 0, 0, sample.width, sample.height);
        setDecoded(
          readQr(
            ctx.getImageData(0, 0, sample.width, sample.height).data,
            sample.width,
            sample.height,
          ),
        );
      } finally {
        sample.width = sample.height = 0;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read this image.");
    } finally {
      if (canvas) canvas.width = canvas.height = 0;
      setBusy(false);
    }
  };
  return (
    <section className="min-h-[70vh] bg-background py-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <ToolHeader
          category="Official documents"
          title="QR codes"
          description="Create a QR code or read one from an image, entirely on this device."
        />
        <div className="grid max-w-5xl gap-5 lg:grid-cols-2">
          <div className="space-y-4 rounded-xl border border-border bg-card p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Create a code</h2>
            <label htmlFor="qr-text" className="block text-sm font-medium">
              Text or link
            </label>
            <textarea
              id="qr-text"
              rows={4}
              maxLength={2000}
              disabled={busy}
              className="w-full rounded-md border border-border bg-background p-3 text-sm"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setResult(null);
                setPreview("");
              }}
              placeholder="Enter a document reference, text or URL"
            />
            <p className="text-xs text-muted-foreground">
              Up to 2,000 UTF-8 bytes. Longer text makes a denser code; test it
              at the size you plan to print.
            </p>
            <button
              disabled={busy || !text.trim()}
              onClick={generate}
              className="h-11 rounded-md bg-brand px-5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? <><Loader2 size={16} className="mr-2 inline animate-spin" aria-hidden="true" />Processing…</> : "Create QR code"}
            </button>
            {preview && (
              <img
                src={preview}
                alt="Generated QR code"
                className="mx-auto h-auto w-full max-w-64 border border-border"
              />
            )}
            {result && (
              <SaveShareButtons file={result} saveLabel="Save QR image" />
            )}
          </div>
          <div className="space-y-4 rounded-xl border border-border bg-card p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Read a code</h2>
            {!busy && (
              <FileUpload
                title="Choose a QR image"
                accept=".png,.jpg,.jpeg,.webp,.bmp,.avif,image/png,image/jpeg,image/webp,image/bmp,image/avif"
                maxSizeInMB={20}
                multiple={false}
                onFilesSelected={read}
              />
            )}
            {busy && (
              <p role="status" className="flex items-center gap-2 text-sm">
                <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Processing on this device…
              </p>
            )}
            {decoded !== null && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Decoded content</h3>
                <pre
                  role="status"
                  className="whitespace-pre-wrap break-all rounded-lg bg-muted p-4 text-sm"
                >
                  {decoded}
                </pre>
                <p className="text-xs text-muted-foreground">
                  Links are displayed as text. Review the destination before
                  opening it yourself.
                </p>
                <SaveShareButtons
                  file={
                    new File([decoded], "qr-content.txt", {
                      type: "text/plain",
                    })
                  }
                  saveLabel="Save decoded text"
                />
              </div>
            )}
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
