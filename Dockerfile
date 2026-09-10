# Frontend static build, for Railway (or any Docker host) — the whole
# app is a static Vite/PWA bundle; this just builds it and serves it.
# The pdf-to-word backend has its own separate Dockerfile under
# services/pdf-to-word/ — that's a distinct Railway service.

FROM node:20-alpine AS build
WORKDIR /app

# Railway does NOT auto-forward service variables into a Dockerfile
# build — each one needed here must be declared as an ARG and set as a
# variable on this Railway service (see DEPLOYMENT.md). Vite inlines
# these into the JS bundle at build time; there is no way to change them
# without rebuilding.
ARG VITE_APP_NAME
ARG VITE_APP_SHORT_NAME
ARG VITE_APP_DESCRIPTION
ARG VITE_THEME_COLOR
ARG VITE_PDF2WORD_API_URL
ARG VITE_PDF2WORD_API_KEY
ENV VITE_APP_NAME=$VITE_APP_NAME \
    VITE_APP_SHORT_NAME=$VITE_APP_SHORT_NAME \
    VITE_APP_DESCRIPTION=$VITE_APP_DESCRIPTION \
    VITE_THEME_COLOR=$VITE_THEME_COLOR \
    VITE_PDF2WORD_API_URL=$VITE_PDF2WORD_API_URL \
    VITE_PDF2WORD_API_KEY=$VITE_PDF2WORD_API_KEY

COPY package.json package-lock.json ./
RUN npm ci
COPY client ./client
COPY vite.config.ts tsconfig.json tailwind.config.ts postcss.config.js ./
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template

# Default for local `docker run`/testing — Railway overrides this with
# its own assigned port at runtime, same mechanism as the backend service.
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:${PORT}/ >/dev/null 2>&1 || exit 1
