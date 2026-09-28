FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --chown=node:node package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node scripts/install-dc-b.sh ./scripts/install-dc-b.sh
RUN mkdir -p /var/lib/argus && chown -R node:node /var/lib/argus
USER node
CMD ["node", "dist/api/main.js"]
