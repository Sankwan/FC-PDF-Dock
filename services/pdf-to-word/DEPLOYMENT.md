# PDF to Word: how it works, and how it's deployed

> **Forestry Commission build:** this service runs only on the FC head-office
> server, behind nginx, as part of `deploy/headoffice/`. The browser calls it on
> the same address at `/api/pdf2word/`; nginx checks the staff session and the
> head-office network, and adds the API key itself, so no key or service URL is
> in the app, and CORS is not used. Do **not** use the Railway or Vercel
> options below for FC: they would send staff documents through third-party
> servers. They are kept only as background.


Two things in one doc, since they're really one story: what happens to a
file when someone uses this tool, and how to actually get the whole app —
frontend and backend both — reachable for real testing.

**Status check before reading further:** the pipeline and the FastAPI
service are built and verified (see the main commit history / your own
test runs). The recommended path is two Railway services (Part 2) — this
is the runbook for setting that up yourself, since it needs your own
Railway account. Part 3 documents a fully self-hosted alternative
(Cloudflare Tunnel) for anyone who wants zero third-party compute.

---

## Part 0 — How this was actually arrived at

Worth writing down, because every one of these was a real candidate that
got ruled out for a specific, checked reason — not skipped by assumption.
If this ever needs revisiting, don't re-propose these without knowing why
they didn't work the first time.

**The starting point** was a suggested 3-stage pipeline (OCR
pre-processing → spatial layout/table parsing → OpenXML generation),
correctly diagnosing the real difficulty: a PDF has no concept of
"paragraph" or "table," just absolute-positioned drawing instructions.
Recovering editable structure from that is a geometry-inference problem,
not something a library like `pdf-lib` (which only reads/writes PDF
structure, not scanned-page semantics) can do. That diagnosis was right
and is the reason this tool exists as a server instead of a browser
feature.

**The three specific engines that suggestion named were checked one by
one, not taken on faith:**

- **Marker** (`marker-pdf`) — turned out to **not output DOCX at all**.
  Its output formats are markdown/JSON/HTML/chunks only; DOCX is an
  *input* format it accepts, not something it produces. A suggested CLI
  command using `--output_format docx` would simply fail against the
  real tool. Its model weights also carry a revenue-based license (free
  under ~$5M funding/revenue, paid above that) — a real problem for a
  multi-company internal rollout even if the output format had matched.
- **MinerU** — same shape of problem: it parses DOCX as input for its
  own markdown/JSON extraction pipeline, aimed at feeding LLM/RAG
  workflows, not at producing a document a person opens in Word. It
  doesn't write DOCX either.
- **pdf2docx** — the one of the three that actually does what's needed:
  reads real PDF geometry and reconstructs genuine Word paragraphs and
  tables. Confirmed working against a real PDF with real paragraph text
  before being trusted. (It's no longer actively maintained upstream —
  noted as a known limitation in the main README — but it works, is
  MIT-licensed, and nothing better replaces it today.)

**The "just use LibreOffice" instinct was checked too, and doesn't
reach this problem.** Gotenberg (the Docker+LibreOffice container
originally suggested for this before pdf2docx was settled on) only
exposes an **Office → PDF** route — there is no PDF → Office route in it
at all. It's the right tool for the *other* direction (which this app
already solves entirely client-side via `office2pdf`/WASM, no server
needed) but doesn't touch this one. LibreOffice's own PDF-import feature
can technically open a PDF and re-save as DOCX, but Gotenberg doesn't
expose it as an API route, and its quality is known to be poor even in
the desktop app — not something worth building a custom route for when
pdf2docx already does the job better.

**A separately-suggested option, `pdftotree` (HazyResearch), was also
checked and ruled out**, on its own merits: it outputs hOCR (annotated
HTML), not DOCX, so it would need a whole extra hOCR→DOCX conversion step
bolted on before it produced anything useful — exactly the job pdf2docx
already does natively. It's also unmaintained since October 2020 and
pulls in a JVM dependency (via `tabula-py`) for one feature. Strictly
worse on every axis than what's already running.

**With the engine settled, the scanned-page path still broke in
practice** — this is the pdf2docx bug documented below, found only by
actually running a real image-only PDF through the pipeline, not by
reading pdf2docx's docs and assuming it would handle OCR'd text
correctly. It didn't: it silently discarded the invisible OCR layer and
emitted an uneditable picture. That's why scanned pages get their own
code path (`build_docx_from_ocr_text`) instead of sharing pdf2docx's
DOCX-building step with native PDFs.

