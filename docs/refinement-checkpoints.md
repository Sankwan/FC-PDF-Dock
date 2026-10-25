# Impeccable refinement checkpoints

Scope: preserve the existing FC identity and improve the complete staff web/PWA tool interface.

## 1. Harden

- Scanner drafts use local IndexedDB, restore/discard controls, expiry on recovery, explicit local-retention notice and visible storage failure feedback.
- Page reordering invalidates exports; processing disables concurrent mutations. Single/multipage image decoding shares guarded format/size checks.
- Added crop keyboard controls, non-drag redaction/signature placement fields, signature image input, shared focus rings, skip navigation and corrected settings disclosure semantics.
- Corrected light muted text, dark action contrast, missing-route styling and default HTML metadata.
- Validation: TypeScript, 15 regression tests and production build passed. Browser confirmed export invalidation after reorder, two-page recovery after reload, and arrow-key crop movement. Physical phone cameras remain untested.

## 2. Adapt

- Preserved self-hosted Public Sans; primary explanatory text and text-entry fields use 16px, secondary mobile text uses at least 14px.
- Shared buttons and editing actions have 44px minimum hit areas. Image actions remain visible without hover; filenames can shrink within their layout.
- Narrow quick-start layouts switch to one column where two labels would truncate.
- Validation: TypeScript and all 15 tests passed. Populated scanner checked at 320, 390, 768, 844 landscape and 1440 CSS pixels: no page overflow and no sub-44px scanner buttons (checkbox visuals intentionally retain their associated-label hit area). Phone/tablet text-field floor consolidated after this check.
