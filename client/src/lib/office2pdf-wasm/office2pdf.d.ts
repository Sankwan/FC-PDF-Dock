/* tslint:disable */
/* eslint-disable */

/**
 * PDF bytes and non-fatal warnings from a WASM conversion.
 */
export class ConversionResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    warningAt(index: number): ConversionWarning | undefined;
    readonly pdf: Uint8Array;
    readonly warningCount: number;
}

/**
 * Structured warning returned by the result-bearing WASM API.
 */
export class ConversionWarning {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly detail: string | undefined;
    readonly element: string | undefined;
    readonly format: string;
    readonly from: string | undefined;
    readonly kind: string;
    readonly message: string;
    readonly reason: string | undefined;
    readonly to: string | undefined;
}

/**
 * Per-instance WASM converter with caller-provided in-memory fonts.
 */
export class Office2PdfConverter {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Remove all caller-registered font buffers from this converter.
     */
    clearFonts(): void;
    /**
     * Remove the configured last-resort family.
     */
    clearLastResortFontFamily(): void;
    convertDocxToPdf(data: Uint8Array): ConversionResult;
    convertPptxToPdf(data: Uint8Array): ConversionResult;
    convertToPdf(data: Uint8Array, format: string): ConversionResult;
    convertXlsxToPdf(data: Uint8Array): ConversionResult;
    constructor();
    /**
     * Register a standalone font or font collection for later conversions.
     */
    registerFont(data: Uint8Array): void;
    /**
     * Set the family appended to every generated font chain.
     */
    setLastResortFontFamily(family: string): void;
}

/**
 * Convert a DOCX document to PDF.
 *
 * `data` is the raw bytes of a `.docx` file.
 *
 * Returns the PDF bytes on success, or throws a JS error string on failure.
 */
export function convertDocxToPdf(data: Uint8Array): Uint8Array;

/**
 * Convert a DOCX with default options and return PDF bytes plus warnings.
 */
export function convertDocxToPdfWithResult(data: Uint8Array): ConversionResult;

/**
 * Convert a PPTX document to PDF.
 *
 * `data` is the raw bytes of a `.pptx` file.
 *
 * Returns the PDF bytes on success, or throws a JS error string on failure.
 */
export function convertPptxToPdf(data: Uint8Array): Uint8Array;

/**
 * Convert a PPTX with default options and return PDF bytes plus warnings.
 */
export function convertPptxToPdfWithResult(data: Uint8Array): ConversionResult;

/**
 * Convert an Office document to PDF.
 *
 * `data` is the raw bytes of the input document (DOCX, PPTX, or XLSX).
 * `format` is one of `"docx"`, `"pptx"`, or `"xlsx"` (case-insensitive).
 *
 * Returns the PDF bytes on success, or throws a JS error string on failure.
 */
export function convertToPdf(data: Uint8Array, format: string): Uint8Array;

/**
 * Convert a document with default options and return PDF bytes plus warnings.
 */
export function convertToPdfWithResult(data: Uint8Array, format: string): ConversionResult;

/**
 * Convert an XLSX document to PDF.
 *
 * `data` is the raw bytes of a `.xlsx` file.
 *
 * Returns the PDF bytes on success, or throws a JS error string on failure.
 */
export function convertXlsxToPdf(data: Uint8Array): Uint8Array;

/**
 * Convert an XLSX with default options and return PDF bytes plus warnings.
 */
export function convertXlsxToPdfWithResult(data: Uint8Array): ConversionResult;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_conversionresult_free: (a: number, b: number) => void;
    readonly __wbg_conversionwarning_free: (a: number, b: number) => void;
    readonly __wbg_office2pdfconverter_free: (a: number, b: number) => void;
    readonly conversionresult_pdf: (a: number) => [number, number];
    readonly conversionresult_warningAt: (a: number, b: number) => number;
    readonly conversionresult_warningCount: (a: number) => number;
    readonly conversionwarning_detail: (a: number) => [number, number];
    readonly conversionwarning_element: (a: number) => [number, number];
    readonly conversionwarning_format: (a: number) => [number, number];
    readonly conversionwarning_from: (a: number) => [number, number];
    readonly conversionwarning_kind: (a: number) => [number, number];
    readonly conversionwarning_message: (a: number) => [number, number];
    readonly conversionwarning_reason: (a: number) => [number, number];
    readonly conversionwarning_to: (a: number) => [number, number];
    readonly convertDocxToPdf: (a: number, b: number) => [number, number, number, number];
    readonly convertDocxToPdfWithResult: (a: number, b: number) => [number, number, number];
    readonly convertPptxToPdf: (a: number, b: number) => [number, number, number, number];
    readonly convertPptxToPdfWithResult: (a: number, b: number) => [number, number, number];
    readonly convertToPdf: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly convertToPdfWithResult: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly convertXlsxToPdf: (a: number, b: number) => [number, number, number, number];
    readonly convertXlsxToPdfWithResult: (a: number, b: number) => [number, number, number];
    readonly office2pdfconverter_clearFonts: (a: number) => void;
    readonly office2pdfconverter_clearLastResortFontFamily: (a: number) => void;
    readonly office2pdfconverter_convertDocxToPdf: (a: number, b: number, c: number) => [number, number, number];
    readonly office2pdfconverter_convertPptxToPdf: (a: number, b: number, c: number) => [number, number, number];
    readonly office2pdfconverter_convertToPdf: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly office2pdfconverter_convertXlsxToPdf: (a: number, b: number, c: number) => [number, number, number];
    readonly office2pdfconverter_new: () => number;
    readonly office2pdfconverter_registerFont: (a: number, b: number, c: number) => [number, number];
    readonly office2pdfconverter_setLastResortFontFamily: (a: number, b: number, c: number) => [number, number];
    readonly qcms_enable_iccv4: () => void;
    readonly qcms_profile_precache_output_transform: (a: number) => void;
    readonly qcms_transform_data_bgra_out_lut: (a: number, b: number, c: number, d: number) => void;
    readonly qcms_transform_data_bgra_out_lut_precache: (a: number, b: number, c: number, d: number) => void;
    readonly qcms_transform_data_rgb_out_lut: (a: number, b: number, c: number, d: number) => void;
    readonly qcms_transform_data_rgb_out_lut_precache: (a: number, b: number, c: number, d: number) => void;
    readonly qcms_transform_data_rgba_out_lut: (a: number, b: number, c: number, d: number) => void;
    readonly qcms_transform_data_rgba_out_lut_precache: (a: number, b: number, c: number, d: number) => void;
    readonly qcms_transform_release: (a: number) => void;
    readonly qcms_profile_is_bogus: (a: number) => number;
    readonly qcms_white_point_sRGB: (a: number) => void;
    readonly lut_inverse_interp16: (a: number, b: number, c: number) => number;
    readonly lut_interp_linear16: (a: number, b: number, c: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
