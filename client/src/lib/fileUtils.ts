
/**
 * Generates a preview URL for a file
 */
export const generateFilePreview = async (file: File): Promise<string> => {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (isPdf) {
    const { renderPdfThumbnail } = await import("./pdfjs");
    return renderPdfThumbnail(file, 1.15);
  }

  return new Promise((resolve, reject) => {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          resolve(e.target.result as string);
        } else {
          reject(new Error('Failed to generate image preview'));
        }
      };
      reader.onerror = () => {
        reject(new Error('Error reading file'));
      };
      reader.readAsDataURL(file);
    } else {
      reject(new Error('Unsupported file type for preview'));
    }
  });
};

/**
 * Creates a file with the specified content and name
 */
export const createFile = (
  content: Blob | string,
  fileName: string,
  type: string
): File => {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  return new File([blob], fileName, { type });
};

/**
 * Downloads a file to the user's device
 */
export const downloadFile = (content: Blob | string, fileName: string, type?: string): void => {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  
  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Builds a minimal, valid .docx (OOXML WordprocessingML) file from plain
 * text — one paragraph per line. Uses jszip (already a dependency) rather
 * than pulling in a dedicated docx library for what is just a text dump.
 */
export const createTextDocx = async (text: string): Promise<Blob> => {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  const escapeXml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const paragraphs = text
    .split("\n")
    .map((line) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`)
    .join("");

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${paragraphs}<w:sectPr/></w:body>
</w:document>`
  );

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
};

/**
 * Formats a file size in bytes to a human-readable string
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Checks if a file is an image
 */
export const isImageFile = (file: File): boolean => {
  return file.type.startsWith('image/');
};

/**
 * Checks if a file is a PDF
 */
export const isPdfFile = (file: File): boolean => {
  return file.type === 'application/pdf';
};

/**
 * Validates a file against size and type constraints
 */
export const validateFile = (
  file: File,
  { maxSizeInMB = 50, acceptedTypes = [] }: { maxSizeInMB?: number; acceptedTypes?: string[] } = {}
): { valid: boolean; error?: string } => {
  // Check file size
  const maxSizeInBytes = maxSizeInMB * 1024 * 1024;
  if (file.size > maxSizeInBytes) {
    return {
      valid: false,
      error: `File size exceeds the maximum limit of ${maxSizeInMB}MB`,
    };
  }

  // Check file type if acceptedTypes is provided
  if (acceptedTypes.length > 0) {
    const fileExtension = `.${file.name.split('.').pop()?.toLowerCase()}`;
    const mimeType = file.type;
    
    const isAcceptedType = acceptedTypes.some((type) => {
      // Check for MIME type pattern
      if (type.includes('/')) {
        if (type.endsWith('/*')) {
          const mainType = type.split('/')[0];
          return mimeType.startsWith(`${mainType}/`);
        }
        return mimeType === type;
      }
      // Check for file extension
      return fileExtension === type;
    });

    if (!isAcceptedType) {
      return {
        valid: false,
        error: `File type not supported. Accepted types: ${acceptedTypes.join(', ')}`,
      };
    }
  }

  return { valid: true };
};
