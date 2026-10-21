FROM oven/bun:1.4 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN ./node_modules/.bin/prisma generate && ./node_modules/.bin/next build

# Migration job target. Kept separate from the runner so the production image
# does not need the Prisma CLI or dev dependencies. docker-compose runs this
# once before the app starts; hosted deployments should run the equivalent
# `bun run db:deploy` release step before rolling out.
FROM deps AS migrate
WORKDIR /app
COPY prisma.config.ts ./
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

EXPOSE 3000

ENV PORT "3000"
ENV HOSTNAME "0.0.0.0"
STOPSIGNAL SIGTERM

USER nextjs
CMD ["node", "server.js"]