**One more bug surfaced in testing, not code review**: Tesseract's raw
OCR output on a noisy test image contained a stray control character
(`\x13`), which `python-docx` correctly refused to write (XML forbids
most control characters). A single bad character deep in the recognized
text would otherwise have taken down an entire conversion. Fixed with
`_sanitize_for_docx()` in `app/pipeline.py`, which strips anything
outside XML's allowed character ranges before it reaches `python-docx`.

**The deployment shape also went through a real dead end.** The first
plan was a Vercel serverless function acting as a proxy — call the
backend server-to-server so the real API key never reaches the public
frontend bundle. That fails on a hard constraint: Vercel Functions cap
request bodies at 4.5MB, on every plan tier, non-negotiable, and real
PDFs routinely exceed that. So the browser has to call the backend
directly, which means the API key is not really hideable in this
architecture — see the Security reminder in Part 4 for what that
actually means in practice.

---

## Part 1 — How PDF to Word actually works

### Why this tool alone needs a server

Every other tool in this app runs entirely in the visitor's browser — no
upload, no server, ever. PDF → Word is the one exception, because nothing
client-side can do this direction with real fidelity (see the main
project `README.md`'s "PDF to Word" section for the research behind that
conclusion — the short version: reconstructing an editable Word document
from a fixed-layout PDF requires the kind of layout inference that only
mature, unmaintained-in-WASM tools like `pdf2docx` do well).

### The request path, end to end

```
Browser (PdfToWord.tsx)
  │  FormData upload, XHR with upload-progress events
  │  header: X-API-Key
  ▼
POST https://<your-service-url>/convert/pdf-to-word
  │
  ▼
TLS termination (this is what makes the URL HTTPS) —
  Railway's edge if deployed there (Part 2), or Cloudflare's edge +
  the cloudflared daemon if self-hosted instead (Part 3)
  │
  ▼
uvicorn (app/main.py, FastAPI) — one of WEB_CONCURRENCY worker processes
  │
  ├─ require_api_key()      — reject if X-API-Key doesn't match
  ├─ %PDF- signature check  — reject non-PDF content immediately
  ├─ size check             — reject anything over MAX_UPLOAD_MB
  │
  ▼
await run_in_threadpool(process_pdf_to_word)  (app/pipeline.py)
  │  (offloaded to a thread so this worker's event loop — and therefore
  │   /health and every other concurrent request — isn't frozen for the
  │   whole conversion; see "Concurrency" below)
  │
  ├─ is_pdf_scanned()?
  │     │
  │     ├─ NO  (native/digital PDF, real vector text)
  │     │     └─ pdf2docx.Converter → reads text/table/image geometry,
  │     │        reconstructs actual Word paragraphs and tables
  │     │
  │     └─ YES (scanned/photographed page)
  │           ├─ OCRmyPDF (--skip-text) → injects an invisible,
  │           │  positioned text layer via Tesseract
  │           └─ build_docx_from_ocr_text() → reads the OCR'd text
  │              directly via PyMuPDF and writes plain paragraphs with
  │              python-docx — deliberately NOT routed through pdf2docx
  │              (see "the pdf2docx bug" below)
  │
  ▼
.docx bytes returned as the HTTP response
  │
  ▼
Browser receives it as a Blob, offers it as a download
```

### The pdf2docx bug this pipeline works around

This was found by actually testing against a real scanned PDF, not
assumed: `pdf2docx` treats a scanned page — which visually *is* just one
full-page image, even after OCRmyPDF adds an invisible text layer on top
of it — as a picture block, and embeds it as an image in the DOCX while
**silently discarding the invisible OCR text underneath**. The result
opens fine and looks correct, but contains zero real text: not
searchable, not selectable, not editable — exactly the properties a "PDF
to Word" tool exists to produce.

The fix: scanned pages skip `pdf2docx` for the DOCX-building step
entirely. Their OCR'd text is pulled directly from the PDF (grouped into
blocks via `page.get_text("blocks")`, ordered top-to-bottom) and written
into a fresh DOCX with `python-docx`. This trades layout fidelity (no
attempt at reconstructing columns/tables from a scan) for the one thing
that actually matters: the text is real and editable. Native/digital
PDFs don't hit this path at all — they get pdf2docx's full layout
reconstruction, which works well.

