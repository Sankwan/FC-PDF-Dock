# Next: AI tools on the FC server

Status: planned, not built. Nothing here is a current capability (see PRODUCT.md).

## Principle

- Light work runs on the staff member's device, loaded only inside the tool that needs it.
- Heavy models run on an FC-owned server with a GPU. Files are processed in memory and never stored; logs hold no document content. The promise becomes "files stay on the FC network".
- Models must have permissive licences (Apache 2.0 / MIT). Avoid revenue-gated weights (Marker, MinerU) and AGPL weights for anything hosted.
- Every feature is tested on real FC documents and recordings before staff are told it works.

## Planned, in order

| # | Feature | Model / approach | Runs on | Notes |
|---|---|---|---|---|
| 1 | **Audio reader** (read a PDF aloud) — **built: Read PDF** | Browser voices; Kokoro-82M (Apache 2.0) as the natural voice, served from /models/kokoro (scripts/vendor-kokoro.mjs) | Device | Highlights the sentence being read; skip/back; speed. Kokoro has US/UK English voices only. |
| 2 | **Transcriber** (recordings → text, minutes) | Whisper large-v3 / large-v3-turbo (MIT) via faster-whisper | Server (GPU) | Ghanaian-accented English needs the large model; test on FC recordings first. Twi via community Akan fine-tunes is research-grade. Output: text, Word, timestamps. |
| 3 | **Better OCR for scans** | PaddleOCR-VL (Apache 2.0) or GLM-OCR (MIT) | Server | Replaces/augments Tesseract for poor scans, stamps, tables. Feeds OCR PDF, PDF to Excel and Compare. |
| 4 | **Hard-file PDF to Word / Excel** | Granite-Docling-258M (Apache 2.0) via Docling | Server | Structured tables and headings when the current geometry-based approach fails. |
| 5 | **Summarise / ask a PDF** | Small open LLM (e.g. Qwen or Granite, Apache 2.0) on the server; Transformers.js or Chrome built-in AI on capable PCs | Server + device | Answers must quote the page they come from. |
| 6 | **Twi ↔ English translation** | NLLB-200 with GhanaNLP Twi data (check licence: NLLB weights are CC-BY-NC) | Server | Twi covered; Ewe and Ga to be confirmed. Non-commercial licence is acceptable for internal government use only after legal check. |

## Server shape (to decide)

- One GPU machine at head office (≥24 GB VRAM covers Whisper large + an OCR model + a small LLM).
- A small API beside the existing PDF to Word service, same security setup (head-office networks, no storage, size limits).
- Open decisions: hardware, who administers it, retention policy (default: none), and which staff groups get access.
