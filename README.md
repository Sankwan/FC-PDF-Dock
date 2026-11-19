# PDFDock · Forestry Commission

Document tools for Forestry Commission (Ghana) staff. Every tool except PDF
to Word runs inside the staff member's own browser: files are opened,
changed and saved on their device and never uploaded. It installs as an app
on supported Windows, Mac, Android and iPhone browsers. Local tools work offline after their required assets have been downloaded.

Staff sign in with their official `firstname.lastname@fc.gov.gh` address and
a code sent to that mailbox: no passwords, no forms. Only the email address is
kept for the account; the app does not record a tool-use history. The scanner stores a draft locally for recovery. Clear it when finished on shared devices; drafts older than 24 hours are removed when the scanner next opens.

**Deploying at head office:** see [`deploy/headoffice/README.md`](deploy/headoffice/README.md).

## Tools

| Group | Tool | Runs on |
|---|---|---|
| Official documents | **Letterhead**: write a letter on the FC letterhead, put the letterhead on an existing PDF, or download a blank letterhead (PDF or Word) | device |
| | **Watermark**: CONFIDENTIAL, DRAFT, CERTIFIED TRUE COPY and other presets; diagonal, straight or tiled; five colours; live preview of the real output | device |
| | **Headers & footers**: left/centre/right text at the top and bottom with page number, total pages, date and file name; reference numbers (start at any number, 0001 style); skip or don't count a cover page; warns when it would print over the page's own text; live preview | device |
| | **Compare PDFs**: word-by-word changes between two versions, highlighted on both pages, number and "not" changes flagged; save highlighted copies | device |
| | **Edit PDF**: tap existing text to retype it (the original is painted over), add text, signatures, ticks, crosses, dates, stamps, shapes, pen and highlighter; undo/redo; unfinished work is kept on the device for 24 hours | device |
| | **Sign PDF**: draw, type or photograph a signature (paper removed automatically) and place it; it snaps to a "Signature:" line when there is one; records the signing time, and **Check a signed PDF** shows whether the pages or the recorded time were changed afterwards (an everyday change check, not proof of who signed) | device |
| | **Redact PDF**: finds Ghana Card, phone, email, SSNIT and account numbers and names, or draw boxes; removes them permanently and then verifies nothing is left | device |
| | **QR codes**: create PNG codes or read their text from an image | device |
| | **Protect PDF**: password to open, and/or restrict printing, copying and editing | device |
| Organise | **Merge** (page count per file; arrange individual pages in Organise before merging), **Organise pages** (reorder, rotate, delete, duplicate, extract, blank pages) | device |
| | **Split PDF**: tap pages to pick them, type ranges ("1-3, 7, 12-"), every N pages, or by file size; lists the files it will make first; save all as one ZIP | device |
| | **Crop & resize**: trim white margins automatically (handles scans) or by dragging the edges, each page or one size for all; optionally remove the cut-off part for good; put every page on A4, A5, A3, Letter or Legal, or 2/4 pages per sheet | device |
| | **Compress PDF**: shrinks images only, so text stays selectable and searchable; choose a strength or a target size ("under 1 MB"), with an honest message when the target can't be met | device |
| | **Add page numbers**: six positions, "1", "Page 1", "1 of 9" styles, skip a cover page | device |
| | **Repair PDF**: rebuilds damaged files (qpdf, then pdf-lib); last resort keeps each readable page as an image | device |
| Scan & convert | **Scan document**: phone camera scanner with edge detection, straightening, shadow removal, B&W; save or share (WhatsApp, email) | device |
| | **Convert images**: HEIC/HEIF, multipage TIFF, BMP and browser-supported images to JPG/PNG/WebP; multiple outputs as ZIP | device |
| | Image to PDF (including all TIFF/HEIC pages), PDF to Image, OCR PDF, Word, PowerPoint and Excel to PDF (.docx/.pptx/.xlsx) | device |
| | PDF to Word | browser: editable text / page images, local English OCR |
| | **PDF to Excel**: tables to .xlsx (a sheet per table or one sheet), joins tables that run over a page break; numbers, GH₵ amounts and dates as real values, IDs and phone numbers kept as text; flags totals that don't add up; fix columns/rows or draw a box around a missed table; CSV too | device |

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
# set NODE_ENV=development, COOKIE_SECURE=false, MAIL_MODE=console,
# PUBLIC_URL=http://localhost:5173, DEMO_EMAIL=demo.user@fc.gov.gh, and
# DEMO_CODE=<your six-digit test code> in .env
npm run dev                      # http://127.0.0.1:8100
npm test                         # sign-in service tests
```

Vite proxies `/api/auth` to port 8100 and `/api/pdf2word` to port 8000
(`services/pdf-to-word`, optional; set `DEV_PDF2WORD_API_KEY` to its key).
Set `VITE_AUTH_REQUIRED="false"` in `.env` to work on the tools without
signing in.

`npm run build` produces the static app in `dist/`. `npm run check` runs the
TypeScript checks. `npm test` runs document-property, form and QR regression tests.

## Railway test deployment

### Recommended: public pilot without an email server

For people to test the browser tools behind a demo entry screen, deploy just
the root website service with these Railway **build variables**:

```text
VITE_AUTH_REQUIRED=true
VITE_DEMO_MODE=true
VITE_PDF2WORD_ENABLED=false
```

Rebuild/redeploy after changing them. The sign-in page displays the public
demo details: email `demo@pdfdock.test`, code `246810`. “Fill demo details”
fills both fields; “Open the tools” enters the pilot. No auth service, SMTP
or database is needed for this mode. “Leave demo” ends the tab's session.

Demo access is deliberately public, not an access-control mechanism. It is
stored separately in sessionStorage, never as a verified staff profile, and
creates no backend cookie. A banner identifies demo sessions. PDF to Word runs on the device in both demo and staff builds. Use sample
documents during the public pilot. Cached scanner drafts still follow the scanner's disclosed retention.

For internal rollout, set `VITE_DEMO_MODE=false`, keep `VITE_AUTH_REQUIRED=true`,
rebuild, and configure the real auth service as documented in
`deploy/headoffice/`. Demo mode defaults to false in code and Docker builds.

### PDF-to-Word in the public pilot

The frontend now converts on-device. Rebuild and deploy the frontend; no
converter service, conversion API key or enabling flag is needed. Existing
`PDF2WORD_PUBLIC_PILOT` and `VITE_PDF2WORD_ENABLED` settings are unnecessary for
this UI. The legacy service/proxy remains optional for older deployments.
OCR for scanned pages needs the local OCR engine to have loaded or been
prepared through the app menu before going offline.

### Optional: test the real sign-in service

For a test deployment without FC email configured, deploy two services from
this repository in the same Railway project and environment:

1. Create the frontend service from the repository root. Railway uses the
   root `Dockerfile`. Set `VITE_AUTH_REQUIRED=true`,
   `VITE_PDF2WORD_ENABLED=false`, and `AUTH_SERVICE_URL` to
   `http://<auth-service-name>.railway.internal:8100` (for example,
   `http://pdfdock-auth.railway.internal:8100`). Generate a Railway domain
   for the frontend.
