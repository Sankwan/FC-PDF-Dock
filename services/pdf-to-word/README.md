# PDF-to-Word service

The converter accepts PDFs and returns editable DOCX files. Native PDFs use
pdf2docx layout extraction; scanned PDFs use OCR and produce editable text.
Scanned layout fidelity is limited, as described below.

For the temporary public Railway test, follow
[Railway pilot with PDF-to-Word](../../docs/deployment/railway-pilot.md).
It keeps this service private and puts the API key in the website's Nginx
proxy, never in the client bundle. Use sample documents for cloud testing.

For internal FC rollout, use [deploy/headoffice](../../deploy/headoffice/README.md),
which enforces staff sessions and office-network access. The older direct-browser
Vercel/tunnel notes in DEPLOYMENT.md are historical and are not the current FC
setup. The client calls only same-origin `/api/pdf2word/` routes.

## How it works

Two different strategies depending on what kind of PDF comes in — this
isn't a style choice, it's necessary (see the long comment on
`build_docx_from_ocr_text` in `app/pipeline.py` for the real, verified
failure this avoids):

- **Native/digital PDFs** (real vector text, e.g. exported from Word) go
  through [`pdf2docx`](https://github.com/ArtifexSoftware/pdf2docx), which
  reads text/table/image geometry and reconstructs actual Word paragraphs
  and tables.
- **Scanned/photographed PDFs** are OCR'd with
  [OCRmyPDF](https://github.com/ocrmypdf/OCRmyPDF) (Tesseract), then built
  into a DOCX by hand from the recognized text — deliberately *not* routed
  through pdf2docx, which was found to silently discard OCR'd text and
  emit an uneditable picture instead (see below).

## Quick start

```
cp .env.example .env
# Edit .env: set API_KEY to a real secret — generate with:
openssl rand -hex 32

docker compose up -d --build
curl http://127.0.0.1:8000/health
```

Convert a file:

```
curl -H "X-API-Key: <your API_KEY>" \
  -F "file=@document.pdf" \
  http://127.0.0.1:8000/convert/pdf-to-word \
  -o document.docx
```

## Why pdf2docx alone doesn't work for scanned documents

This was found by actually testing the pipeline against a real image-only
PDF, not assumed: `pdf2docx` treats a scanned page — which visually *is*
just one full-page image, even after OCRmyPDF adds an invisible text layer
on top of it — as a picture block, and embeds it as an image in the DOCX
while silently discarding the invisible OCR text underneath. The result
opens fine and looks correct, but contains **zero real text** — not
searchable, not selectable, not editable, exactly the properties a
"PDF to Word" tool exists to produce.

The fix here: scanned pages skip `pdf2docx` entirely. Their OCR'd text is
extracted directly (grouped into blocks, ordered top-to-bottom) and written
into a DOCX with `python-docx`. This trades away some layout fidelity for
scans (no attempt at reconstructing multi-column flow or tables from a
scanned page) in exchange for the DOCX actually containing the text at
all. Native/digital PDFs still get pdf2docx's full layout/table
reconstruction, which works well.

## Configuration (`.env`)

| Variable | Required | Purpose |
|---|---|---|
| `API_KEY` | Yes | Shared secret clients must send as `X-API-Key`. Compose refuses to start without it. |
| `ALLOWED_ORIGINS` | No | Comma-separated browser origins allowed to call this via CORS. Empty (default) = no browser can call it cross-origin at all. |
| `MAX_UPLOAD_MB` | No (default 50) | Reject uploads bigger than this. |

## Endpoints

- `GET /health` — unauthenticated, for container/orchestrator healthchecks. Returns `{"status": "ok"}`.
- `POST /convert/pdf-to-word` — requires `X-API-Key`. Multipart form field `file` (a `.pdf`). Returns the converted file as `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.

## Known limitations

- Scanned-page output is plain paragraphs of OCR'd text — no attempt at
  reconstructing columns, tables, or original formatting for that case
  (native/digital PDFs don't have this limitation).
- OCR quality depends on scan quality, same as the client-side OCR tool in
  the main app — noisy/skewed/low-DPI scans will have more recognition
  errors.
- `pdf2docx` is no longer actively maintained upstream (still functional,
  MIT-licensed, but don't expect new releases).
