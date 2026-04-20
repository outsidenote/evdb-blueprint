# Stage 1: install all deps + build
FROM node:24-slim AS build
WORKDIR /app
COPY package*.json ./
COPY .npmrc* ./
RUN npm ci --legacy-peer-deps
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

# Stage 2: runtime
FROM node:24-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends dumb-init \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 1001 appuser \
    && useradd --uid 1001 --gid 1001 --create-home appuser

WORKDIR /app

COPY --from=build --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=build --chown=appuser:appuser /app/dist ./dist
COPY --chown=appuser:appuser package*.json ./

USER appuser

ENV NODE_ENV=production
ENV ACTIVE_CONTEXT=*
EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
