"""PDF -> DOCX conversion pipeline.

Two different strategies depending on what kind of PDF comes in, because
they need genuinely different handling — this isn't a stylistic choice,
it's load-bearing (see the long comment on build_docx_from_ocr_text below
for the failure this avoids):

* Native/digital PDFs (real vector text) go through pdf2docx, which reads
  text/table/image geometry and reconstructs actual Word paragraphs and
  tables from it. This works well — verified against a real PDF with real
  paragraph text.
* Scanned/photographed PDFs are OCRmyPDF'd (Tesseract) for text, then built
  into a DOCX by hand from that OCR text — NOT routed through pdf2docx.
"""
import logging
import os
import subprocess
import tempfile
from pathlib import Path

import fitz  # PyMuPDF
from docx import Document
from pdf2docx import Converter

logger = logging.getLogger("pdf2word")

SCANNED_TEXT_THRESHOLD = 50

# Without an explicit limit, OCRmyPDF spawns one Tesseract process per
# visible CPU for page-level parallelism — fine on a dedicated box, but on
# a shared/bursty container this can over-subscribe under concurrent
# uploads (each request's OCR job competing for the same cores/RAM as every
# other in-flight one). Independent of WEB_CONCURRENCY, which limits
# uvicorn *worker processes*, not threads/processes within one conversion.
OCR_JOBS = int(os.environ.get("OCR_JOBS", "2"))


def _is_valid_xml_char(cp: int) -> bool:
    """XML 1.0's allowed character ranges — tab/LF/CR plus most of Unicode,
    but excluding other C0/C1 control characters."""
    return (
        cp in (0x09, 0x0A, 0x0D)
        or 0x20 <= cp <= 0xD7FF
        or 0xE000 <= cp <= 0xFFFD
        or 0x10000 <= cp <= 0x10FFFF
    )


def _sanitize_for_docx(text: str) -> str:
    """Strips characters XML (and therefore python-docx) rejects outright.

    Tesseract's raw OCR output can and does contain stray control bytes on
    noisy/low-quality scans — without this, a single bad character deep in
    the recognized text takes down the entire conversion.
    """
    return "".join(ch for ch in text if _is_valid_xml_char(ord(ch)))


class ConversionError(Exception):
    """Raised when any stage of the pipeline fails in an expected way."""


def is_pdf_scanned(pdf_path: Path, text_threshold: int = SCANNED_TEXT_THRESHOLD) -> bool:
    """Treats a PDF as "scanned" if it has next to no extractable text."""
    doc = fitz.open(pdf_path)
    try:
        total_chars = sum(len(page.get_text().strip()) for page in doc)
    finally:
        doc.close()
    return total_chars < text_threshold


def make_pdf_searchable(input_pdf: Path, ocr_pdf: Path) -> None:
    """Runs OCRmyPDF to add a positioned, invisible text layer."""
    cmd = [
        "ocrmypdf",
        "--skip-text",  # only OCR pages that don't already have text
        "--optimize", "0",  # we only need the text layer, not recompression
        "--jobs", str(OCR_JOBS),
        "--quiet",
        str(input_pdf),
        str(ocr_pdf),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        # Trim stderr — OCRmyPDF can be verbose, and this ends up in logs only,
        # never returned to the caller (see main.py's error handling).
        raise ConversionError(f"OCRmyPDF failed (exit {result.returncode}): {result.stderr.strip()[-2000:]}")


def convert_pdf_to_docx(pdf_path: Path, docx_path: Path) -> None:
    """Reconstructs paragraphs, tables, and images from PDF geometry into DOCX."""
    cv = Converter(str(pdf_path))
    try:
        cv.convert(str(docx_path), start=0, end=None)
    finally:
        cv.close()


def build_docx_from_ocr_text(ocr_pdf_path: Path, docx_path: Path) -> None:
    """Builds a DOCX directly from OCR'd text, one paragraph per detected
    text block, in top-to-bottom reading order.

    This exists because of a real, verified failure mode: pdf2docx treats a
    scanned page — which visually *is* just one full-page image, even after
    OCRmyPDF adds an invisible text layer on top of it — as an image block,
    and embeds it as a picture in the DOCX while silently discarding the
    invisible OCR text. The result opens fine and looks right, but contains
    zero real text: not searchable, not selectable, not editable — exactly
    the properties a "PDF to Word" tool exists to produce. Building the
    DOCX by hand from the OCR text (instead of asking pdf2docx to
    reconstruct a scanned page's "layout") sidesteps that entirely: it
    won't preserve visual layout as well as pdf2docx does for a native
    PDF, but it guarantees the output actually contains the recognized
    text as real, editable Word paragraphs.
    """
    doc = fitz.open(ocr_pdf_path)
    try:
        out = Document()
        for page_index, page in enumerate(doc):
            if page_index > 0:
                out.add_page_break()
            # (x0, y0, x1, y1, text, block_no, block_type)
            blocks = page.get_text("blocks")
            blocks.sort(key=lambda b: (round(b[1]), b[0]))  # top-to-bottom, then left-to-right
            wrote_any = False
            for block in blocks:
                text = _sanitize_for_docx(block[4].strip())
                if text:
                    out.add_paragraph(text)
                    wrote_any = True
            if not wrote_any:
                out.add_paragraph("")  # keep page breaks meaningful even if OCR found nothing
        out.save(str(docx_path))
    finally:
        doc.close()


def process_pdf_to_word(input_pdf: Path, output_docx: Path) -> None:
    """Runs the full pipeline. Raises ConversionError on any expected failure."""
    with tempfile.TemporaryDirectory() as tmp:
        if is_pdf_scanned(input_pdf):
            logger.info("Scanned PDF detected — running OCRmyPDF, then building DOCX from OCR text")
            ocr_pdf = Path(tmp) / "ocr.pdf"
            make_pdf_searchable(input_pdf, ocr_pdf)
            try:
                build_docx_from_ocr_text(ocr_pdf, output_docx)
            except Exception as err:
                raise ConversionError(f"Building DOCX from OCR text failed: {err}") from err
        else:
            logger.info("Native PDF detected — reconstructing layout/tables via pdf2docx")
            try:
                convert_pdf_to_docx(input_pdf, output_docx)
            except Exception as err:
                raise ConversionError(f"pdf2docx failed: {err}") from err