### What's already built in for security

All of this exists in `app/main.py` today, verified against real
failure cases, not just written and assumed to work:

| Protection | How | Verified how |
|---|---|---|
| Auth | `X-API-Key` header, constant-time comparison, fails closed if unset | Confirmed 401 on missing/wrong key |
| File-type check | Sniffs the actual `%PDF-` magic bytes | Confirmed a `.docx` renamed to look like a PDF request gets a clean 400, not a 500 |
| Size limit | `MAX_UPLOAD_MB` env var, checked before processing | — |
| No disk writes | `docker-compose.yml` mounts `/tmp` as `tmpfs` (RAM-backed) | — |
| No leaked internals | Every exception returns a generic message; real errors only reach container logs | — |
| CORS | `ALLOWED_ORIGINS` env var — empty by default (blocks all browser origins) | — |
| Malformed input | Truncated/corrupt PDFs | Confirmed clean 422, container stays healthy |

### Concurrency — why one slow conversion doesn't freeze the service

This was a real bug, found by checking rather than assuming the service
could handle concurrent testers. The conversion call is synchronous and
CPU/subprocess-bound (PyMuPDF, OCRmyPDF, pdf2docx) — calling it directly
inside an `async def` FastAPI route would block that worker's entire
event loop for the whole conversion, including `/health` and every other
request hitting the same worker at the same time. Two fixes, at different
levels:

- **`await run_in_threadpool(process_pdf_to_word, ...)`** (`app/main.py`)
  — hands the blocking call to a thread, freeing the event loop to keep
  answering other requests while one conversion is in progress. Verified,
  not assumed: ran a real ~1.2s OCR conversion and fired 5 concurrent
  `/health` checks *during* it — all returned in 1–4ms instead of queuing
  behind the conversion.
- **`WEB_CONCURRENCY` worker processes** (`Dockerfile`'s `CMD`, default
  2) — separate OS processes, so this is true multi-core parallelism
  across separate Python interpreters (sidestepping the GIL entirely),
  complementary to the threadpool fix above rather than a duplicate of
  it. Raise it if you give the container more vCPUs and see conversions
  queuing up under real concurrent load.
- **`OCR_JOBS`** (`app/pipeline.py`, default 2) — a separate knob at a
  third level: how many Tesseract processes *one* OCRmyPDF call spawns
  for its own page-level parallelism. Without a limit, OCRmyPDF defaults
  to one process per CPU it can see, which on a shared/bursty container
  can over-subscribe under concurrent scanned-PDF uploads (each request's
  OCR job competing for the same cores/RAM as every other in-flight one).
  Verified with a real conversion through the scanned-PDF path after
  adding `--jobs ${OCR_JOBS}` to the `ocrmypdf` command — output was a
  valid, correctly-OCR'd `.docx`, no behavior change other than the
  process-count cap.

---

## Part 2 — Railway (recommended)

The whole app — frontend and backend — runs as **two separate services
in one Railway project**, both built from this same repo. Railway
deploys each service's `Dockerfile` directly, gives each its own real
HTTPS URL automatically (no `cloudflared`, no Tailscale, no Vercel, no
dependency on a physical machine staying powered on), and is a real
container host with no 4.5MB-style request body cap, so nothing about
the upload path changes.

| Service | Root directory | Dockerfile | What it serves |
|---|---|---|---|
| Frontend | `.` (repo root) | `Dockerfile` | the static Vite/PWA build, via nginx |
| Backend | `services/pdf-to-word` | `services/pdf-to-word/Dockerfile` | the FastAPI PDF-to-Word service |

Deploy the **backend first** — the frontend build needs the backend's
URL as a build-time variable, so it's easiest to have that URL in hand
before touching the frontend service.

### What changed in the code to support this

Railway injects a `PORT` environment variable at runtime and expects the
container to bind to it — it's dynamic, not something you pick. This
applies to both services, and both were changed the same way (verified
with real `docker run` tests using `-e PORT=<other>`, not just reasoned
about):

