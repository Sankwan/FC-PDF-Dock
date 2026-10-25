import { Loader2 } from "lucide-react";
import { useState } from "react";
import ToolHeader from "@/components/ToolHeader";
import FileUpload from "@/components/FileUpload";
import SaveShareButtons from "@/components/SaveShareButtons";
import {
  IMAGE_ACCEPT,
  decodeImagePages,
  convertImagePage,
} from "@/lib/addons/images";

export default function ImageConvert() {
  const [pages, setPages] = useState<File[]>([]);
  const [format, setFormat] = useState<"jpeg" | "png" | "webp">("jpeg");
  const [quality, setQuality] = useState(85);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<File | null>(null);
  const open = async (files: File[]) => {
    setError("");
    setResult(null);
    setStatus("Opening images…");
    try {
      setPages(await decodeImagePages(files, setStatus));
    } catch (e) {
      setPages([]);
      setError(e instanceof Error ? e.message : "Could not open these images.");
    } finally {
      setStatus("");
    }
  };
  const convert = async () => {
    setError("");
    setResult(null);
    setStatus("Converting images…");
    try {
      if (pages.length === 1)
        setResult(await convertImagePage(pages[0], format, quality / 100));
      else {
        const { default: JSZip } = await import("jszip");
        const zip = new JSZip();
        for (let i = 0; i < pages.length; i++) {
          setStatus(`Converting image ${i + 1} of ${pages.length}…`);
          const image = await convertImagePage(pages[i], format, quality / 100);
          zip.file(
            `${String(i + 1).padStart(3, "0")}_${image.name}`,
            await image.arrayBuffer(),
          );
        }
        setResult(
          new File(
            [await zip.generateAsync({ type: "blob" })],
            "converted-images.zip",
            { type: "application/zip" },
          ),
        );
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not convert these images.",
      );
    } finally {
      setStatus("");
    }
  };
  return (
    <section className="min-h-[70vh] bg-background py-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <ToolHeader
          category="Scan & convert"
          title="Convert images"
          description="Convert phone photos and image files to JPG, PNG or WebP without uploading them."
        />
        <div className="max-w-2xl space-y-5 rounded-xl border border-border bg-card p-5 sm:p-6">
          {!status && !pages.length && (
            <FileUpload
              title="Choose images"
              accept={IMAGE_ACCEPT}
              maxSizeInMB={20}
              multiple
              onFilesSelected={open}
            />
          )}
          <p className="text-sm text-muted-foreground">
            JPG, PNG, WebP, BMP, GIF, TIFF, HEIC/HEIF and browser-supported
            AVIF. Every TIFF page and HEIC image is included; animated GIFs use
            their first frame. Some newer HEIC codecs may require a JPG export
            from your phone.
          </p>
          {pages.length > 0 && (
            <>
              <div className="flex flex-wrap justify-between gap-3">
                <p className="text-sm font-semibold">
                  {pages.length} image page{pages.length === 1 ? "" : "s"} ready
                </p>
                <button
                  disabled={Boolean(status)}
                  className="text-sm font-semibold text-brand underline"
                  onClick={() => {
                    setPages([]);
                    setResult(null);
                    setError("");
                  }}
                >
                  Choose other images
                </button>
              </div>
              <ul className="max-h-40 space-y-1 overflow-y-auto text-sm text-muted-foreground">
                {pages.map((page, index) => (
                  <li key={index} className="break-all">
                    {index + 1}. {page.name}
                  </li>
                ))}
              </ul>
              <label
                className="block text-sm font-medium"
                htmlFor="image-format"
              >
                Output format
                <select
                  id="image-format"
                  disabled={Boolean(status)}
                  value={format}
                  onChange={(e) => {
                    setFormat(e.target.value as typeof format);
                    setResult(null);
                  }}
                  className="mt-1 block h-11 w-full rounded-md border border-border bg-background px-3"
                >
                  <option value="jpeg">JPG — white background</option>
                  <option value="png">PNG — preserves transparency</option>
                  <option value="webp">WebP — smaller image files</option>
                </select>
              </label>
              {format !== "png" && (
                <label
                  htmlFor="image-quality"
                  className="block text-sm font-medium"
                >
                  Quality: {quality}%
                  <input
                    id="image-quality"
                    type="range"
                    min={10}
                    max={100}
                    value={quality}
                    disabled={Boolean(status)}
                    onChange={(e) => {
                      setQuality(Number(e.target.value));
                      setResult(null);
                    }}
                    className="mt-2 block w-full accent-brand"
                  />
                </label>
              )}
              <button
                disabled={Boolean(status)}
                onClick={convert}
                className="h-11 rounded-md bg-brand px-5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Convert {pages.length === 1 ? "image" : "images"}
              </button>
              {result && (
                <div className="space-y-3 border-t border-border pt-4">
                  <p role="status" className="text-sm">
                    {pages.length > 1
                      ? "All pages are included in a ZIP with unique filenames."
                      : "Converted image ready."}
                  </p>
                  <SaveShareButtons
                    file={result}
                    saveLabel={
                      pages.length > 1 ? "Save converted ZIP" : "Save image"
                    }
                  />
                </div>
              )}
            </>
          )}
          {status && (
            <p role="status" className="flex items-center gap-2 text-sm text-brand">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />{status}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
