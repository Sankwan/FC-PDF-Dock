> Current frontend: PDF-to-Word now runs locally. The converter setup below
> is retained for legacy server deployments and is not required by the current UI.

# Railway pilot with PDF-to-Word

This is a temporary **public test**, with demo credentials and sample documents.
It does not use FC's internal-server staff/network restrictions. Keep the
converter private; the website proxies requests and inserts its API key.
The existing `deploy/headoffice/` configuration remains the internal rollout path.

## 1. Push the prepared code

From your terminal:

```sh
cd /Users/gabby/Documents/Projects/FC-PDF-Dock
git status
git add .
git commit -m "Enable PDF-to-Word for the Railway pilot"
git push
```

This includes the prepared demo login changes if you have not pushed them yet.
Use the same branch for both Railway services.

## 2. Create the converter service

Inside the Railway project/environment containing `fcpdfdock.up.railway.app`:

1. Choose **New → GitHub Repo → Sankwan/FC-PDF-Dock**.
2. Rename this new service **pdfdock-converter**.
3. In **Settings → Source**, select your pushed branch and set **Root Directory**
   to `/services/pdf-to-word`. Railway uses that folder's Dockerfile.
4. Leave custom build/start commands empty; the Dockerfile provides them.
5. In **Variables → Raw Editor**, add:

```ini
API_KEY=REPLACE_WITH_A_RANDOM_SECRET
PORT=8000
HOST=::
WEB_CONCURRENCY=1
OCR_JOBS=1
MAX_UPLOAD_MB=50
MAX_PAGES=100
ALLOWED_ORIGINS=
```

Generate the API_KEY on your Mac with `openssl rand -hex 32`. Paste it only into
Railway variables; never put it in a VITE_ variable, source code or GitHub.
The key is independent of the public demo email/code.

6. Set the deployment healthcheck path to `/health`.
7. Deploy. The image installs the document and OCR dependencies; its first build
   can take longer than the website build. Begin with one worker and modest test
   PDFs; scanned documents require more CPU and memory than native PDFs.
8. In **Settings → Networking**, copy the **private** domain. For this service
   name it will typically be `pdfdock-converter.railway.internal`.
   Do not generate a public domain or TCP proxy. No persistent volume is needed.

`HOST=::` accepts Railway's IPv6 private traffic; `PORT=8000` fixes the port
so the frontend URL below matches the listening service.

## 3. Connect the existing website

On the **existing website service**, set these variables:

```ini
VITE_AUTH_REQUIRED=true
VITE_DEMO_MODE=true
VITE_PDF2WORD_ENABLED=true
PDF2WORD_PUBLIC_PILOT=true
PDF2WORD_SERVICE_URL=http://pdfdock-converter.railway.internal:8000
PDF2WORD_API_KEY=${{pdfdock-converter.API_KEY}}
```

If its private domain differs, use the actual copied domain. The last line is
Railway's reference-variable syntax: it reads the converter's API_KEY without
putting that key in the browser. Alternatively paste the same generated key into
this server-only variable. Never prefix the key with VITE_.

The first three variables are baked into the frontend build. The final three
configure Nginx at startup. **Redeploy the website after setting all six.**
A separate auth service is not required for public demo access.

## 4. Verify the hosted deployment

Open:

https://fcpdfdock.up.railway.app/api/pdf2word/health

It must return `{"status":"ok"}`, not the website's HTML. Then:

1. Sign in using `demo@pdfdock.test` and code `246810`.
2. Choose **PDF to Word**.
3. Select a small sample PDF containing selectable text, then **Convert to Word**.
4. Download the DOCX and check that its words are editable.
5. Repeat with an image-only scan. OCR output is editable text; scan layout,
   columns and tables are not guaranteed to match the PDF.

For cloud testing, PDFs travel to Railway. The UI explains this before upload.
Normal completion removes conversion working files after processing/download;
there is no document library or persistent conversion volume.

## Troubleshooting

| Result | Meaning / action |
|---|---|
| Health URL shows HTML | Website is still on an old build/config; push the fix and redeploy. |
| 403 | Website `PDF2WORD_PUBLIC_PILOT` must be exactly `true` for this test. |
| 503 | Website's server-only `PDF2WORD_API_KEY` is missing. |
| 502/504 | Check converter deployment, private domain, matching port and same environment. |
| Conversion 401 | Frontend proxy key and converter API_KEY do not match. |
| 413 | File exceeds the configured upload limit. |
| 422 | Unreadable, password-protected, over-limit or otherwise unconvertible PDF; try a simpler sample. |
| 429 | Converter is busy or the pilot request limit was reached; wait a minute and retry. |

The proxy accepts up to two active connections and limits request rate. Each
converter process runs one conversion at a time; the pilot uses one process.
The default page limit is 100, default upload limit 50MB, and OCR subprocess
wait is bounded at 240 seconds. These controls suit a small pilot; they are not
an abuse-resistant public conversion service or a broad fidelity benchmark.

## Moving internally

Use `deploy/headoffice/`, set `VITE_DEMO_MODE=false`, and rebuild. Keep staff
sign-in and the existing network restrictions. The root image defaults
`PDF2WORD_PUBLIC_PILOT=false`; that switch does not change the separate
head-office Nginx template, which continues enforcing its own checks.

## Local validation recorded for this change

- Real native PDF → DOCX with editable text through Nginx.
- Real image-only PDF → OCR → DOCX with editable text through Nginx.
- Browser choose/convert/download, with the downloaded DOCX checked independently.
- Invalid content and 101-page PDF rejected with 400/422.
- Unit tests: occupied conversion slot, bounded upload read, cleanup after failure.
- Nginx integration: opt-in gate, missing key, path/query preservation and secret
  header replacement. `npm run test:deployment` runs these proxy checks.
- `npm run test:pdf2word` runs synthetic conversion assertions against a disposable
  loopback deployment; set PDF2WORD_TEST_URL and PDF2WORD_TEST_FIXTURES first.

Hosted Railway success must be verified after the user deploys these settings.
