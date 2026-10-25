# FC PDFDock — final Impeccable audit

Completed 25 October 2026 after Harden → Adapt → Optimize → Clarify → Re-audit → Polish, followed by a separate final audit.

## Result

The FC-specific identity is preserved. The 12 findings from the initial audit have been addressed in the tested paths. No P0/P1 defect was observed in the final tested paths; this does not certify untested devices, browsers or every document format.

| Dimension | Before | After | Evidence / limit |
|---|---:|---:|---|
| Accessibility | 2 | 3 | Focus, skip navigation, crop keyboard actions, non-drag editing, slider names and contrast corrected; full assistive-technology testing remains |
| Performance | 2 | 3 | Entry JS reduced from 640 KB gzip to about 101 KB; field LCP/INP and low-end phone measurements remain |
| Responsive design | 3 | 3 | 200 production entry/empty layouts passed width checks; representative populated scanner tested separately; physical touch/keyboard testing remains |
| Theming | 2 | 3 | Both themes inspected; dark primary action is RGB(46,122,54) with white text; dark missing-page text is readable |
| Implementation integrity | 2 | 4 | Scanner export invalidation and draft lifecycle reproduced successfully; explicit processing boundaries and coherent FC components |
| **Total** | **11/20** | **16/20 — Good** | Scoped engineering assessment, not a WCAG compliance certificate |

## Verification

- TypeScript check: passed.
- Root document/draft regression tests: 16/16 passed, including preserved PDF form/metadata content, QR Unicode round-trip, bounded images, draft blob recovery, expiry, write ordering and staff scope isolation.
- Authentication tests: 9/9 passed, including email validation, code expiry/lockout, staff restrictions, cross-site requests and production demo protection.
- Production build: passed, with real title/description/theme values rather than literal environment placeholders.
- Bundled Impeccable detector: empty findings array in both the interim and final runs.
- Browser route matrix: all 20 routes at 320×740, 390×844, 768×1024, 844×390 and 1440×900 in both themes: **200 views, no horizontal page overflow**. These are entry/empty-state layout checks, not 200 complete document conversions.
- Scanner: imported two disposable images, created a PDF, reordered the pages and confirmed the old Save PDF action disappeared and Create PDF returned; reloaded, restored both pages, then cleared the draft. Corrupt single-photo input showed a visible recoverable error. Arrow-key crop movement was verified.
- Compression: updated PDF.js rendered a sample form PDF, local compression completed (2.89 KB → 2.61 KB), and final compression radio arrow navigation changed selection correctly.
- Image-to-PDF: multipage TIFF output completed after replacing jsPDF; independently parsed as two A4 pages with pdf-lib.
- QR generation: Unicode content generated successfully; decoding round-trip is covered by regression tests.
- Font: self-hosted Public Sans Variable loaded. Primary explanatory text and inputs use 16px, with secondary mobile text at least 14px. Scanner buttons met 44px minimum targets in the sampled populated layout.
- Dependency scan: zero known production npm advisories after removing jsPDF/DOMPurify and updating PDF.js. Development-tool advisories remain outside the shipped runtime; do not interpret the production result as an all-dependency zero.
- Compatibility: the locked PDF.js legacy browser build and matching worker are bundled with local decoder binaries, standard fonts and CMaps. Optional OCR/scanner/Word engines remain separate.

## Tradeoffs and remaining validation

The main JS download is much smaller. The offline precache is now approximately 8.9 MB uncompressed because it also contains matching PDF decoder/font assets. This is a background installation cost, distinct from the entry bundle. Larger scanner, OCR and Word-to-PDF engines still need their own download before offline use.

No real iPhone/Android camera, camera permission flow, OS share sheet, physical touch gesture, VoiceOver/NVDA session, low-memory stress benchmark or throttled-network field measurement was performed. Local browser emulation cannot establish those results. The PDF-to-Word server was not running in this review setup; that service requires its own deployment test.

Scanner drafts stay in the local browser and are scoped to the signed-in staff address. Sign-out clears that staff draft; workspace files reset between accounts. Recovery expires after 24 hours and expired data is removed when the scanner next opens. Clearing drafts on shared devices remains part of the visible workflow. This is browser-local storage, not an encrypted organization document repository.

## GitHub and hosting

Each phase was saved as a local commit on `codex/impeccable-refinement`. The repository includes a quality workflow for checks, tests, runtime dependency audit and build. The normal build keeps staff authentication enabled. The local review build disables authentication and PDF-to-Word only for local evaluation; that is not the production deployment configuration.

Railway dashboard access currently reaches a GitHub login screen. No deployment has been completed. For hosted staff testing, follow the existing README Railway setup: frontend Docker service plus private auth service, persistent auth volume, correct PUBLIC_URL and AUTH_SERVICE_URL, secure cookies, and PDF-to-Word disabled until its backend is deployed. Use configured staff email delivery for a real rollout; fixed demo codes belong only to a disposable test environment.

Before broad staff rollout, test one real iPhone and one representative Android phone: rear camera, permission denied/retry, photos including HEIC, 10–20 pages, shadows/small print, portrait/landscape, phone lock/app switching, draft recovery, downloaded-engine offline use and save/share. Include a keyboard and screen-reader pass and confirm hosted sign-in, logout isolation and production security headers.

### Publication attempt

Publication was attempted after the final audit. GitHub's connected integration rejected both tree creation and branch creation with HTTP 403 `Resource not accessible by integration`. The normal Git push also failed because no usable HTTPS credentials were available; the GitHub CLI's saved token is invalid. No branch, pull request or deployment was published by this run. The full checkpoint history remains saved locally on `codex/impeccable-refinement`.

The Railway browser tab is open at the GitHub sign-in step. Re-authentication is required before the hosted rollout can proceed. Source files, tests, workflow and deployment instructions are ready locally.
