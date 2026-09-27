/**
 * Single source of truth for brand strings shown inside the app. Values
 * come from .env (see .env.example); the defaults below are the
 * Forestry Commission build.
 */
const env = import.meta.env;

export const brand = {
  name: env.VITE_APP_NAME || "PDFDock",
  shortName: env.VITE_APP_SHORT_NAME || "FC PDFDock",
  orgName: env.VITE_ORG_NAME || "Forestry Commission",
  description:
    env.VITE_APP_DESCRIPTION ||
    "Document tools for Forestry Commission staff. Files are processed on your own device and never uploaded.",
  logo: "/fc/fc-logo.png",
  mark: "/fc/fc-mark.png",
};

export const features = {
  authRequired: (env.VITE_AUTH_REQUIRED ?? "true") !== "false",
  staffEmailDomain: (env.VITE_STAFF_EMAIL_DOMAIN || "fc.gov.gh").toLowerCase(),
  pdfToWord: (env.VITE_PDF2WORD_ENABLED ?? "true") !== "false",
};
