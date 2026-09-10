# Attribution

This project's PDF/image processing logic (`client/src/lib/*`), several UI
components, and the eight tool pages are adapted from
[**iHatePDF**](https://github.com/cu-sanjay/iHatePDF) by Sanjay Choudhary,
used under the MIT License (see `LICENSE`).

What changed from the original:

- Stripped the unused Express/Postgres/Drizzle/Passport server scaffold —
  everything here is a static, client-only build (see the Local PDF Stack
  guide's Path A for why that matters).
- Removed tools outside this build's scope (LaTeX resume, equation-to-image,
  form-based resume builder, standalone image compressor, the "Drop Vault"
  page) to keep the bundle small and the tool list focused.
- Added offline PWA support (`vite-plugin-pwa`), so the whole toolkit installs
  and works with no network connection.
- Replaced hardcoded brand colors with CSS variables (`--brand`,
  `--brand-dark`, `--brand-tint` in `client/src/index.css`) and an `.env`-driven
  name/description, so a sister company can produce its own branded build
  without touching component code.
- Renamed "Lock PDF" to "Protect PDF." Originally this only added a visual
  watermark + metadata strip (no real encryption, matching a disclosure the
  original iHatePDF build also carried in-page). It has since been upgraded
  to add real AES password encryption via qpdf/WASM — see the qpdf-wasm
  section below — with the watermark option removed (redundant with the
  separate Watermark PDF tool) and metadata stripping kept as an
  independent option.

No functional changes were made to the underlying PDF logic itself
(merge/split/compress/watermark/convert/sign) beyond generic string renames.

- Added an "OCR PDF" tool (`client/src/pages/OcrPdf.tsx`,
  `client/src/lib/ocrUtils.ts`) — not present in upstream iHatePDF. Uses
  `tesseract.js`, entirely client-side, with its worker/WASM/language-data
  assets bundled locally under `client/public/tesseract/` instead of
  tesseract.js's default CDN, to keep the "files and text never leave the
  device" guarantee intact.
- Added a "Word to PDF" tool (`client/src/pages/WordToPdf.tsx`,
  `client/src/lib/wordUtils.ts`) — not present in upstream iHatePDF.

## office2pdf (Word to PDF)

The **Word to PDF** tool is powered by a compiled WebAssembly build of
[**office2pdf**](https://github.com/developer0hye/office2pdf), a pure-Rust
OOXML-to-PDF renderer, used under the Apache License 2.0. A copy of that
license's terms applies to the `office2pdf_bg.wasm` binary and its
`wasm-bindgen` JS glue under `client/src/lib/office2pdf-wasm/`, built by
`scripts/build-office2pdf-wasm.sh` — see
<https://github.com/developer0hye/office2pdf/blob/main/LICENSE> for the full
text. No office2pdf source is vendored in this repository; only its build
output is bundled, as a checked-in build artifact like `pdf.worker.min.mjs`
or the OCR engine below. office2pdf uses [Typst](https://github.com/typst/typst)
(also Apache-2.0) internally to lay out and render the PDF.

## qpdf-wasm (Protect PDF)

The **Protect PDF** tool's password encryption is powered by
[**qpdf**](https://github.com/qpdf/qpdf) compiled to WebAssembly via
[**@neslinesli93/qpdf-wasm**](https://github.com/neslinesli93/qpdf-wasm),
used under the ISC License. `client/public/qpdf/qpdf.wasm` is that
package's published build output, used unmodified.