- **Each `Dockerfile`'s `CMD`/entrypoint** reads `${PORT:-<local default>}`
  at container start via shell-form `CMD`, rather than a value hardcoded
  at build time. The backend's also uses an `exec` prefix so `SIGTERM`
  (from `docker stop`, Railway restarts/redeploys) reaches the process
  directly instead of being swallowed by an intermediate `/bin/sh` — the
  frontend's nginx image handles this itself via its own entrypoint, no
  extra prefix needed. (`docker build` on the backend will still lint its
  shell-form `CMD` as `JSONArgsRecommended` — expected; switching to
  array form would silently break the `$PORT` substitution instead of
  fixing anything.)
- **Each `HEALTHCHECK`** reads `PORT` from the running container's actual
  environment at check time, not a value baked in at build time, so it
  checks the right port under either deployment.

Locally, `PORT` is simply never set, so everything falls back to each
service's own default (8000 backend, 8080 frontend) — `docker-compose.yml`
and local testing are unaffected.

The frontend also needs its `VITE_*` variables **baked in at build
time** — Vite inlines them into the JS bundle, and there's no way to
change them after the fact without rebuilding. Railway does **not**
auto-forward service variables into a Dockerfile build; each one has to
be declared with an `ARG` in the Dockerfile and set as a variable on that
service. The root `Dockerfile` already declares `ARG` for
`VITE_APP_NAME`, `VITE_APP_SHORT_NAME`, `VITE_APP_DESCRIPTION`,
`VITE_THEME_COLOR`, `VITE_PDF2WORD_API_URL`, and `VITE_PDF2WORD_API_KEY`
— set matching values as that service's Variables and Railway forwards
them as build args automatically.

### Setup — backend service

1. **Push this repo to a place Railway can see it** (GitHub is simplest —
   Railway deploys directly from a connected repo) or use the Railway CLI
   (`railway up`) to deploy from your local checkout without a repo at
   all.
2. **Create a new Railway project**, add a service from this repo.
3. **Set the service's root directory to `services/pdf-to-word`** —
   Settings → the service → Root Directory. This is a monorepo (the
   frontend lives alongside this service), so Railway needs to know to
   build from this subfolder specifically. Railway should auto-detect the
   `Dockerfile` there once the root directory is set.
4. **Set environment variables** (Settings → Variables, on the service):
   ```
   API_KEY=<generate with: openssl rand -hex 32>
   ALLOWED_ORIGINS=<filled in after the frontend service exists — see below>
   MAX_UPLOAD_MB=50
   WEB_CONCURRENCY=2
   OCR_JOBS=2
   ```
   Do **not** set `PORT` yourself — Railway injects it automatically.
5. **Generate a public domain** — Settings → Networking → Generate
   Domain. This gives a stable `https://<something>.up.railway.app` URL
   immediately, real TLS included, no extra configuration. Copy this
   down — the frontend service needs it next.
6. **Set the healthcheck path** (Settings → Deploy → Healthcheck Path):
   `/health`. Railway uses this (separately from the Docker `HEALTHCHECK`
   instruction, which still runs too) to decide whether a deploy
   succeeded and to route traffic away from an unhealthy instance.
7. **Deploy**, then confirm from the Railway dashboard's logs that it
   started cleanly and `/health` on the generated domain returns
   `{"status": "ok"}`.

### Setup — frontend service

1. **Add a second service to the same Railway project**, from the same
   repo.
2. **Leave the root directory as `.`** (the repo root) — Settings → the
   service → Root Directory, either unset or explicitly `.`. Railway
   should auto-detect the root `Dockerfile`.
3. **Set environment variables** (Settings → Variables, on this service)
   — these become Docker build args via the `ARG` declarations in the
   root `Dockerfile`:
   ```
   VITE_APP_NAME=PDFDock
   VITE_APP_SHORT_NAME=PDFDock
   VITE_APP_DESCRIPTION=Merge, split, compress, and convert PDFs entirely in your browser.
   VITE_THEME_COLOR=#0d6e5c
   VITE_PDF2WORD_API_URL=<the backend's Railway domain from step 5 above>
   VITE_PDF2WORD_API_KEY=<the same value as API_KEY on the backend service>
   ```
   Leave the last two blank if you don't want PDF-to-Word enabled on this
   build — the tool shows a clean "not set up" message instead of a
   broken one.
4. **Generate a public domain** — Settings → Networking → Generate
   Domain.
5. **Deploy**, then open the generated domain and confirm the app loads.
6. **Go back to the backend service** and set its `ALLOWED_ORIGINS` to
   this frontend domain (e.g. `https://<something>.up.railway.app`), then
   redeploy the backend for that change to take effect. Until this step,
   PDF-to-Word requests from the frontend will fail CORS.

