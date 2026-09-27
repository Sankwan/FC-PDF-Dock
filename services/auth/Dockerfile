FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src

# The SQLite file lives on a named volume (see deploy/headoffice).
RUN mkdir -p /app/data && chown -R node:node /app
USER node

ENV PORT=8100 DB_FILE=/app/data/auth.sqlite
EXPOSE 8100
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O- "http://127.0.0.1:${PORT}/api/auth/health" >/dev/null 2>&1 || exit 1

CMD ["node", "src/server.js"]
