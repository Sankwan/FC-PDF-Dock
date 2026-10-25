# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Forestry Commission (Ghana) staff using phones and computers to scan, prepare, convert and manage official documents. Specific pilot teams and rollout order remain undecided.

## Product Purpose

FC PDFDock helps staff complete everyday document tasks in one organization-branded application. Success means staff can produce usable, readable documents through clear workflows while understanding where their files are processed.

## Positioning

An FC-specific document toolkit combining official branding and letterhead workflows with practical PDF, image and scanning tools. Most processing runs on the staff member's own device. Document conversion runs on-device, including PDF-to-Word. Staff authentication requires the sign-in service; offline processing requires cached application and engine assets.

## Operating Context

- Staff work on desktop and mobile browsers; the application supports installation as a PWA.
- Typical work includes scanning paper, preparing official letters, organizing PDF pages, converting documents, protecting or redacting files, and saving or sharing results.
- Scanner and OCR engines are downloaded on demand or through offline preparation. Offline use depends on required assets being cached; server-backed features require connectivity.
- Staff sign-in uses an official email address and an emailed code when authentication is enabled. Development and test configurations are not evidence of production rollout.

## Capabilities and Constraints

- Existing routes cover scanning, local OCR, letterhead, merge/split/page organization, compression, images, watermarking, protection, redaction, signatures, Word conversion, PDF properties, PDF forms and QR codes.
- Capability descriptions record implementation, not universal quality guarantees. Physical-phone scanner reliability and document-conversion fidelity require representative testing.
- Process files on-device wherever practical. Clearly identify any server processing in the relevant workflow.
- PDF-to-Word has a browser implementation with editable text/simple tables and page-image output, plus local English OCR for scans. Complex layouts and fonts may require correction. The optional legacy server converter remains in the repository but is not called by the frontend.
- AI analysis and a shared document library are proposed features, not current capabilities. Inference location, model choice, storage, permissions and retention remain open decisions.
- The platform remains web/PWA in this product record. Separate native applications have not been approved as a product commitment.
- The FC checkout and the original public v1 deployment are distinct. Do not describe local work as deployed without verification.

## Brand Commitments

- Preserve the existing FC PDFDock identity, Forestry Commission logos and official-document formatting. The user selected FC-PDF-Dock as the visual baseline.
- Use the existing brand configuration and assets rather than inventing an organization identity.
- Prefer clear, practical language that helps staff complete their task and understand errors or processing requirements.
- Preserve confirmation warnings for division contact details that have not been verified; do not invent official details.

## Evidence on Hand

- `README.md`: implemented tools, development instructions, processing boundaries and deployment setup.
- `client/src/brand.ts`: application and organization names, feature defaults and logo paths.
- `client/public/fc/`: existing FC artwork and marks.
- `client/src/fc/org.ts`: organization and division letterhead data, including confirmation status.
- `client/src/App.tsx`: current application routes and authentication gate.
- `client/src/pages/ScanDocument.tsx`, `client/src/lib/scanner.ts` and `client/src/lib/scanExport.ts`: scanner implementation.
- `vite.config.ts` and `client/src/lib/offlinePrep.ts`: PWA and offline asset behavior.
- `services/auth/`, `services/pdf-to-word/` and `deploy/headoffice/`: existing service and deployment sources.
- The owner confirmed the product brief during Impeccable initialization. There is no confirmed organization-wide adoption, scanner device certification or AI quality benchmark in this brief; future interfaces must not fabricate these claims.

## Product Principles

1. Help staff finish a document task with clear steps, understandable feedback and a usable output.
2. Prefer device processing and communicate exceptions accurately at the point of use.
3. Preserve FC identity and distinguish verified official information from editable or unconfirmed data.
4. Treat phone use and desktop use as core workflows within the same web product.
5. Distinguish implemented, tested, deployed and proposed capabilities in product language.
