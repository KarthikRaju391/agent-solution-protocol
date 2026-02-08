FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/protocol/package.json packages/protocol/tsconfig.json ./packages/protocol/
COPY apps/server/package.json apps/server/tsconfig.json ./apps/server/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY packages/protocol/src ./packages/protocol/src
COPY apps/server/src ./apps/server/src
RUN pnpm build --filter @asp/server

FROM base AS production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/protocol/node_modules ./packages/protocol/node_modules
COPY --from=deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=build /app/packages/protocol/dist ./packages/protocol/dist
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY packages/protocol/package.json ./packages/protocol/
COPY apps/server/package.json ./apps/server/
COPY package.json pnpm-workspace.yaml ./

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "apps/server/dist/index.js"]
