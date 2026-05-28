FROM node:22-bookworm-slim AS build

WORKDIR /app

ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1

COPY package.json package-lock.json ./
COPY backend/package.json backend/package-lock.json ./backend/

RUN npm ci
RUN npm ci --prefix backend

COPY . .

RUN npm run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV APP_HOST=0.0.0.0
ENV APP_PORT=3001
ENV APP_SERVER_WEB=1
ENV APP_RUNTIME_MODE=server-multi-user
ENV APP_FRONTEND_DIST=/app/dist

COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts/serve-admin.mjs ./scripts/serve-admin.mjs
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/backend/package-lock.json ./backend/package-lock.json
COPY --from=build /app/backend/server.ts ./backend/server.ts
COPY --from=build /app/backend/src ./backend/src
COPY --from=build /app/backend/node_modules ./backend/node_modules
COPY --from=build /app/src/shared/workflow ./src/shared/workflow
WORKDIR /app

EXPOSE 3001 3002

CMD ["sh", "-c", "node /app/scripts/serve-admin.mjs & exec node --experimental-strip-types /app/backend/server.ts"]
