# ── Main application image ────────────────────────────────────────────────────
FROM node:22-alpine AS app

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npx prisma generate

EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push && npm exec prisma db seed && npm run build && npm run start"]


# ── Maintenance image: one-off DB scripts, imports, audits ───────────────────
FROM node:22-alpine AS maintenance

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npx prisma generate

CMD ["sh"]
