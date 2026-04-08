FROM node:20-alpine

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm prisma:generate

EXPOSE 3333

CMD ["sh", "-c", "pnpm prisma:db:push && pnpm --filter @dlq-organizer/api start"]