### A note on config files

Railway supports a `railway.json`/`railway.toml` file for declaring this
same setup as code instead of clicking through the dashboard — deliberately
not used here. Railway's own docs mark that format deprecated (existing
files keep working only until **2026-12-01**, with a newer
`.railway/railway.ts` format replacing it), and that new format's schema
isn't something to commit to without verifying it firsthand against a
real deploy. The dashboard steps above accomplish the same thing and
aren't on a deprecation clock.

### What's a genuine open question, not yet verified

- **Exact RAM usage of a real conversion under load** — nobody has
  profiled this yet. Watch Railway's usage graph after deploying rather
  than trusting a guess (including any guess offered here) about what a
  10-page scanned document actually costs in memory.
- **Whether Railway's own edge imposes a request-body-size limit** below
  this service's own `MAX_UPLOAD_MB` — unconfirmed either way. Test with
  a real 30–40MB PDF once deployed rather than assuming either direction.

### The trust-boundary tradeoff, stated plainly

Every other tool in the PDF toolkit runs entirely client-side — nothing
ever leaves the visitor's device, for any reason, ever. This tool, once
deployed to Railway, means a document is transiently processed by a third
party's infrastructure during conversion: not persisted (the
`/tmp`-cleanup design still holds), not shared, but genuinely present in
memory on hardware Railway operates, for the few seconds a conversion
takes. That's the same trust model as running on your own AWS/GCP
instance — a normal, common tradeoff for a beta test — but it's a
different guarantee than "impossible to intercept, full stop," which is
what every other tool in this app actually provides. Worth being clear
about that distinction with anyone whose documents might be sensitive
enough to care.

---

## Part 3 — Alternative: fully self-hosted (no third-party compute at all)

If keeping every byte inside your own organization's infrastructure
matters more than the simplicity Railway offers — no document ever
transiting anyone else's servers, even transiently — this is the option
that preserves that, at the cost of needing a real machine (the
head-office server) to stay powered on with Docker running.

### Why Cloudflare Tunnel over the alternatives

- **Plain port-forwarding** requires opening a port on the head office's
  router/firewall and exposes the raw IP — real attack surface, and most
  office networks don't have a static IP anyway.
- **Tailscale + `tailscale serve`** is the better choice if testers are
  *only* people you can invite onto your tailnet (see the main README's
  comparison). For "extensive testing" with people outside that circle,
  it adds friction — they'd all need Tailscale installed.
- **Cloudflare Tunnel** gives a real public HTTPS URL with **no router
  configuration, no open ports, no static IP needed** — `cloudflared`
  makes an outbound-only connection from the head-office machine to
  Cloudflare's edge, so nothing has to accept inbound connections at all.
  Testers need nothing installed. This is the one to use here.

### Prerequisites

