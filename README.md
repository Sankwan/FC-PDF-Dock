# PDFDock · Forestry Commission

Document tools for Forestry Commission (Ghana) staff. Every tool except PDF
to Word runs inside the staff member's own browser: files are opened,
changed and saved on their device and never uploaded. It installs as an app
on Windows, Mac, Android and iPhone and keeps working without internet.

Staff sign in with their official `firstname.lastname@fc.gov.gh` address and
a code sent to that mailbox: no passwords, no forms. Only the email address is
kept; the app doesn't record who uses which tool.

**Deploying at head office:** see [`deploy/headoffice/README.md`](deploy/headoffice/README.md).

## Tools

| Group | Tool | Runs on |
|---|---|---|
| Official documents | **Letterhead**: write a letter on the FC letterhead, put the letterhead on an existing PDF, or download a blank letterhead (PDF or Word) | device |
| | **Watermark**: CONFIDENTIAL, DRAFT, CERTIFIED TRUE COPY and other presets | device |
| | **Sign PDF**: draw and place a signature; records the signing time, and **Check a signed PDF** shows whether (and when) it was changed afterwards | device |
| | **Redact PDF**: finds Ghana Card, phone, email, SSNIT and account numbers and names, or draw boxes; removes them permanently and then verifies nothing is left | device |
| | **Protect PDF**: password to open, and/or restrict printing, copying and editing | device |
| Organise | Merge, Split, **Organise pages** (reorder, rotate, delete, duplicate, extract, blank pages) | device |
| | **Compress PDF**: shrinks images only, so text stays selectable and searchable | device |
| Scan & convert | **Scan document**: phone camera scanner with edge detection, straightening, shadow removal, B&W; save or share (WhatsApp, email) | device |
| | Image to PDF, PDF to Image, OCR PDF, Word to PDF | device |
| | PDF to Word | head-office server |

Locked PDFs are detected when added to any tool; the person is asked for the
password (or, for files that only have editing restrictions, asked to
confirm) and the tool receives an unlocked copy.

## Development

```bash
npm install
cp .env.example .env
npm run dev                      # http://localhost:5173

# In a second terminal: the sign-in service (prints codes instead of emailing)
cd services/auth && npm install && cp .env.example .env
# set COOKIE_SECURE=false, MAIL_MODE=console, PUBLIC_URL=http://127.0.0.1:5173 in .env
npm run dev                      # http://127.0.0.1:8100
npm test                         # sign-in service tests
```

Vite proxies `/api/auth` to port 8100 and `/api/pdf2word` to port 8000
(`services/pdf-to-word`, optional; set `DEV_PDF2WORD_API_KEY` to its key).
Set `VITE_AUTH_REQUIRED="false"` in `.env` to work on the tools without
signing in.

`npm run build` produces the static app in `dist/`. `npm run check` runs the
TypeScript checks.

## How the pieces fit

```
client/                 React app (Vite, Tailwind, PWA)
  src/fc/org.ts         FC divisions, letterhead lines, vision statement
  src/lib/              processing engines (all in-browser)
  public/fc, icons      FC logo and app icons (from scripts/build-fc-assets.mjs)
  public/opencv         scanner engine (OpenCV.js), loaded only by Scan
  public/tesseract      OCR engine and English language data
  public/qpdf           encryption / optimisation engine
services/auth           staff sign-in (Node 22+, built-in SQLite, nodemailer)
services/pdf-to-word    PDF to Word (Python, pdf2docx + OCRmyPDF)
deploy/headoffice       Docker Compose + nginx for the head-office server
docs/                   rollout review and planning notes
```

### Branding

Colours are CSS variables at the top of `client/src/index.css` (`--brand`,
`--brand-logo`, `--chrome`). The FC green sampled from the logo is `#44AB4C`;
buttons use a deeper `#2B7D35` so white text meets WCAG AA contrast. App
name and wording come from `.env` (`VITE_APP_NAME`, `VITE_ORG_NAME`, ...).
If FC Corporate Affairs supplies higher-resolution logo artwork, replace
`client/public/fc/fc-logo-src.jpg` and run `npm run assets:fc`.

Division letterhead lines live in `client/src/fc/org.ts`. The Wildlife
Division lines come from a current printed letterhead; the others are
marked `confirmed: false` until each division checks them, and the
Letterhead tool warns staff until then.

## Engines and the decisions behind them

**Compress (keep text).** Images are what make PDFs large, so the engine
(`client/src/lib/compress.ts`) recompresses only image objects: JPEG and
Flate RGB/grey images are decoded with the browser's codecs, downsampled to a
DPI ceiling (220/150/110 by strength), re-encoded as JPEG, and kept only if
smaller. Text, fonts and vector drawings are untouched. qpdf then rewrites the
structure losslessly. Tested: a 1 MB letter with a photo became 400/166/84 KB
with all text still extractable. CMYK, indexed, 1-bit and JPEG 2000 images are
left as they are. The old method (flatten pages to images) remains as an
option with a warning. Alternatives considered: Ghostscript-WASM, MuPDF.js and
BentoPDF's Hyper Compress all preserve text too but are AGPL-licensed.

**Redact.** Pages with redactions are rendered to an image with the black
boxes burned in, so nothing from the original page survives (text, hidden
layers, form values, comments). The remaining text is restored with local OCR
so the page stays searchable, and the finished file is searched for every
redacted string before it's offered for download. In-place text removal
(PDFium/EmbedPDF) was considered but has had residual-text bugs
(embedpdf/embed-pdf-viewer#801), which is unacceptable for this tool.

**Scan document.** OpenCV.js (Apache-2.0): Canny edges + Otsu threshold to
find the largest four-cornered outline, perspective warp, then shadow
removal by dividing out a dilated, median-blurred background. Same approach as
jscanify and most open-source scanners. Sharing uses the system share sheet
(Web Share API) where available.

**Sign PDF change check.** Signing stores the time and a SHA-256 fingerprint of
each page's content in the PDF's document information. Checking recomputes
the fingerprint; if it differs, the file's own modified date says when it
changed. It detects everyday edits; it is not tamper-proof (certificate-based
PAdES signing is the tool for that).

**Letterhead.** Drawn as real PDF text and vector rules with the logo as the
only image, so letters print crisply and stay searchable. The Word version
(built with `docx`) puts the letterhead in the first-page header, like
printed letterhead paper. Note: the in-app Word to PDF engine (office2pdf)
does not draw tables inside Word headers, so for Word letters on the
letterhead, use Word's own "Save as PDF" or the Letterhead tool's PDF output.

**PDF to Word** is the only server-side tool: there is no browser library
that rebuilds editable Word layout from a PDF with real fidelity. See
`services/pdf-to-word/README.md`.

**Word to PDF** uses office2pdf compiled to WebAssembly (~47 MB, downloaded the
first time the tool is used or via "Download tools for offline use"). Complex
documents may render with lower fidelity than Word itself.

## Verifying files never leave the device

- The production security policy (`deploy/headoffice/security-headers.conf`)
  sets `connect-src 'self'`: the browser refuses network requests to any
  other server, whatever the code tries.
- DevTools → Network while using any tool: the only requests go to this
  site's own address (engines under `/tesseract`, `/qpdf`, `/opencv`,
  `/assets`). The app loads no fonts, scripts or analytics from anywhere
  else.
- Airplane mode after installing and downloading the engines: every tool
  except PDF to Word keeps working.

## Licence

MIT (see `LICENSE`). Third-party components and their licences are listed in
`NOTICE.md`.