2. Create an auth service from the same repository with its root directory
   set to `/services/auth`. Do not generate a public domain for this service.
   Mount a Railway volume at `/app/data` to persist its SQLite database.
3. Set these variables on the auth service:
   ```text
   NODE_ENV=development
   AUTH_SECRET=<a random secret of at least 32 characters>
   PUBLIC_URL=https://<your-frontend-domain>
   STAFF_EMAIL_DOMAIN=fc.gov.gh
   PORT=8100
   HOST=::
   MAIL_MODE=console
   DEMO_EMAIL=demo.user@fc.gov.gh
   DEMO_CODE=<your chosen six-digit test code>
   COOKIE_SECURE=true
   ```
   Replace the email and code with your test values. `DEMO_CODE` must be set;
   setting only `DEMO_EMAIL` does not enable demo sign-in. `MAIL_MODE=console`
   prevents email delivery; for the demo address, the fixed code is accepted
   and is also reported in the auth service logs.
4. Deploy the auth service, then the frontend. Open the frontend's Railway
   domain, request a code for the configured demo email, and enter the
   configured code. If you change frontend build variables, redeploy the
   frontend so Vite rebuilds the app.

The demo login is deliberately disabled when `NODE_ENV=production`; the
auth Dockerfile sets that default, so override it as shown only in a
disposable test environment. Never use a fixed demo code for staff accounts
or a production deployment. The frontend Railway domain is publicly
reachable unless you separately restrict access. PDF to Word is disabled in
this test setup; production PDF to Word should use the head-office deployment
described in [`deploy/headoffice/README.md`](deploy/headoffice/README.md).

