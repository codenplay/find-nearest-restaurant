# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY data ./data
RUN npm run build

FROM base AS production-deps
COPY package.json package-lock.json ./
# --ignore-scripts: `prisma` (the CLI needed by the postinstall's `prisma generate`) is a
# devDependency and isn't installed here. The generated client is copied from the `build`
# stage below instead, which does have the CLI and already ran `prisma generate`.
RUN npm ci --omit=dev --ignore-scripts

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S app && adduser -S app -G app
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY data ./data

USER app
EXPOSE 3000
ENV HOST=0.0.0.0 PORT=3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
