# pdf-to-word service

A small, self-hosted API that does what the rest of the Local PDF Toolkit
deliberately doesn't: run on a server. Converts PDF → DOCX, the one
direction nobody's solved client-side (see the main project's `README.md`
"PDF to Word" section for why). Runs entirely inside a Docker container —
nobody needs Python, Tesseract, Ghostscript, or anything else installed on
their own machine.

**Status: head-office-only, for testing.** Bound to `127.0.0.1` by default
in `docker-compose.yml` — not reachable from any other machine, not even
over Tailscale, until you deliberately change that. Work through
`SECURITY.md` before doing so.

**→ See [`DEPLOYMENT.md`](./DEPLOYMENT.md)** for a full breakdown of how
the conversion pipeline works end to end, plus the step-by-step Cloudflare
Tunnel runbook for making this reachable by a Vercel-hosted frontend.

## Exposing this for a deployed frontend (e.g. Vercel)

The frontend (`client/src/lib/pdfToWordApi.ts`, `VITE_PDF2WORD_API_URL`)
calls this service directly from the visitor's browser — there's no proxy
in between, because Vercel's serverless functions hard-cap request bodies
at 4.5MB (can't be raised at any plan tier) and real PDFs routinely exceed
that. Two consequences:

1. **This service must be served over real HTTPS**, not just "reachable."
   A Vercel-hosted (HTTPS) page cannot call a plain `http://` address —
   browsers block it as mixed content, silently, with no error a normal
   user would understand.
2. **`ALLOWED_ORIGINS` must list the actual deployed frontend origin**
   (e.g. `https://your-app.vercel.app`), or the browser's CORS check
   blocks the call before it ever reaches `require_api_key`.

Two ways to get real HTTPS in front of `127.0.0.1:8000` without touching
the loopback-only bind above until you're ready:

- **Cloudflare Tunnel** — `cloudflared tunnel --url http://localhost:8000`
  (or a named, persistent tunnel) gives a public HTTPS URL with no
  port-forwarding or router config. Best fit for testing with people
  outside your network — they need nothing installed. Layer Cloudflare
  Access in front of it if you want real access control beyond the API
  key, which stops being a real secret once it's in a public frontend
  bundle (see `.env.example` in the main project).
- **Tailscale + `tailscale serve`** —
  `tailscale serve --bg --https=443 http://localhost:8000` fronts the
  service with a real cert on your tailnet's own domain. Stays private —
  only devices on your tailnet can reach it — but every tester needs
  Tailscale installed and invited, more friction for a wide beta.

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
