FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app

ARG PORT
ARG HOST
ENV PORT=${PORT}
ENV HOST=${HOST}
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --only=production --ignore-scripts && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

EXPOSE ${PORT}
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD curl -f http://${HOST}:${PORT}/health || exit 1

CMD ["npm", "start"]
