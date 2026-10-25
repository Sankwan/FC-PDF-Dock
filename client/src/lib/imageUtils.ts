import { jsPDF } from "jspdf";

interface ImageToPdfOptions {
  pageSize?: "a4" | "letter" | "legal" | "custom";
  orientation?: "portrait" | "landscape";
  quality?: number;
  customWidth?: number;
  customHeight?: number;
  filename?: string;
}

/**
 * Converts image files to a PDF
 */
export const convertImagesToPdf = async (
  imageFiles: File[],
  options: ImageToPdfOptions = {}
): Promise<File> => {
  if (imageFiles.length === 0) {
    throw new Error("No image files provided");
  }

  const {
    pageSize = "a4",
    orientation = "portrait",
    quality = 0.8,
    customWidth,
    customHeight,
    filename = "images.pdf",
  } = options;

  // Create a new PDF document
  const doc = new jsPDF({
    orientation,
    unit: "mm",
    format: pageSize === "custom" && customWidth && customHeight
      ? [customWidth, customHeight]
      : pageSize,
  });

  // Get PDF dimensions
  const pdfWidth = doc.internal.pageSize.getWidth();
  const pdfHeight = doc.internal.pageSize.getHeight();

  // Add each image to the PDF
  for (let i = 0; i < imageFiles.length; i++) {
    // Add a new page for each image after the first
    if (i > 0) {
      doc.addPage();
    }

    const imageFile = imageFiles[i];
    const imageURL = await createImageURL(imageFile);

    try {
      await addImageToPdf(doc, imageFile, imageURL, pdfWidth, pdfHeight, quality);
    } catch (error) {
      console.error(`Error adding image ${imageFile.name} to PDF:`, error);
      throw new Error(`Could not add “${imageFile.name}” to the PDF. No partial file was created.`);
    }
  }

  // Save the PDF
  const pdfBlob = doc.output("blob");
  const pdfFilename = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;

  return new File([pdfBlob], pdfFilename, { type: "application/pdf" });
};

/**
 * Creates a URL for an image file
 */
const createImageURL = (imageFile: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result) {
        resolve(reader.result as string);
      } else {
        reject(new Error("Failed to read image file"));
      }
    };
    reader.onerror = () => {
      reject(new Error("Error reading image file"));
    };
    reader.readAsDataURL(imageFile);
  });
};

/**
 * Adds an image to a PDF document, properly scaled
 */
const addImageToPdf = (
  doc: jsPDF,
  imageFile: File,
  imageURL: string,
  pdfWidth: number,
  pdfHeight: number,
  quality: number
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.src = imageURL;

    image.onload = () => {
      try {
        // Calculate image dimensions to fit the page while maintaining aspect ratio
        const imageWidth = image.width;
        const imageHeight = image.height;
        const imageAspectRatio = imageWidth / imageHeight;

        let finalWidth = pdfWidth;
        let finalHeight = pdfWidth / imageAspectRatio;

        // Check if image height exceeds page height
        if (finalHeight > pdfHeight) {
          finalHeight = pdfHeight;
          finalWidth = pdfHeight * imageAspectRatio;
        }

        // Center the image on the page
        const x = (pdfWidth - finalWidth) / 2;
        const y = (pdfHeight - finalHeight) / 2;

        // jsPDF trusts the format label instead of sniffing the bytes —
        // forcing "JPEG" on PNG/WebP source data (the previous behavior)
        // corrupts or rejects the embed. Re-encoding through a canvas
        // (the browser already decoded JPG/PNG/WebP alike to get here)
        // gives jsPDF a format it's guaranteed to handle correctly.
        const canvas = document.createElement("canvas");
        canvas.width = imageWidth;
        canvas.height = imageHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not create canvas context");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, imageWidth, imageHeight);
        ctx.drawImage(image, 0, 0);

        // Every import is normalized to PNG. Apply the quality setting to
        // the actual PDF image rather than inferring it from the source suffix.
        const lossless = quality >= 1;
        const encoded = canvas.toDataURL(lossless ? "image/png" : "image/jpeg", quality);
        doc.addImage(encoded, lossless ? "PNG" : "JPEG", x, y, finalWidth, finalHeight);
        canvas.width = canvas.height = 0;
        resolve();
      } catch (error) {
        reject(error);
      }
    };
    
    image.onerror = () => {
      reject(new Error("Error loading image"));
    };
  });
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
