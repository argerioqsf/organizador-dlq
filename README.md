# DLQ Organizer

Monorepo TypeScript para organizar DLQs recebidas no Slack, agrupar ocorrências técnicas em catálogo e tratar erros operacionais como `issues`.

## Stack

- `apps/api`: Fastify + Prisma + Postgres + Slack integration
- `apps/web`: React + Vite + TanStack Query
- `packages/shared`: tipos compartilhados entre backend e frontend

## O que o MVP entrega

- ingestão de mensagens do Slack via Events API
- backfill dos últimos 90 dias via `conversations.history`
- importação manual por arquivo ou texto colado na UI
- parser para mensagens no formato mostrado nas capturas
- catálogo técnico automático por `topic + kind + fingerprint`, com status próprio
- criação manual de `issues` a partir de um catálogo quando alguém for atuar no problema
- dashboard com ocorrências, indicadores e lista de issues
- área para editar issues, mudar status e adicionar ou remover DLQs

## Estrutura

```text
apps/
  api/
  web/
packages/
  shared/
```

## Variáveis de ambiente

Copie `.env.example` para `.env` e ajuste:

- `DATABASE_URL`
- `COOKIE_SECRET`
- `DEV_AUTH_BYPASS`
- `SLACK_SIGNING_SECRET`
- `SLACK_BOT_TOKEN`
- `SLACK_CHANNEL_ID`
- `SLACK_TEAM_ID`
- `SLACK_CLIENT_ID`
- `SLACK_CLIENT_SECRET`
- `SLACK_REDIRECT_URI`
- `WEB_ORIGIN`

## Rodando localmente

```bash
pnpm install
pnpm prisma:generate
pnpm prisma:db:push
pnpm dev
```

API: `http://localhost:3333`

Web: `http://localhost:5173`

Com `DEV_AUTH_BYPASS=true`, a UI entra direto em modo local e você pode testar sem configurar Slack.

## Teste manual sem Slack

1. Suba Postgres e a aplicação.
2. Abra `http://localhost:5173/manual-import`.
3. Cole uma ou várias mensagens copiadas do Slack, ou envie um arquivo `.txt`/`.log`.
4. Clique em `Importar conteúdo`.

O import manual usa o mesmo parser e a mesma lógica real de catálogo e vínculo manual com issues.

## Backfill inicial

```bash
pnpm backfill
```

## Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

O stack sobe:

- Postgres em `localhost:5432`
- aplicação publicada pelo reverse proxy em `http://localhost:8080`

## Principais rotas

- `POST /integrations/slack/events`
- `POST /api/manual-import`
- `GET /api/me`
- `GET /api/dashboard`
- `GET /api/occurrences`
- `GET /api/occurrences/:id`
- `PATCH /api/occurrences/:id/status`
- `POST /api/occurrences/:id/issue`
- `DELETE /api/occurrences/:id/issue`
- `GET /api/issues`
- `GET /api/issues/:id`
- `POST /api/issues`
- `PATCH /api/issues/:id`
- `POST /api/issues/:id/occurrences`
- `DELETE /api/issues/:id/occurrences/:occurrenceId`
- `GET /api/catalog`
- `PATCH /api/catalog/:id`
- `POST /api/catalog/:id/issues`

## Regras principais

- novas DLQs são agrupadas automaticamente em catálogos por assinatura técnica
- issues não são criadas automaticamente; elas são abertas manualmente a partir de um catálogo
- um mesmo catálogo pode ter várias issues ao longo do tempo
- novas ocorrências em um catálogo resolvido ou cancelado movem o catálogo para `pending`
- status da issue propaga apenas para as DLQs vinculadas a ela
- segredos em `Authorization`, tokens, cookies e headers sensíveis são mascarados antes de persistir

## Testes

```bash
pnpm test
```
