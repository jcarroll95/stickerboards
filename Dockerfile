# Stickerboards: one image with the API serving the built web app (server.js already does
# this when NODE_ENV=production). Built by .github/workflows/docker.yml into GHCR.
#
#   docker build -t stickerboards .
#   docker run -p 5050:5050 --env-file apps/api/config/config.env stickerboards

# ---- build: install everything once, build the web bundle -------------------------------
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/images-pipeline/package.json packages/images-pipeline/
COPY packages/insight-engine/package.json packages/insight-engine/
RUN npm ci --no-audit --no-fund
COPY apps/web apps/web
# VITE_ASSETS_BASE_URL is deliberately unset: assets default to /assets and ship in the bundle.
RUN npm -w stickerboards-web run build

# ---- runtime: API production deps + API source + web dist -------------------------------
FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    PORT=5050 \
    FILE_UPLOAD_PATH=/tmp/uploads
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/images-pipeline/package.json packages/images-pipeline/
COPY packages/insight-engine/package.json packages/insight-engine/
RUN npm -w stickerboards-api ci --omit=dev --ignore-scripts --no-audit --no-fund \
 && npm cache clean --force
COPY apps/api apps/api
COPY --from=build /app/apps/web/dist apps/web/dist
RUN mkdir -p /tmp/uploads && chown -R node:node /tmp/uploads
USER node
WORKDIR /app/apps/api
EXPOSE 5050
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
