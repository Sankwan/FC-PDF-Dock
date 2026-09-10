import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig(({ mode }) => {
  // Loads .env, .env.<mode> (e.g. .env.acme, .env.acme-logistics) so each
  // sister company can ship its own name/theme with `vite build --mode acme`.
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const appName = env.VITE_APP_NAME || "Local PDF Toolkit";
  const appShortName = env.VITE_APP_SHORT_NAME || "PDF Toolkit";
  const appDescription =
    env.VITE_APP_DESCRIPTION ||
    "Merge, split, compress, and convert PDFs entirely in your browser. Nothing you open here is ever uploaded.";
  // Keep in sync with --brand in client/src/index.css
  const themeColor = env.VITE_THEME_COLOR || "#0d6e5c";

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["favicon.svg"],
        workbox: {
          // pdf.worker.min.mjs ships as .mjs — not in the default glob list.
          // Deliberately NOT precaching wasm/gz here: the OCR engine
          // (~9MB, public/tesseract/) and the office2pdf Word-to-PDF engine
          // (~47MB, client/src/lib/office2pdf-wasm/) are both big enough
          // that forcing every visitor to download them on first install
          // would be a bad trade for the ~90% of visits that touch neither
          // tool. Both are runtime-cached instead — fetched (and cached for
          // offline reuse) only the first time their tool is actually used.
          globPatterns: ["**/*.{js,mjs,css,html,svg,png,ico,woff2}"],
          // tesseract/'s own glue JS (tesseract-core-simd-lstm.wasm.js,
          // ~3.9MB) would otherwise match the "js" pattern above and get
          // swept into the precache manifest despite the intent above —
          // it's covered by the /tesseract/ runtimeCaching rule instead.
          globIgnores: ["**/tesseract/**"],
          // Google Fonts aren't part of the build output, so precaching can't
          // reach them — cache them at runtime instead, first hit onward.
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: "CacheFirst",
              options: { cacheName: "google-fonts-stylesheets" },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts-webfonts",
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              },
            },
            {
              // Local OCR engine (worker + WASM core + language data),
              // served from public/tesseract/ — same origin, not a CDN.
              urlPattern: /\/tesseract\//,
              handler: "CacheFirst",
              options: { cacheName: "ocr-engine" },
            },
            {
              // Local PDF-encryption engine (qpdf, C++/WASM), served from
              // public/qpdf/ — same origin, not a CDN.
              urlPattern: /\/qpdf\//,
              handler: "CacheFirst",
              options: { cacheName: "qpdf-engine" },
            },
            {
              // Local Word/Office-to-PDF engine (office2pdf, Rust/WASM),
              // emitted by Vite from client/src/lib/office2pdf-wasm/.
              urlPattern: /office2pdf.*\.wasm$/,
              handler: "CacheFirst",
              options: { cacheName: "office2pdf-engine" },
            },
          ],
        },
        manifest: {
          name: appName,
          short_name: appShortName,
          description: appDescription,
          theme_color: themeColor,
          background_color: "#ffffff",
          display: "standalone",
          start_url: "/",
          icons: [
            { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
            { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
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
    // `root` above) — without this, Vite looks for them in client/ and
    // silently leaves %VITE_...% placeholders in index.html unreplaced.
    envDir: path.resolve(__dirname),
    build: {
      outDir: path.resolve(__dirname, "dist"),
      emptyOutDir: true,
    },
  };
});
