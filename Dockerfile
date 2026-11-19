# The PDFDock web app: builds the static Vite/PWA bundle and serves it with
# nginx. For the Forestry Commission head-office setup (HTTPS, sign-in and
# PDF to Word behind the same address) use deploy/headoffice/, which builds
# this image and mounts its own nginx configuration over the default one.

FROM node:22-alpine AS build
WORKDIR /app

# Vite inlines VITE_* values into the JavaScript at build time, so they are
# build arguments. None of them are secrets.
ARG VITE_APP_NAME="PDFDock"
ARG VITE_APP_SHORT_NAME="FC PDFDock"
ARG VITE_ORG_NAME="Forestry Commission"
ARG VITE_APP_DESCRIPTION="Document tools for Forestry Commission staff. Convert, scan and prepare documents on your device."
ARG VITE_THEME_COLOR="#0E2516"
ARG VITE_AUTH_REQUIRED="true"
ARG VITE_DEMO_MODE="false"
ARG VITE_STAFF_EMAIL_DOMAIN="fc.gov.gh"
ARG VITE_PDF2WORD_ENABLED="true"
ENV VITE_APP_NAME=$VITE_APP_NAME \
    VITE_APP_SHORT_NAME=$VITE_APP_SHORT_NAME \
    VITE_ORG_NAME=$VITE_ORG_NAME \
    VITE_APP_DESCRIPTION=$VITE_APP_DESCRIPTION \
    VITE_THEME_COLOR=$VITE_THEME_COLOR \
    VITE_AUTH_REQUIRED=$VITE_AUTH_REQUIRED \
    VITE_DEMO_MODE=$VITE_DEMO_MODE \
    VITE_STAFF_EMAIL_DOMAIN=$VITE_STAFF_EMAIL_DOMAIN \
    VITE_PDF2WORD_ENABLED=$VITE_PDF2WORD_ENABLED

COPY package.json package-lock.json ./
# kokoro-js brings in onnxruntime-node, whose install script tries to download a
# GPU build. The app only uses ONNX Runtime in the browser, so skip it.
ENV ONNXRUNTIME_NODE_INSTALL_CUDA=skip
RUN npm ci
COPY client ./client
COPY vite.config.ts tsconfig.json tailwind.config.ts postcss.config.js ./
COPY scripts/vendor-kokoro.mjs ./scripts/
# The Read PDF natural voice model (~92 MB), served by us, not fetched from elsewhere.
RUN npm run vendor:kokoro
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/headoffice/security-headers.conf /etc/nginx/security-headers.conf

ENV PORT=8080 AUTH_SERVICE_URL=http://auth:8100 \
    PDF2WORD_SERVICE_URL=http://pdf2word:8000 \
    PDF2WORD_PUBLIC_PILOT=false PDF2WORD_API_KEY="" \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:${PORT}/ >/dev/null 2>&1 || wget -q --no-check-certificate -O- https://127.0.0.1/ >/dev/null 2>&1 || exit 1
