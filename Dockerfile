FROM node:20-alpine AS base

# ── Install dependencies ──────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ── Generate Prisma client + build Next.js ────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate the Prisma TypeScript client (output: src/generated/prisma)
RUN ./node_modules/.bin/prisma generate

# NEXT_PUBLIC_* vars must be present at build time
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ── Production runtime ────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Standalone output — self-contained server with traced dependencies
COPY --from=builder /app/.next/standalone ./
# Static assets (.next/static is not bundled into standalone)
COPY --from=builder /app/.next/static ./.next/static
# Public folder (images, favicons, etc.)
COPY --from=builder /app/public ./public
# Create the uploads mount point — docker-compose bind-mounts the real dir here
RUN mkdir -p ./public/uploads

EXPOSE 3000
CMD ["node", "server.js"]

# ── Maintenance: one-off scripts (DB imports, enrichments, audits) ─────────────
FROM base AS maintenance
WORKDIR /app

# All node_modules including devDeps (tsx, dotenv, prisma adapter)
COPY --from=deps /app/node_modules ./node_modules
# Scripts + config files they read at runtime
COPY scripts/ ./scripts/
COPY config/ ./config/
COPY prisma/ ./prisma/
# Pre-generated Prisma client — scripts import from src/generated/prisma
COPY --from=builder /app/src/generated/ ./src/generated/
# package.json so `npm run <script>` works
COPY package.json ./

CMD ["sh"]
