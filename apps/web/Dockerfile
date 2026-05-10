# Production image for clinic-saas-web (Next.js App Router).
# Build from repo: docker build -f apps/web/Dockerfile apps/web
# Context must be apps/web (contains package.json + lockfile).

FROM node:20-alpine AS deps
WORKDIR /app
ARG SKIP_INSTALL=false
COPY package.json package-lock.json* ./
# package-lock غالبًا غير متزامن مع pnpm محليًا — npm install يولّد شجرة صالحة للبناء داخل الصورة
RUN if [ "$SKIP_INSTALL" = "true" ]; then mkdir -p node_modules; else npm install --legacy-peer-deps --prefer-offline --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 --no-audit --no-fund; fi

FROM node:20-alpine AS builder
WORKDIR /app
ARG SKIP_INSTALL=false
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN if [ "$SKIP_INSTALL" = "true" ] && [ ! -f node_modules/.package-lock.json ] && [ ! -d node_modules/next ]; then echo "SKIP_INSTALL=true requires local node_modules in build context"; exit 1; fi
# لا تستخدم `;` بين build و mkdir — إن فشل البناء كان mkdir ينجح وتُعتبر الطبقة ناجحة بلا .next/standalone
RUN mkdir -p public
RUN npm run build
RUN test -d .next/standalone || (echo "next build did not emit .next/standalone — check build logs above" && ls -la .next && exit 1)

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
