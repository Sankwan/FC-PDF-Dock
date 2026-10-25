export const IMAGE_ACCEPT =
  ".jpg,.jpeg,.png,.webp,.avif,.bmp,.gif,.heic,.heif,.tif,.tiff,image/jpeg,image/png,image/webp,image/avif,image/bmp,image/gif,image/heic,image/heif,image/tiff";
export const IMAGE_LIMITS = {
  fileBytes: 20 * 1024 * 1024,
  pixels: 25_000_000,
  totalPixels: 80_000_000,
  pages: 100,
};
export function checkDimensions(width: number, height: number) {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width * height > IMAGE_LIMITS.pixels
  )
    throw new Error("Each image page must be 25 megapixels or smaller.");
}
export async function canvasBlob(
  canvas: HTMLCanvasElement,
  type = "image/png",
  quality = 0.85,
) {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, quality),
  );
  if (!blob || blob.type !== type)
    throw new Error(
      `This browser cannot export ${type.replace("image/", "").toUpperCase()} images.`,
    );
  return blob;
}

export async function imageCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    throw new Error(
      "This browser could not decode this image. Try a JPG or PNG copy.",
    );
  }
  try {
    checkDimensions(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx)
      throw new Error("Image processing is unavailable in this browser.");
    ctx.drawImage(bitmap, 0, 0);
    return canvas;
  } finally {
    bitmap.close();
  }
}

/** Every TIFF/HEIC page becomes an ordinary PNG; no documents leave the device. */
export async function decodeImagePages(
  files: File[],
  onProgress?: (message: string) => void,
): Promise<File[]> {
  if (!files.length || files.length > IMAGE_LIMITS.pages)
    throw new Error("Choose between 1 and 100 image files.");
  let totalPixels = 0;
  const pages: File[] = [];
  const addCanvas = async (canvas: HTMLCanvasElement, name: string) => {
    try {
      checkDimensions(canvas.width, canvas.height);
      totalPixels += canvas.width * canvas.height;
      if (
        totalPixels > IMAGE_LIMITS.totalPixels ||
        pages.length >= IMAGE_LIMITS.pages
      )
        throw new Error(
          "Use fewer images: the selection is limited to 100 pages and 80 megapixels in total.",
        );
      const blob = await canvasBlob(canvas);
      pages.push(new File([blob], name, { type: "image/png" }));
    } finally {
      canvas.width = canvas.height = 0;
    }
  };
  for (const file of files) {
    if (file.size > IMAGE_LIMITS.fileBytes)
      throw new Error(`“${file.name}” exceeds the 20 MB input limit.`);
    const base = file.name.replace(/\.[^.]+$/, "");
    onProgress?.(`Opening ${file.name}…`);
    try {
      if (/\.tiff?$/i.test(file.name) || file.type === "image/tiff") {
        const tiff = await import("utif");
        const bytes = await file.arrayBuffer();
        const frames = tiff.decode(bytes);
        if (!frames.length || frames.length + pages.length > IMAGE_LIMITS.pages)
          throw new Error(
            "TIFF has no readable pages or exceeds the 100-page limit.",
          );
        for (let i = 0; i < frames.length; i++) {
          const frame = frames[i];
          const width = Number((frame.t256 as number[])?.[0]);
          const height = Number((frame.t257 as number[])?.[0]);
          checkDimensions(width, height);
          if (totalPixels + width * height > IMAGE_LIMITS.totalPixels)
            throw new Error("The selection exceeds 80 megapixels in total.");
          tiff.decodeImage(bytes, frame);
          if (!frame.data?.length)
            throw new Error(`TIFF page ${i + 1} could not be decoded.`);
          const rgba = tiff.toRGBA8(frame);
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          canvas
            .getContext("2d")!
            .putImageData(
              new ImageData(new Uint8ClampedArray(rgba), width, height),
              0,
              0,
            );
          await addCanvas(canvas, `${base}_page_${i + 1}.png`);
          frame.data = new Uint8Array();
        }
      } else if (
        /\.hei[cf]$/i.test(file.name) ||
        /image\/hei[cf]/i.test(file.type)
      ) {
        const { default: heic2any } = await import("heic2any");
        const result = await heic2any({
          blob: file,
          toType: "image/png",
          multiple: true,
        });
        const frames = Array.isArray(result) ? result : [result];
        if (frames.length + pages.length > IMAGE_LIMITS.pages)
          throw new Error("The selection exceeds 100 pages.");
        for (let i = 0; i < frames.length; i++)
          await addCanvas(
            await imageCanvas(frames[i]),
            `${base}${frames.length > 1 ? `_page_${i + 1}` : ""}.png`,
          );
      } else {
        await addCanvas(await imageCanvas(file), `${base}.png`);
      }
    } catch (err) {
      throw new Error(
        `Could not open “${file.name}”. ${err instanceof Error ? err.message : "Try a JPG or PNG copy."}`,
      );
    }
  }
  return pages;
}

export async function convertImagePage(
  file: File,
  format: "jpeg" | "png" | "webp",
  quality = 0.85,
) {
  if (!["jpeg", "png", "webp"].includes(format) || quality < 0.1 || quality > 1)
    throw new Error("Invalid image export options.");
  const canvas = await imageCanvas(file);
  try {
    if (format === "jpeg") {
      const ctx = canvas.getContext("2d")!;
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    const blob = await canvasBlob(canvas, `image/${format}`, quality);
    return new File(
      [blob],
      `${file.name.replace(/\.[^.]+$/, "")}.${format === "jpeg" ? "jpg" : format}`,
      { type: blob.type },
    );
  } finally {
    canvas.width = canvas.height = 0;
  }
}
