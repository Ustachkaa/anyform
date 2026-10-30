# API + worker image. Both containers run from this image with different commands.
# Conversion engines are installed here so the worker can handle every pair in
# the registry: ffmpeg (video/audio), LibreOffice (office docs), pandoc (text
# formats), calibre (ebooks), poppler (pdf → image), ImageMagick (bmp/ico/heic).

FROM node:22-bookworm-slim AS base
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      libreoffice-writer libreoffice-calc libreoffice-impress \
      pandoc \
      calibre \
      poppler-utils \
      imagemagick \
      libheif1 \
      fonts-dejavu fonts-liberation fonts-noto-core \
      ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --workspaces --include-workspace-root --omit=optional || npm install --workspaces --include-workspace-root

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @anyform/shared \
 && npx prisma generate --config apps/api/prisma.config.ts \
 && npm run build -w @anyform/api

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/prisma.config.ts ./apps/api/prisma.config.ts
# Engine security config (ImageMagick policy.xml)
COPY --from=build /app/apps/api/config ./apps/api/config
RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]