- A Cloudflare account (free tier is enough).
- For a **stable, permanent URL** (recommended for real testing): a
  domain added to Cloudflare (even a cheap/free one works — Cloudflare
  Registrar, or transfer an existing domain's DNS to Cloudflare).
- For **quick, throwaway testing** with no domain at all: skip straight
  to the Quick Tunnel below — Cloudflare hands you a random
  `*.trycloudflare.com` URL, good enough to sanity-check the whole path
  before committing to a named tunnel.

### Option A — Quick Tunnel (fastest, URL changes every run)

```bash
brew install cloudflared        # or the equivalent for your OS

# with the pdf-to-word container already running (docker compose up -d):
cloudflared tunnel --url http://localhost:8000
```

This prints a random `https://<random-words>.trycloudflare.com` URL
immediately — no login, no domain needed. Good for a first end-to-end
smoke test. It dies when you Ctrl+C it, and you get a *different* random
URL next time, so it's not something to actually hand out to testers for
more than a quick check.

### Option B — Named Tunnel (stable URL, what you actually want for testing)

```bash
# 1. One-time login — opens a browser to authorize cloudflared against
#    your Cloudflare account.
cloudflared tunnel login

# 2. Create a named tunnel (once).
cloudflared tunnel create pdf-to-word

# 3. Route a subdomain of your Cloudflare-managed domain to it (once).
cloudflared tunnel route dns pdf-to-word pdf2word.yourdomain.com

# 4. Create the config file that tells cloudflared what to forward.
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml <<EOF
tunnel: pdf-to-word
credentials-file: /Users/<you>/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: pdf2word.yourdomain.com
    service: http://localhost:8000
  - service: http_status:404
EOF

# 5. Run it (with the pdf-to-word container already up).
cloudflared tunnel run pdf-to-word
```

Your service is now live at `https://pdf2word.yourdomain.com` — real TLS,
terminated by Cloudflare, forwarded to the container on the head-office
machine. This URL stays the same across restarts (unlike the Quick
Tunnel), which is what you want once you're pointing a real deployed
frontend at it.

**Keep it running in the background** (so it survives closing the
terminal) — either:

```bash
# Run once, as a system service that starts on boot:
sudo cloudflared service install
```

or run it under the same process manager you'd use for anything
long-lived on that machine (launchd on macOS, systemd on Linux, or just a
`tmux`/`screen` session if this is genuinely just for a beta period).

---

## Part 4 — Final wiring and confirmation (same idea, either hosting path)

Whichever path you used — two Railway services (Part 2) or a
self-hosted backend behind Cloudflare Tunnel with the frontend built and
served some other way (Part 3) — the two things that have to line up are
the same:

**1. CORS on the backend must name the frontend's exact origin.**
Railway: set `ALLOWED_ORIGINS` in the backend service's Variables tab to
the frontend service's generated domain, then redeploy the backend.
Self-hosted: edit `services/pdf-to-word/.env` and run `docker compose up
-d --force-recreate` to pick it up.

```
ALLOWED_ORIGINS=https://<your-frontend-domain>
```

**2. The frontend's build-time variables must point at the backend.**
On Railway this is a Variables setting on the frontend service (Part 2's
frontend setup, step 3) — changing it requires a redeploy, since Vite
inlines these at build time, not at runtime:

```
VITE_PDF2WORD_API_URL=https://<your-backend-domain>
VITE_PDF2WORD_API_KEY=<the same value as API_KEY on the backend>
```

**3. Confirm the whole path works** — from any machine (not the one
hosting either service), open the deployed frontend URL, go to PDF to
Word, and convert a real file. If it fails, see Troubleshooting below.

### Security reminder

The API key is **not a real secret** once it's in the public frontend
bundle — anyone can read it from browser dev tools. It still filters
casual/automated hits against the backend's public URL, but the actual
access control at this point is: on Railway, whatever you layer on top
yourself (there's no Railway-native equivalent to Cloudflare Access); on
Cloudflare Tunnel, add **Cloudflare Access** in front of it (Zero Trust →
Access → Applications) to gate access by email domain before a request
ever reaches the API key check. Go through `SECURITY.md` in this folder
before wide rollout either way.

### Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Could not reach the conversion service" | Railway: check the backend service's deploy logs — is it actually running? Self-hosted: the Docker container isn't running (`docker compose ps`), or `cloudflared` isn't running, or the tunnel died — check both independently, the tunnel doesn't help if the container underneath it is stopped. |
| Request silently fails, no error in the Network tab shows a response | Mixed content — you're calling a plain `http://` URL from an `https://` page. `VITE_PDF2WORD_API_URL` must be `https://`, not a bare `http://ip:8000` address. |
| `CORS error` in the browser console | `ALLOWED_ORIGINS` on the backend doesn't include the exact origin the frontend is served from (protocol + domain, no trailing slash, no path) — and the backend needs a redeploy after that variable changes. |
| `401 Unauthorized` | `VITE_PDF2WORD_API_KEY` (frontend) doesn't match `API_KEY` (backend) — remember a frontend variable change needs a rebuild/redeploy to take effect, since it's baked in at build time. |
| Frontend deploys but PDF to Word shows "not set up on this deployment" | `VITE_PDF2WORD_API_URL`/`VITE_PDF2WORD_API_KEY` weren't set as Variables on the frontend Railway service before its last build, or the `ARG` names in the root `Dockerfile` don't match — Railway only forwards a variable into the build if a matching `ARG` exists. |
| Works locally but not from elsewhere | You're probably still testing against `127.0.0.1:8000` directly rather than the deployed URL — that only ever works on the same machine as the container. |
| Deployed to Railway but requests fail intermittently, or `/health` looks fine but conversions time out | Check `WEB_CONCURRENCY` isn't set higher than the CPU allocation can actually support — too many worker processes competing for too few vCPUs can make things slower, not faster. |
