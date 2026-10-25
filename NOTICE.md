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

## Added for the Forestry Commission build

| Component | Used for | Licence |
|---|---|---|
| [OpenCV.js](https://opencv.org) via [@techstark/opencv-js](https://github.com/TechStark/opencv-js) | Scan document: edge detection, perspective correction, filters. `client/public/opencv/opencv.js` is the package's build output, unmodified (`npm run vendor:opencv`). | Apache-2.0 (`client/public/opencv/LICENSE`) |
| [docx](https://github.com/dolanmiu/docx) | Letterhead: Word (.docx) letterhead and letters | MIT |
| [Public Sans](https://public-sans.digital.gov) via [@fontsource-variable/public-sans](https://fontsource.org) | App typeface, self-hosted | SIL Open Font License 1.1 |
| [nodemailer](https://nodemailer.com) | services/auth: sending sign-in codes | MIT-0 |
| [jpeg-js](https://github.com/jpeg-js/jpeg-js), [pngjs](https://github.com/pngjs/pngjs) | Build-time only: generating the FC logo and app icons | BSD-3-Clause, MIT |

Techniques adapted (no code copied): image-only recompression for text-preserving
compression from [drikusroor/compress-pdf](https://github.com/drikusroor/compress-pdf);
document detection approach as in [jscanify](https://github.com/puffinsoft/jscanify).

The Forestry Commission name, logo and letterhead design belong to the
Forestry Commission, Ghana. Their use needs FC approval (Corporate Affairs).
They are not covered by this repository's MIT licence.


## Local document add-ons

| Component | Used for | Published licence |
|---|---|---|
| [node-qrcode](https://github.com/soldair/node-qrcode) | QR module generation | MIT |
| [jsQR](https://github.com/cozmo/jsQR) | QR decoding | Apache-2.0 |
| [UTIF.js](https://github.com/photopea/UTIF.js) | Local multipage TIFF decoding | MIT |
| [heic2any](https://github.com/alexcorvi/heic2any) | Local HEIC/HEIF decoding (bundles a libheif decoder) | MIT for the wrapper |

Copies of the packages' published licence notices are shipped at
`client/public/licenses/addons.txt`. The HEIC bundle also contains upstream
third-party code and its embedded copyright notices, retained in the published
package. No decoder code is modified by PDFDock.
