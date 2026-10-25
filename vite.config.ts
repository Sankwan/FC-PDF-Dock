import { cpSync, mkdirSync } from "node:fs";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig(({ mode }) => {
  // Decoder binaries, standard fonts and CMaps must match the bundled
  // PDF.js worker. Copy from the locked dependency for dev and production.
  const pdfAssets = path.resolve(__dirname, "client/public/pdfjs-assets");
  mkdirSync(pdfAssets, { recursive: true });
  for (const directory of ["wasm", "cmaps", "standard_fonts", "iccs"]) {
    cpSync(path.resolve(__dirname, "node_modules/pdfjs-dist", directory), path.join(pdfAssets, directory), { recursive: true });
  }

  const env = loadEnv(mode, process.cwd(), "VITE_");
  const appName = env.VITE_APP_NAME || "PDFDock";
  const orgName = env.VITE_ORG_NAME || "Forestry Commission";
  const appShortName = env.VITE_APP_SHORT_NAME || "FC PDFDock";
  const appDescription =
    env.VITE_APP_DESCRIPTION ||
    "Document tools for Forestry Commission staff. Most tools process files on your device; PDF to Word uses the FC server.";
  // Keep in sync with --chrome in client/src/index.css
  const themeColor = env.VITE_THEME_COLOR || "#0E2516";

  // Local development only: where services/auth and services/pdf-to-word
  // listen, so the same-origin /api/* paths used in production also work
  // under `npm run dev`. In production nginx does this (deploy/headoffice/).
  const devAuthTarget = process.env.DEV_AUTH_URL || "http://127.0.0.1:8100";
  const devPdf2WordTarget = process.env.DEV_PDF2WORD_URL || "http://127.0.0.1:8000";

  return {
    plugins: [
      react(),
      {
        name: "fc-html-defaults",
        transformIndexHtml: {
          order: "pre",
          handler: (html) => {
            const values: Record<string, string> = { VITE_APP_NAME: appName, VITE_ORG_NAME: orgName, VITE_APP_DESCRIPTION: appDescription, VITE_THEME_COLOR: themeColor };
            return html.replace(/%VITE_(?:APP_NAME|ORG_NAME|APP_DESCRIPTION|THEME_COLOR)%/g, key => values[key.slice(1, -1)].replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!)));
          },
        },
      },
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["icons/favicon-64.png", "icons/apple-touch-icon.png", "fc/fc-logo.png", "fc/fc-mark.png"],
        workbox: {
          // pdf.worker.min.mjs ships as .mjs, which isn't in the default glob
          // list. Large engines (OCR ~9MB, Word to PDF ~47MB, scanner ~13MB)
          // are NOT precached: they are runtime-cached the first time a tool
          // uses them, or all at once when staff press "Download tools for
          // offline use" (client/src/lib/offlinePrep.ts).
          globPatterns: ["**/*.{js,mjs,css,html,svg,png,ico,woff2}", "pdfjs-assets/**/*"],
          // These folders' own JS glue would otherwise match "js" above.
          globIgnores: ["**/tesseract/**", "**/opencv/**", "**/fc/fc-logo-src.jpg"],
          // Sign-in and PDF to Word must always reach the server, never an
          // offline fallback page.
          navigateFallbackDenylist: [/^\/api\//],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          runtimeCaching: [
            {
              // Local OCR engine (worker + WASM core + language data),
              // served from public/tesseract/: same origin, not a CDN.
              urlPattern: /\/tesseract\//,
              handler: "CacheFirst",
              options: { cacheName: "ocr-engine" },
            },
            {
              // Local PDF encryption engine (qpdf, C++/WASM), public/qpdf/.
              urlPattern: /\/qpdf\//,
              handler: "CacheFirst",
              options: { cacheName: "qpdf-engine" },
            },
            {
              // Local Word-to-PDF engine (office2pdf, Rust/WASM), emitted by
              // Vite from client/src/lib/office2pdf-wasm/.
              urlPattern: /office2pdf.*\.wasm$/,
              handler: "CacheFirst",
              options: { cacheName: "office2pdf-engine" },
            },
            {
              // Document scanner engine (OpenCV.js), public/opencv/.
              urlPattern: /\/opencv\//,
              handler: "CacheFirst",
              options: { cacheName: "scanner-engine" },
            },
          ],
        },
        manifest: {
          name: `${appName} · ${orgName}`,
          short_name: appShortName,
          description: appDescription,
          theme_color: themeColor,
          background_color: "#ffffff",
          display: "standalone",
          start_url: "/",
          icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "client", "src"),
      },
    },
    root: path.resolve(__dirname, "client"),
    // .env files live at the project root, not under client/ (which is
    // `root` above); without this, Vite looks for them in client/ and
    // silently leaves %VITE_...% placeholders in index.html unreplaced.
    envDir: path.resolve(__dirname),
    server: {
      proxy: {
        "/api/auth": { target: devAuthTarget },
        "/api/pdf2word": {
          target: devPdf2WordTarget,
          rewrite: (p) => p.replace(/^\/api\/pdf2word/, ""),
          headers: { "X-API-Key": process.env.DEV_PDF2WORD_API_KEY || "" },
        },
      },
    },
    build: {
      outDir: path.resolve(__dirname, "dist"),
      emptyOutDir: true,
    },
  };
});
