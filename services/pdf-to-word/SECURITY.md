# Security checklist — work through this before sharing over Tailscale

This service currently binds to `127.0.0.1` only (see `docker-compose.yml`)
— nothing outside this machine can reach it, full stop. That's the right
state for testing at head office. Before widening it to anything else
(Tailscale, VPN, any shared network), go through this list.

- [ ] **`API_KEY` is a real random secret, not the placeholder.** Generate
      one with `openssl rand -hex 32`. Without a real key, the service
      fails closed (503) rather than accepting requests — but don't rely
      on that, set a real one.
- [ ] **`API_KEY` is stored as a secret, not committed to git.** `.env` is
      already gitignored in this folder — keep it that way. Rotate the
      key if it's ever pasted somewhere it shouldn't be (chat, a ticket, a
      screenshot).
- [ ] **Understood: once the frontend calls this directly (`VITE_PDF2WORD_API_KEY`),
      the key is NOT a real secret anymore.** Vite inlines every
      `VITE_`-prefixed value into the public JS bundle — anyone can read it
      from browser dev tools. It still filters out casual/automated hits
      against the service's public URL, but don't treat it as real access
      control once deployed this way. If you need real access control at
      that point, put Cloudflare Access (or equivalent) in front of the
      tunnel, or keep the service Tailscale-only so only invited devices
      can reach it regardless of who has the key.
- [ ] **`ALLOWED_ORIGINS` is set to the exact frontend origin(s)**, not
      left empty (which blocks all browser calls) and not set to `*`.
      Example: `https://pdftoolkit.acme.internal`. Empty is safe by
      default but means the frontend can't call it either — you'll widen
      this deliberately when you wire up the "PDF to Word" page.
- [ ] **Port binding stays private when you widen access.** Moving from
      `127.0.0.1:8000:8000` to `0.0.0.0:8000:8000` exposes it to every
      network interface on the host, not just Tailscale's. If the head
      office server has any public-facing NIC, bind to the Tailscale
      interface's specific IP instead (`tailscale ip -4`), or put it
      behind `tailscale serve` / a reverse proxy that only listens on the
      tailnet.
- [ ] **Confirmed uploaded files never touch disk.** `docker-compose.yml`
      mounts `/tmp` as `tmpfs` (RAM-backed) — conversion input/output
      exist only in memory and are gone on container restart. Don't add a
      bind-mounted volume for `/tmp` later without re-checking this.
- [ ] **Confirmed error responses don't leak internals.** `app/main.py`
      catches all exceptions and returns generic messages
      ("Could not convert this PDF" / "Internal error during
      conversion") — real errors (file paths, stack traces, OCR/pdf2docx
      internals) only go to container logs (`docker compose logs`), never
      to the client. Re-check this if you add new endpoints or change
      error handling.
- [ ] **File-type check is signature-based, not filename/Content-Type
      based.** Already implemented (`app/main.py` checks for the `%PDF-`
      magic bytes) — this matters because client-supplied filename and
      Content-Type are trivial to spoof and were found, during testing, to
      let a non-PDF file slip through into the pipeline and produce a
      confusing 500 instead of a clean rejection.
- [ ] **Rebuild periodically for base-image/dependency security patches.**
      `docker compose build --pull` picks up a fresh `python:3.11-slim`
      base and latest patch versions of Tesseract/Ghostscript/QPDF from
      Debian's repos.
- [ ] **Consider a reverse proxy with rate limiting** (Caddy or nginx) in
      front of this once it's reachable by more than one machine, so one
      misbehaving or compromised client can't tie up conversion capacity
      for everyone else. Not needed for head-office-only testing.
- [x] **Test with a deliberately malformed/corrupt PDF** before wider
      rollout — confirm the service returns a clean 4xx/5xx and keeps
      running, rather than crashing the container. Verified: a truncated
      PDF (first 200 bytes of a real file) returns a clean `422` with a
      generic message, and the container stays healthy afterward. Re-run
      this check after any pipeline changes.
