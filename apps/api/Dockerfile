FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
COPY . .
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV DATABASE_URL=$DATABASE_URL
RUN npm run db:generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache su-exec
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY scripts/container-entrypoint.sh /usr/local/bin/vetlinx-entrypoint
RUN chmod +x /usr/local/bin/vetlinx-entrypoint
RUN mkdir -p /app/var/evidence && chown -R node:node /app/var
USER node
EXPOSE 4000
ENTRYPOINT ["/usr/local/bin/vetlinx-entrypoint"]
CMD ["node", "dist/src/main.js"]
