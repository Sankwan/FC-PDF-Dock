"""FastAPI service: PDF -> DOCX, self-hosted.

Intended deployment: one instance at head office, reachable only over a
private network (Tailscale / VPN / intranet — never the public internet),
called by the Local PDF Toolkit web app's future "PDF to Word" tool. This
is the one piece of that toolkit that isn't purely static — everything
else runs in the browser with zero server involved. See ../README.md for
setup and ../SECURITY.md for the checklist to work through before sharing
this beyond head office.
"""
import logging
import asyncio
import os
import tempfile
import uuid
from pathlib import Path

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool

from .auth import require_api_key
from .pipeline import ConversionError, process_pdf_to_word

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pdf2word")

MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_MB", "50")) * 1024 * 1024
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]

app = FastAPI(title="pdf-to-word", version="1.0.0")
# PyMuPDF/pdf2docx must not run in concurrent threads in the same process.
# Additional workers each own a separate slot; Railway pilot uses one worker.
_conversion_slot = asyncio.Semaphore(1)

app.add_middleware(
    CORSMiddleware,
    # Empty list (the default) means no browser origin is allowed to call
    # this cross-origin — set ALLOWED_ORIGINS once you know the exact
    # origin(s) of the frontend that will call this.
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["POST"],
    allow_headers=["X-API-Key", "Content-Type"],
)


@app.get("/health")
def health() -> dict:
    """Unauthenticated on purpose — container/orchestrator healthchecks
    only need this, and it reveals nothing sensitive."""
    return {"status": "ok"}


def _cleanup(*paths: Path) -> None:
    for p in paths:
        p.unlink(missing_ok=True)


@app.post("/convert/pdf-to-word", dependencies=[Depends(require_api_key)])
async def convert_pdf_to_word_endpoint(background_tasks: BackgroundTasks, file: UploadFile):
    if _conversion_slot.locked():
        raise HTTPException(429, "Another conversion is running. Try again shortly.", headers={"Retry-After": "10"})
    async with _conversion_slot:
        return await _convert_file(background_tasks, file)


async def _convert_file(background_tasks: BackgroundTasks, file: UploadFile):
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Empty file.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"File exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)}MB limit.",
        )
    # Sniff the actual file signature rather than trusting the client-
    # supplied filename/Content-Type, both of which are easy to get wrong
    # or spoof (e.g. curl/some browsers send application/octet-stream for
    # plenty of real, non-PDF files, which a permissive check would let
    # through into the conversion pipeline as a confusing 500 instead of a
    # clean, immediate rejection).
    if not data.startswith(b"%PDF-"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only .pdf files are accepted.")

    job_id = uuid.uuid4().hex
    tmp_dir = Path(tempfile.gettempdir())
    input_pdf = tmp_dir / f"{job_id}.pdf"
    output_docx = tmp_dir / f"{job_id}.docx"
    input_pdf.write_bytes(data)

    try:
        # process_pdf_to_word is synchronous and CPU/subprocess-bound (PyMuPDF,
        # OCRmyPDF, pdf2docx) — calling it directly here would block this
        # worker's entire event loop for the whole conversion, including
        # /health and every other concurrent request. run_in_threadpool hands
        # it to a worker thread instead, so one slow conversion doesn't freeze
        # the whole process for everyone else hitting it at the same time.
        await run_in_threadpool(process_pdf_to_word, input_pdf, output_docx)
    except ConversionError as err:
        _cleanup(input_pdf, output_docx)
        logger.warning("Conversion failed for job %s: %s", job_id, err)
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Could not convert this PDF.") from err
    except Exception:  # pragma: no cover - defensive: never leak internals
        _cleanup(input_pdf, output_docx)
        logger.exception("Unexpected error for job %s", job_id)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Internal error during conversion.")
    finally:
        input_pdf.unlink(missing_ok=True)

    out_name = Path(file.filename or "document.pdf").stem + ".docx"
    background_tasks.add_task(_cleanup, output_docx)
    return FileResponse(
        output_docx,
        filename=out_name,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
