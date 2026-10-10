FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app

ARG PORT=3000
ARG HOST=0.0.0.0
ENV PORT=${PORT}
ENV HOST=${HOST}
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --only=production --ignore-scripts && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY scripts/healthcheck.mjs ./scripts/healthcheck.mjs
COPY --from=builder /app/node_modules ./node_modules

EXPOSE ${PORT}
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD ["node", "scripts/healthcheck.mjs"]

CMD ["npm", "start"]
