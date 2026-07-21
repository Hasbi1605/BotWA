FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY scripts/patch-baileys-pairing.js ./scripts/patch-baileys-pairing.js
# postinstall patches Baileys pairing Invalid buffer crash
RUN npm install

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY scripts/patch-baileys-pairing.js ./scripts/patch-baileys-pairing.js
RUN npm install --omit=dev \
    && apt-get purge -y python3 make g++ \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/dist ./dist
RUN addgroup --system rembugbot && adduser --system --ingroup rembugbot rembugbot \
    && mkdir -p /data/auth /data/temp && chown -R rembugbot:rembugbot /data /app
USER rembugbot
CMD ["node", "dist/index.js"]
