# Impeccable refinement checkpoints

Scope: preserve the existing FC identity and improve the complete staff web/PWA tool interface.

## 1. Harden

- Scanner drafts use local IndexedDB, restore/discard controls, expiry on recovery, explicit local-retention notice and visible storage failure feedback.
- Page reordering invalidates exports; processing disables concurrent mutations. Single/multipage image decoding shares guarded format/size checks.
- Added crop keyboard controls, non-drag redaction/signature placement fields, signature image input, shared focus rings, skip navigation and corrected settings disclosure semantics.
- Corrected light muted text, dark action contrast, missing-route styling and default HTML metadata.
- Validation: TypeScript, 15 regression tests and production build passed. Browser confirmed export invalidation after reorder, two-page recovery after reload, and arrow-key crop movement. Physical phone cameras remain untested.
