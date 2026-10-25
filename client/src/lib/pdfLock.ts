
export type LockState = "none" | "restrictions" | "password";

const hasEncryptKey = (bytes: Uint8Array) => {
  // Every encrypted PDF names its /Encrypt dictionary in a trailer (or in an
  // xref stream's dictionary, which is never compressed). Checking the first
  // 16KB (linearized files) and last 256KB (normal and incrementally updated
  // files) avoids decoding a whole 100MB file to find it.
  const decoder = new TextDecoder("latin1");
  const head = decoder.decode(bytes.subarray(0, 16 * 1024));
  const tail = decoder.decode(bytes.subarray(Math.max(0, bytes.length - 256 * 1024)));
  return head.includes("/Encrypt") || tail.includes("/Encrypt");
};

/**
 * Tells whether a PDF is encrypted, and if so whether it needs a password to
 * open ("password") or opens freely but carries editing restrictions
 * ("restrictions"). Our tools can't edit either kind until it's decrypted.
 */
export const inspectPdfLock = async (file: File): Promise<LockState> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasEncryptKey(bytes)) return "none";
  const { pdfjs } = await import("./pdfjs");
  const task = pdfjs.getDocument({ data: bytes });
  try {
    await task.promise;
    return "restrictions";
  } catch (err: any) {
    if (err?.name === "PasswordException") return "password";
    // Damaged file: let the tool report it in its own words.
    return "none";
  } finally {
    await task.destroy();
  }
};

export const isPdf = (file: File) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);
