/**
 * Single source of truth for brand strings shown inside the app.
 * The values themselves come from .env (see .env.example) so a
 * sister-company build only needs its own .env.<company> file —
 * nothing in the component code should change.
 */
export const brand = {
  name: import.meta.env.VITE_APP_NAME || "PDFDock",
  shortName: import.meta.env.VITE_APP_SHORT_NAME || "PDFDock",
  description:
    import.meta.env.VITE_APP_DESCRIPTION ||
    "Merge, split, compress, and convert PDFs entirely in your browser.",
};
