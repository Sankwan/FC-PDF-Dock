FROM python:3.11-slim

# System dependencies for OCRmyPDF (Tesseract + Ghostscript + QPDF) and
# PyMuPDF's rendering libs. unpaper is optional (de-skewing scanned pages)
# but improves OCR quality on photographed documents; drop it to shave a
# little image size if you don't need it.
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    ghostscript \
    qpdf \
    unpaper \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Run as a non-root user.
RUN useradd --create-home --uid 1000 appuser \
  && chown -R appuser:appuser /app
USER appuser

# No fixed EXPOSE — Railway assigns its own PORT at runtime (see CMD below).
# 8000 is still the default for local/docker-compose use, where PORT is
# left unset.
EXPOSE 8000

# Reads PORT from the actual container environment at healthcheck time
# (not baked in at build time), so this still checks the right port
# whether that's the local default (8000) or whatever Railway assigned.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys,os; p=os.environ.get('PORT','8000'); sys.exit(0 if urllib.request.urlopen(f'http://127.0.0.1:{p}/health', timeout=3).status == 200 else 1)"

# Shell form (not exec/JSON-array form) so $PORT and $WEB_CONCURRENCY
# actually get expanded at container start — an exec-form CMD would pass
# the literal, unexpanded string "${PORT:-8000}" to uvicorn instead of a
# number. WEB_CONCURRENCY controls worker *process* count (true multi-core
# parallelism across separate Python processes, unlike the run_in_threadpool
# fix in app/main.py, which only keeps a single worker's event loop
# unblocked during one conversion) — default 2 is a sane starting point for
# a modest CPU allocation; raise it if Railway gives this service more
# vCPUs and testing shows conversions queuing up under load.
# `exec` replaces the shell process with uvicorn instead of running it as
# the shell's child, so SIGTERM (from `docker stop`, Railway restarts/
# redeploys, etc.) reaches uvicorn directly for a clean shutdown instead of
# being swallowed by an intermediate /bin/sh. `docker build` still lints
# this as "JSONArgsRecommended" (it can't tell `exec` fixes the signal
# issue) — that warning is expected and fine to ignore here; switching this
# back to JSON-array form would silently break the $PORT/$WEB_CONCURRENCY
# substitution instead.
CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers ${WEB_CONCURRENCY:-2}
