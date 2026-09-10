/**
 * Real PDF password encryption — genuinely client-side, no server.
 *
 * pdf-lib (used everywhere else in this app) does not support writing
 * encrypted PDFs; that's a long-standing, explicitly-unimplemented gap in
 * the library, not something specific to browsers. This uses qpdf compiled
 * to WebAssembly instead — qpdf is the same battle-tested C++ engine many
 * desktop tools rely on for spec-correct PDF encryption, just running in
 * the browser instead of on a server. Served from client/public/qpdf/ (not
 * a CDN), same "never leaves the device" rule as every other bundled
 * engine in this app.
 */

interface QpdfFS {
  writeFile: (path: string, data: Uint8Array) => void;
  readFile: (path: string) => Uint8Array;
  unlink: (path: string) => void;
}

interface QpdfInstance {
  callMain: (args: string[]) => number;
  FS: QpdfFS;
}

let modulePromise: Promise<QpdfInstance> | null = null;

const ensureQpdf = (): Promise<QpdfInstance> => {
  if (!modulePromise) {
    modulePromise = import("@neslinesli93/qpdf-wasm")
      .then((mod) => mod.default({ locateFile: () => "/qpdf/qpdf.wasm" }) as unknown as QpdfInstance)
      .catch((err) => {
        modulePromise = null;
        throw err;
      });
  }
  return modulePromise;
};

export interface LockPdfOptions {
  password: string;
  /** 128-bit (RC4/AES) opens in any PDF reader from the last ~20 years.
   *  256-bit (AES) is stronger and fine for any reader from the last
   *  decade. Defaults to 256. */
  keyLength?: "128" | "256";
}

/**
 * Encrypts a PDF so it cannot be opened without the given password. The
 * same password is used as both the PDF "user" and "owner" password —
 * i.e. one password gates everything, rather than a separate password
 * that only restricts printing/editing while leaving the file openable.
 */
export const lockPdfWithPassword = async (pdfFile: File, options: LockPdfOptions): Promise<File> => {
  const { password, keyLength = "256" } = options;
  if (!password.trim()) throw new Error("A password is required.");

  const qpdf = await ensureQpdf();
  const bytes = new Uint8Array(await pdfFile.arrayBuffer());

  const jobId = Math.random().toString(36).slice(2, 10);
  const inputPath = `/${jobId}_input.pdf`;
  const outputPath = `/${jobId}_output.pdf`;

  try {
    qpdf.FS.writeFile(inputPath, bytes);

    let exitCode: number;
    try {
      exitCode = qpdf.callMain([
        inputPath,
        "--encrypt", password, password, keyLength,
        "--",
        outputPath,
      ]);
    } catch (err) {
      throw new Error(`qpdf failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (exitCode !== 0) {
      throw new Error(`qpdf exited with code ${exitCode} — the PDF may be malformed.`);
    }

    const outBytes = qpdf.FS.readFile(outputPath);
    const copy = new Uint8Array(outBytes.byteLength);
    copy.set(outBytes);
    return new File(
      [copy],
      pdfFile.name.replace(/\.pdf$/i, "") + "_locked.pdf",
      { type: "application/pdf" }
    );
  } finally {
    try { qpdf.FS.unlink(inputPath); } catch { /* best-effort cleanup */ }
    try { qpdf.FS.unlink(outputPath); } catch { /* best-effort cleanup */ }
  }
};
