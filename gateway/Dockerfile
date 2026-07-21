FROM node:20-bookworm-slim AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

FROM base AS runtime
COPY dist/ ./dist/
COPY config/ ./config/
RUN addgroup --system rembugbot && adduser --system --ingroup rembugbot rembugbot
RUN mkdir -p /data/auth /data/temp && chown -R rembugbot:rembugbot /data
USER rembugbot
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
