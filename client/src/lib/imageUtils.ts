import { PDFDocument } from "pdf-lib";
import { canvasBlob, imageCanvas } from "./addons/images";

interface ImageToPdfOptions {
  pageSize?: "a4" | "letter" | "legal" | "custom";
  orientation?: "portrait" | "landscape";
  quality?: number;
  customWidth?: number;
  customHeight?: number;
  filename?: string;
}

/** Use the same PDF engine as the other tools; avoid a second PDF/HTML stack. */
export const convertImagesToPdf = async (imageFiles: File[], options: ImageToPdfOptions = {}): Promise<File> => {
  if (!imageFiles.length) throw new Error("Choose at least one image.");
  const { pageSize = "a4", orientation = "portrait", quality = .8, customWidth, customHeight, filename = "images.pdf" } = options;
  if (!Number.isFinite(quality) || quality < .1 || quality > 1) throw new Error("Choose an image quality from 10% to 100%.");
  const sizes = { a4: [210, 297], letter: [215.9, 279.4], legal: [215.9, 355.6] } as const;
  let dimensions: readonly number[];
  if (pageSize === "custom") {
    if (!customWidth || !customHeight || !Number.isFinite(customWidth) || !Number.isFinite(customHeight) || customWidth < 10 || customHeight < 10 || customWidth > 2000 || customHeight > 2000)
      throw new Error("Custom page dimensions must be between 10 and 2,000 mm.");
    dimensions = [customWidth, customHeight];
  } else { dimensions = sizes[pageSize]; }
  const [short, long] = [...dimensions].sort((a, b) => a - b);
  const [pw, ph] = (orientation === "landscape" ? [long, short] : [short, long]).map(mm => mm * 72 / 25.4);
  const doc = await PDFDocument.create();
  for (const file of imageFiles) {
    const canvas = await imageCanvas(file);
    try {
      const ctx = canvas.getContext("2d")!;
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      const blob = await canvasBlob(canvas, quality >= 1 ? "image/png" : "image/jpeg", quality);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const image = quality >= 1 ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const scale = Math.min(pw / image.width, ph / image.height);
      const width = image.width * scale, height = image.height * scale;
      doc.addPage([pw, ph]).drawImage(image, { x: (pw - width) / 2, y: (ph - height) / 2, width, height });
    } finally { canvas.width = canvas.height = 0; }
  }
  return new File([new Uint8Array(await doc.save()).buffer], filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`, { type: "application/pdf" });
};

/**
 * Rotates an image file by a specified angle
 */
export const rotateImage = async (
  imageFile: File,
  angleDegrees: number = 90
): Promise<File> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      if (!event.target?.result) {
        reject(new Error("Failed to read image file"));
        return;
      }
      
      const img = new Image();
      img.src = event.target.result as string;
      
      img.onload = () => {
        // Create canvas for rotation
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        
        if (!ctx) {
          reject(new Error("Could not create canvas context"));
          return;
        }
        
        // Adjust canvas size for rotated image
        if (angleDegrees === 90 || angleDegrees === 270) {
          canvas.width = img.height;
          canvas.height = img.width;
        } else {
          canvas.width = img.width;
          canvas.height = img.height;
        }
        
        // Translate and rotate
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((angleDegrees * Math.PI) / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        
        // Convert canvas to blob
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Failed to create image blob"));
              return;
            }
            
            // Create a new file
            const newFile = new File([blob], imageFile.name, {
              type: imageFile.type,
              lastModified: Date.now(),
            });
            
            resolve(newFile);
          },
          imageFile.type,
          0.95
        );
      };
      
      img.onerror = () => {
        reject(new Error("Error loading image for rotation"));
      };
    };
    
    reader.onerror = () => {
      reject(new Error("Error reading image file for rotation"));
    };
    
    reader.readAsDataURL(imageFile);
  });
};
