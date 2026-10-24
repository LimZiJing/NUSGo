# Local Phase 0 rehearsal image; production networking is defined separately in #236.
FROM node:22-bookworm-slim@sha256:a6385bc33f0f9d6a08482c87f52baee537a9184e2b47dea1ed97caac62f8960c AS package
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY shared/package.json shared/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --omit=dev --workspace @navus/backend --workspace @navus/shared --ignore-scripts
COPY shared/src shared/src
COPY scripts/generate-shuttle-timing.mjs scripts/generate-shuttle-timing.mjs
COPY frontend/public/data/bus-stops.json frontend/public/data/bus-stops.json
COPY frontend/public/data/lta-public-bus-stops.json frontend/public/data/lta-public-bus-stops.json
COPY frontend/public/data/venues.json frontend/public/data/venues.json
COPY frontend/public/data/buildings.json frontend/public/data/buildings.json
COPY frontend/public/data/shuttle-network.json frontend/public/data/shuttle-network.json
COPY frontend/public/data/shuttle-routes.geojson frontend/public/data/shuttle-routes.geojson
COPY frontend/public/data/walking-stop-graph.json frontend/public/data/walking-stop-graph.json
RUN node --experimental-strip-types scripts/generate-shuttle-timing.mjs --allow-geometry-fallback

FROM node:22-bookworm-slim@sha256:a6385bc33f0f9d6a08482c87f52baee537a9184e2b47dea1ed97caac62f8960c
WORKDIR /app
COPY --from=package /app/node_modules node_modules
COPY package.json ./
COPY shared/package.json shared/package.json
COPY --from=package /app/shared/src shared/src
COPY backend/package.json backend/package.json
COPY backend/src backend/src
COPY --from=package /app/frontend/public/data data
ENV NODE_ENV=development HOST=0.0.0.0 PORT=3001 NAVUS_DATA_DIR=/app/data NAVUS_DATA_VERSION=development
USER node
WORKDIR /app/backend
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--experimental-strip-types", "src/server.ts"]
