/**
 * Sharing a finished file straight from the device (WhatsApp, Outlook,
 * Teams, Gmail, AirDrop...) through the system share sheet, the same one
 * the phone's own apps use. The file goes directly from this device to the
 * app the person picks; PDFDock never sees where it goes.
 *
 * Supported: Android Chrome/Edge, iPhone/iPad Safari (iOS 15+), Windows
 * Chrome/Edge, macOS Safari. Elsewhere we fall back to a normal download.
 */
export const canShareFiles = (file?: File): boolean => {
  if (typeof navigator === "undefined" || !navigator.canShare || !navigator.share) return false;
  const probe = file ?? new File([new Uint8Array([37, 80, 68, 70])], "probe.pdf", { type: "application/pdf" });
  try {
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
};

/** Returns "shared", "cancelled" (the person closed the sheet) or "unsupported". */
export const shareFile = async (file: File, title?: string): Promise<"shared" | "cancelled" | "unsupported"> => {
  if (!canShareFiles(file)) return "unsupported";
  try {
    await navigator.share({ files: [file], title: title ?? file.name });
    return "shared";
  } catch (err: any) {
    if (err?.name === "AbortError") return "cancelled";
    throw err;
  }
};
