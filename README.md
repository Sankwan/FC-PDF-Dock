# PDFDock

A privacy-first, fully client-side PDF toolkit — merge, split, compress,
convert, watermark, protect, and sign PDFs, entirely in the browser. No file
is ever uploaded; there is no backend, no account, and no server that could
see what you open. Installs as an offline-capable app on Mac, Windows,
Android, and iOS.

This is "Path A" from *The Local PDF Stack* guide, built by adapting the
open-source [iHatePDF](https://github.com/cu-sanjay/iHatePDF) project (MIT —
see `NOTICE.md` for exactly what changed) rather than writing PDF logic from
scratch.

## Tools included

Merge PDFs · Split PDF · Compress PDF · PDF → Image · Image → PDF ·
Watermark PDF · Protect PDF (real AES password encryption via qpdf/WASM,
plus metadata stripping — see below) · Sign PDF · OCR PDF (make a scanned
PDF searchable — runs a local OCR model in-browser, see below) · Word → PDF
(`.docx`, via [office2pdf](https://github.com/developer0hye/office2pdf)
WASM — see below).

## Quick start

```
npm install
npm run dev       # http://localhost:5173, hot reload
npm run build     # production build -> dist/
npm run preview   # serve the production build locally to test it
```

`npm run build` produces a fully static `dist/` folder — no Node server, no
database. Deploy it anywhere that can serve static files: an internal nginx
box, a company intranet, or literally `python3 -m http.server` from `dist/`
on your own machine. The root `Dockerfile` in this repo builds and serves it
via nginx — see `services/pdf-to-word/DEPLOYMENT.md` for deploying both this
and the PDF-to-Word backend as two Railway services.

## Installing it as an app (all four platforms)

1. Open the deployed URL (or `http://localhost:4173` from `npm run preview`)
   in Chrome, Edge, or Safari.
2. **Mac / Windows:** click the install icon in the address bar → "Install."
   It now opens from the dock/taskbar with no browser chrome.
3. **Android:** Chrome menu → "Add to Home screen" → "Install."
4. **iOS:** Safari → Share → "Add to Home Screen."
5. Turn on airplane mode and reload — everything should still work. If it
   doesn't, the service worker hasn't finished its first cache pass; reload
   once more while online, then try again.

## Rebranding for a sister company

Nothing in the component code needs to change. Two places:

1. **Copy `.env.example` to `.env.<company>`** and fill in `VITE_APP_NAME`,
   `VITE_APP_SHORT_NAME`, `VITE_APP_DESCRIPTION`, and `VITE_THEME_COLOR`.
   Build it with:
   ```
   npm run build -- --mode <company>
   ```
   This produces an independent `dist/` you deploy to that company's own
   subdomain.
2. **Accent color:** edit the three CSS variables at the top of
   `client/src/index.css` — `--brand`, `--brand-dark`, `--brand-tint` (HSL
   triplets). This changes every button, link, and highlight in the app in
   one place. Keep `VITE_THEME_COLOR` in `.env.<company>` matching `--brand`
   so the PWA install icon/status bar matches too.
3. Swap `client/public/icon.svg` for that company's mark if you want a
   different install icon per build.

Repeat step 1 per sister company, each with its own `.env.<name>` and its own
deploy target. There's no shared server, so nothing about one company's
build can affect another's.

## Word to PDF — how the engine is built

The **Word → PDF** tool is powered by a compiled WebAssembly build of
[office2pdf](https://github.com/developer0hye/office2pdf) (Apache-2.0), a
pure-Rust OOXML-to-PDF renderer built on the [Typst](https://github.com/typst/typst)
layout engine — no LibreOffice, no Microsoft Office, no server. The built
`.wasm`/`.js` output already lives in `client/src/lib/office2pdf-wasm/` and
is committed like any other asset — most contributors never need to touch
this. Rebuild it only to pick up a new office2pdf release:

```
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
./scripts/build-office2pdf-wasm.sh          # clones office2pdf, builds the WASM package
```

That script clones office2pdf into a temp directory, runs `wasm-pack build`
against it, and overwrites `client/src/lib/office2pdf-wasm/` with the fresh
output. `wordUtils.ts` already imports from that fixed path, so no other
code changes are needed afterward.

The engine is a real Rust document-layout renderer, not a from-scratch toy —
but it's also not Microsoft Office or LibreOffice, so complex documents
(heavy embedded objects, unusual fields, uncommon fonts) may render with
lower fidelity than opening the file in Word itself. It's also large: the
WASM binary is **~47MB**. To avoid forcing that onto every visitor, it is
*not* precached on install — `vite.config.ts`'s `runtimeCaching` rule
fetches and caches it only the first time someone actually opens the Word
to PDF tool (same idea as the OCR engine below, just a bigger download).

## Protect PDF — real encryption, not a watermark

Earlier versions of this README (and the in-app copy) claimed real PDF
password encryption "can't be done in the browser without a backend." That
was wrong — it was never a browser limitation, just a gap in `pdf-lib`
(used everywhere else in this app), which has never implemented writing
encrypted PDFs. **Protect PDF** now uses
[qpdf](https://github.com/qpdf/qpdf) compiled to WebAssembly
([`@neslinesli93/qpdf-wasm`](https://github.com/neslinesli93/qpdf-wasm),
ISC license) — the same C++ engine many desktop tools rely on for
spec-correct PDF encryption, just running in the browser instead of on a
server. It sets real AES-128 or AES-256 encryption per the PDF standard
security handler; any PDF reader will refuse to open the file without the
password. `client/public/qpdf/qpdf.wasm` (~1.3MB) is served from this
app's own origin and loaded lazily — see `client/src/lib/pdfEncryption.ts`.

Metadata stripping (author/title/producer) is a separate, independent
option in the same tool, implemented with `pdf-lib` as before — you can
use either, both, or neither.

## PDF to Word — the one tool that isn't purely static

There is no good pure-browser/WASM library for PDF → DOCX with real
fidelity. This is a fundamentally harder problem than DOCX → PDF —
reconstructing editable paragraph/table/flow structure from a fixed-layout
format — and nothing in the OSS ecosystem does it well in WASM today. This
isn't a "nobody's gotten to it yet" gap: even
[BentoPDF](https://github.com/alam00000/bentopdf), the most mature
privacy-first, LibreOffice-WASM-powered PDF toolkit in this space
(15k+ stars), only goes Word → PDF, not the reverse.

So **PDF to Word (`client/src/pages/PdfToWord.tsx`) is the one tool here
that calls a server** — `services/pdf-to-word/`, a small self-hosted
Docker service (`pdf2docx` + OCRmyPDF; see that folder's own README for
why, and for why the obvious LibreOffice/Gotenberg route doesn't actually
cover this direction). Every other tool in this app is 100% static and
needs zero infrastructure; this one is the deliberate exception, and the
UI says so.

**Wiring:** set two build-time env vars (see `.env.example`) —
`VITE_PDF2WORD_API_URL` (the service's base URL) and
`VITE_PDF2WORD_API_KEY` (must match `API_KEY` in the service's own
`.env`). Leave both blank and the tool shows a clean "not set up on this
deployment" message instead of a broken one — safe to leave unconfigured
on a build that doesn't need it.

**Deploying both pieces (recommended path — see full runbook in
`services/pdf-to-word/DEPLOYMENT.md`):** run the frontend and the
PDF-to-Word backend as two separate Railway services from this one repo —
the frontend from the root `Dockerfile` (root directory `.`), the backend
from `services/pdf-to-word/Dockerfile` (root directory
`services/pdf-to-word`). Both get their own Railway-generated HTTPS domain,
so there's no mixed-content issue and no third-party host beyond Railway
itself. Set `ALLOWED_ORIGINS` on the backend service to the frontend's
Railway domain, and `VITE_PDF2WORD_API_URL`/`VITE_PDF2WORD_API_KEY` as
**build-time** variables on the frontend service (Railway requires an `ARG`
in the Dockerfile for each one it forwards at build time — already declared
in the root `Dockerfile`).

An older, self-hosted alternative (Cloudflare Tunnel or Tailscale fronting
a home/office-hosted backend, with the frontend on a static host of your
choice) is still documented in `services/pdf-to-word/DEPLOYMENT.md` Part 3,
for anyone who wants zero third-party compute at all.

## Verifying it's actually local-only

Don't just take this README's word for it:

- Open DevTools → Network tab → "Preserve log," run a merge/compress/convert,
  and confirm nothing but the Google Fonts stylesheet (cosmetic only) leaves
  the page.
- Turn on airplane mode after the first load and confirm every tool still
  works.
- Read `client/src/lib/pdfUtils.ts`, `imageUtils.ts`, `pdfjs.ts`, `ocrUtils.ts`,
  `wordUtils.ts`, and `pdfEncryption.ts` — that's the entire processing
  pipeline. There is no `fetch`/`XMLHttpRequest` call to any third party in
  any of them. `OCR PDF`, `Word to PDF`, and `Protect PDF`'s password lock
  do load their worker/WASM/language files over HTTP the first time they
  run, same as the app's own JS bundle — but check the Network tab and
  you'll see those requests go to your own origin (`/tesseract/...`,
  `/assets/office2pdf...`, `/qpdf/...`), not an external CDN.

## Known limitations (by design, for now)

- **PDF → Word needs a server; Word → PDF doesn't.** The reverse direction
  isn't solved client-side — see "PDF to Word" above for why, and how that
  tool is wired to a self-hosted backend when `VITE_PDF2WORD_API_URL` is
  set. Word → PDF itself works fully offline once its ~47MB engine has
  loaded once (see above), same as every other tool except that one.
- **Protect PDF's password is "user + owner" combined.** Locking a PDF sets
  the same password as both the PDF "user" password (needed to open it) and
  "owner" password (needed to bypass print/edit restrictions) — i.e. one
  password gates everything, with no separate "restrict editing but anyone
  can view" mode. That's a deliberate simplicity choice, not a qpdf
  limitation — qpdf supports the full permissions model if a future version
  of this tool needs it.
- **OCR is SIMD-only, no fallback core.** `OCR PDF` runs entirely locally
  via a bundled `tesseract.js` build (worker, WASM core, and English
  language data all served from `client/public/tesseract/` — see that
  folder and `client/src/lib/ocrUtils.ts` — never fetched from tesseract.js's
  default CDN). Only the SIMD WASM core ships, to keep the precache size
  down; SIMD has shipped in every major browser since 2021, so this only
  matters on very old browsers. Only English is bundled — add more
  languages by dropping additional `<lang>.traineddata.gz` files (from the
  `@tesseract.js-data/<lang>` npm packages) into `client/public/tesseract/lang/`.
- **One dead-weight chunk:** `jspdf` ships an internal, unused `html2canvas`
  code path that Rollup bundles even though nothing here calls it (~230KB
  gzipped ~48KB). Harmless, just extra precache size — aliasing it to a stub
  in `vite.config.ts` would remove it if bundle size ever matters.
- **Google Fonts needs one online load.** The stylesheet/font files are
  cached after the first successful fetch (see the `runtimeCaching` rules in
  `vite.config.ts`); self-host the font instead if a build must work before
  ever touching the network once.

## License

MIT — see `LICENSE`. See `NOTICE.md` for what was adapted from the upstream
project and what changed.
