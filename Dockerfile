# AlphaDesk — production image.
#
# Stage 1 builds the React client; stage 2 is a tiny runtime that serves the
# JSON API and the built static client from one process. The server itself has
# ZERO npm dependencies, so the runtime stage installs nothing.
#
#   docker build -t alphadesk .
#   docker run -p 8787:8787 alphadesk      # -> http://localhost:8787
#
# The server honors PORT (default 8787) and HOST (default 0.0.0.0), so hosting
# platforms can inject their own port.

# syntax=docker/dockerfile:1

# ---- Stage 1: build the client -------------------------------------------------
FROM node:24-slim AS client
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY client/ ./
RUN npm run build

# --- Stage 2: runtime -------------------------------------------------------
FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    PORT=8787 \
    ALPHADESK_LIVE=1
WORKDIR /app

# Zero-dependency server + the client build produced above.
COPY server/ ./server/
COPY --from=client /app/client/dist ./client/dist

# Writable dir for user state + market caches. Mount a volume here to persist
# it across restarts/upgrades (Render Disk / Fly Volume / etc.).
RUN mkdir -p /app/server/data && chown -R node:node /app/server /app/client
USER node

EXPOSE 8787
# Liveness probe (never touches the engine, so it is fast during warm-up).
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/src/index.js"]
