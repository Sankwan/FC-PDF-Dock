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
    "Document tools for Forestry Commission staff. Convert, scan and prepare documents on your device.",
  logo: "/fc/fc-logo.png",
  mark: "/fc/fc-mark.png",
};

const demoMode = env.VITE_DEMO_MODE === "true";
export const features = {
  demoMode,
  authRequired: (env.VITE_AUTH_REQUIRED ?? "true") !== "false",
  staffEmailDomain: (env.VITE_STAFF_EMAIL_DOMAIN || "fc.gov.gh").toLowerCase(),
  // Local PDF-to-Word is always available. The old flag only described the server converter.
  pdfToWord: true,
};

export const conversionServer = demoMode ? "Railway test server" : "FC conversion server";