### Railway: `host not found in upstream "auth"`

The image defaults to `AUTH_SERVICE_URL=http://auth:8100` for Docker networks.
Railway does not start the head-office Compose services automatically. Create
the auth service as above, then set the **frontend** variable to its actual
private hostname, for example `AUTH_SERVICE_URL=http://pdfdock-auth.railway.internal:8100`.
Use the name shown in that auth service's Networking settings, not the example
name unless it matches. Both services must be in the same project/environment.
The auth `PORT=8100` must match the port in this URL; `HOST=::` supports Railway's
IPv6 private networking as well as IPv4.

Nginx resolves the auth hostname per request using the container's DNS and
refreshes it after backend redeploys. A missing backend returns an API error
instead of crashing the frontend. Verify `/api/auth/health` on the frontend
domain returns `{"status":"ok"}` before testing sign-in. A working homepage
alone does not prove authentication is configured.

Run `npm run test:deployment` with Docker running to exercise Nginx startup
without auth, followed by backend recovery and API request forwarding. The
quality workflow runs this check alongside the app build.

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

**PDF to Word** now uses an independent browser converter built with PDF.js
and docx. Editable mode reconstructs paragraphs, headings and simple numeric
tables; page-image mode preserves appearance without editable text. Scans use
the existing local English Tesseract engine. Complex layouts, fonts, pictures
and reading order may need manual correction. The old optional Python service
remains in the repository but is not called by this frontend. No converter
server, URL, key or `VITE_PDF2WORD_ENABLED` flag is required. Prepare OCR assets
before working offline. Staff authentication still uses its own service.

**Tool discovery.** Search from the header (Ctrl/Command+K) or the tools page.
Most-used shortcuts count tool openings, not
completed conversions. Preferences are scoped to the signed-in profile on
this browser; no document names, contents or timestamps are recorded. Use
Clear usage to reset counts. Storage
failures fall back to the current session.

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


## Local add-ons from the v2 review

The add-ons keep the existing FC interface and authentication gate. They do not
introduce an upload API, document database, external AI calls or a server queue.

- QR tools generate and read QR codes, not general 1D barcodes. Decoded links are
  displayed as text and are never opened automatically. Input text is limited to
  2,000 UTF-8 bytes; scan the actual printed code before circulation.
- Image conversion and Image to PDF decode files on the device. TIFF pages and
  HEIC images are expanded in file order; GIFs use their first frame. AVIF relies
  on the browser's decoder. Some newer HEIC encodings may require export to JPG
  from the phone. Export formats are JPG, PNG and browser-supported WebP.
- Image selections are limited to 20 MiB per input, 25 megapixels per decoded
  page, 100 pages and 80 megapixels in total. Multiple converted images get
  numbered ZIP filenames so duplicate input names cannot overwrite each other.
- TIFF and HEIC decoders load as separate local chunks and are included in the
  installed PWA cache. Neither requires a CDN. Install/update the app online
  before expecting new tools to work offline.

