/**
 * qpdf (C++ compiled to WebAssembly) running in the browser: real PDF
 * encryption, decryption and lossless structural optimisation, with no
 * server. pdf-lib (used elsewhere in this app) cannot write encrypted PDFs
 * or recompress streams, so these jobs go through qpdf instead. Served from
 * client/public/qpdf/ (not a CDN), like every other bundled engine here.
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
      .then((mod) =>
        mod.default({
          locateFile: () => "/qpdf/qpdf.wasm",
          // qpdf prints warnings for slightly malformed files it repairs;
          // keep them out of the console unless something actually fails.
          print: () => {},
          printErr: () => {},
        } as any) as unknown as QpdfInstance
      )
      .catch((err) => {
        modulePromise = null;
        throw err;
      });
  }
  return modulePromise;
};

/** Preloads the engine (used by "Download tools for offline use"). */
export const preloadQpdf = () => ensureQpdf().then(() => undefined);

/**
 * Runs qpdf on the given bytes with `args` between the input and output
 * paths. Exit code 3 means "succeeded with warnings" (qpdf repaired
 * something), which is still a usable result.
 */
const runQpdf = async (input: Uint8Array, args: string[], opts: { inputPrefix?: string[] } = {}): Promise<Uint8Array> => {
  const qpdf = await ensureQpdf();
  const jobId = Math.random().toString(36).slice(2, 10);
  const inputPath = `/${jobId}_in.pdf`;
  const outputPath = `/${jobId}_out.pdf`;
  try {
    qpdf.FS.writeFile(inputPath, input);
    let exitCode: number;
    try {
      exitCode = qpdf.callMain([...(opts.inputPrefix ?? []), inputPath, ...args, outputPath]);
    } catch (err) {
      throw new Error(`qpdf failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (exitCode !== 0 && exitCode !== 3) {
      throw new QpdfError(exitCode);
    }
    const out = qpdf.FS.readFile(outputPath);
    const copy = new Uint8Array(out.byteLength);
    copy.set(out);
    return copy;
  } finally {
    try { qpdf.FS.unlink(inputPath); } catch { /* best-effort cleanup */ }
    try { qpdf.FS.unlink(outputPath); } catch { /* best-effort cleanup */ }
  }
};

export class QpdfError extends Error {
  constructor(public exitCode: number) {
    super(exitCode === 2 ? "qpdf could not read this PDF (wrong password, or the file is damaged)." : `qpdf exited with code ${exitCode}.`);
  }
}

const asPdfFile = (bytes: Uint8Array, name: string) => new File([bytes as BlobPart], name, { type: "application/pdf" });
const baseName = (f: File) => f.name.replace(/\.pdf$/i, "");

export type Permission = "print" | "modify" | "copy" | "annotate" | "forms";

export interface ProtectOptions {
  /** Needed to open the file. Leave empty to let anyone open it while still restricting what they can do. */
  openPassword?: string;
  /** Needed to change the restrictions. Required when any restriction is set or when openPassword is set. */
  ownerPassword: string;
  /** What people who open the file are still allowed to do. */
  allow: Permission[];
  keyLength?: "128" | "256";
}

/**
 * Encrypts a PDF. `openPassword` gates opening; the permissions and
 * `ownerPassword` control printing, editing and copying for everyone who
 * opens it. PDF readers honour these flags (Adobe Reader, Edge, Chrome,
 * Preview, Foxit); treat them as a strong deterrent, not a guarantee, since
 * some tools ignore restrictions on a file that opens without a password.
 */
export const protectPdfWithQpdf = async (pdfFile: File, options: ProtectOptions): Promise<File> => {
  const { openPassword = "", ownerPassword, allow, keyLength = "256" } = options;
  if (!ownerPassword.trim()) throw new Error("A permissions password is required.");
  const has = (p: Permission) => allow.includes(p);
  // qpdf's --modify levels are cumulative: annotate includes form filling.
  const modify = has("modify") ? "all" : has("annotate") ? "annotate" : has("forms") ? "form" : "none";
  const restrictions = [
    `--print=${has("print") ? "full" : "none"}`,
    `--modify=${modify}`,
    `--extract=${has("copy") ? "y" : "n"}`,
    // Screen readers may always extract text, as the PDF spec recommends.
    "--accessibility=y",
  ];
  const bytes = new Uint8Array(await pdfFile.arrayBuffer());
  const out = await runQpdf(bytes, ["--encrypt", openPassword, ownerPassword, keyLength, ...restrictions, "--"]);
  return asPdfFile(out, `${baseName(pdfFile)}_protected.pdf`);
};

/** Kept for existing callers: one password that both opens and controls the file. */
export const lockPdfWithPassword = (pdfFile: File, options: { password: string; keyLength?: "128" | "256" }) =>
  protectPdfWithQpdf(pdfFile, {
    openPassword: options.password,
    ownerPassword: options.password,
    allow: ["print", "modify", "copy", "annotate", "forms"],
    keyLength: options.keyLength,
  });

/**
 * Removes encryption. Works with no password for files that only carry
 * editing restrictions (they open without a password), and with the open
 * or owner password otherwise. Throws QpdfError(2) on a wrong password.
 */
export const decryptPdf = async (pdfFile: File, password = ""): Promise<File> => {
  const bytes = new Uint8Array(await pdfFile.arrayBuffer());
  const out = await runQpdf(bytes, ["--decrypt"], { inputPrefix: [`--password=${password}`] });
  return new File([out as BlobPart], pdfFile.name, { type: "application/pdf", lastModified: pdfFile.lastModified });
};

/**
 * Lossless size reduction: rewrites the file with object streams, recompresses
 * every Flate stream at maximum level, drops unreferenced objects and
 * resources. Text, fonts, vectors and images are untouched.
 */
export const optimizePdfStructure = async (bytes: Uint8Array): Promise<Uint8Array> =>
  runQpdf(bytes, [
    "--object-streams=generate",
    "--compress-streams=y",
    "--recompress-flate",
    "--compression-level=9",
    "--remove-unreferenced-resources=yes",
  ]);
