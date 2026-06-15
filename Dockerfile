# ---- Stage 1: Dependencies ----
FROM node:20.19-alpine3.21 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# ---- Stage 2: Build ----
FROM node:20.19-alpine3.21 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env (defaults; override at runtime)
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- Stage 3: Production ----
FROM node:20.19-alpine3.21 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=4000

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# 出題傾向レポート + 挿絵PNG (pptx/ 配下) を同梱
# build context の pptx-assets/ を deploy.sh が自動コピーする
COPY --from=builder /app/pptx-assets ./pptx-assets

# Next.js runtime cache directory
RUN mkdir -p .next/cache && chown nextjs:nodejs .next/cache

USER nextjs
EXPOSE 4000

CMD ["sh", "-c", "HOSTNAME=0.0.0.0 node server.js"]
