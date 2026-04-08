# DLQ Organizer

Monorepo TypeScript para organizar DLQs recebidas no Slack, agrupar erros recorrentes e tratar erros operacionais como `issues`.

## Stack

- `apps/api`: Fastify + Prisma + Postgres + Slack integration
- `apps/web`: React + Vite + TanStack Query
- `packages/shared`: tipos compartilhados entre backend e frontend

## O que o MVP entrega

- ingestão de mensagens do Slack via Events API
- backfill dos últimos 90 dias via `conversations.history`
- importação manual por arquivo ou texto colado na UI
- parser para mensagens no formato mostrado nas capturas
- agrupamento automático de erros recorrentes por `topic + kind + fingerprint`, com status próprio
- criação manual de `issues` a partir de um erro recorrente quando alguém for atuar no problema
- dashboard com DLQs, indicadores e lista de issues
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

Web: `https://localhost:5173`

Com `DEV_AUTH_BYPASS=true`, a UI entra direto em modo local e você pode testar sem configurar Slack.
Se o navegador avisar sobre o certificado local gerado pelo Vite, aceite a exceção uma vez para continuar.

## Teste manual sem Slack

1. Suba Postgres e a aplicação.
2. Abra `https://localhost:5173/manual-import`.
3. Cole uma ou várias mensagens copiadas do Slack, ou envie um arquivo `.txt`/`.log`.
4. Clique em `Importar conteúdo`.

O import manual usa o mesmo parser e a mesma lógica real de erros recorrentes e vínculo manual com issues.

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
- API em `localhost:3333`
- aplicação publicada pelo reverse proxy em `http://localhost:8080`

No `docker compose`, a API usa `postgres` como host do banco dentro da rede interna do Docker, mesmo que seu `.env` local use `localhost` fora dos containers.

## Principais rotas

- `POST /integrations/slack/events`
- `POST /api/manual-import`
- `POST /api/slack/backfill`
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

- novas DLQs são agrupadas automaticamente em erros recorrentes por assinatura técnica
- issues não são criadas automaticamente; elas são abertas manualmente a partir de um erro recorrente
- um mesmo erro recorrente pode ter várias issues ao longo do tempo
- novas DLQs em um erro recorrente resolvido ou cancelado movem esse erro recorrente para `pending`
- status da issue propaga apenas para as DLQs vinculadas a ela
- o backfill histórico do Slack pode ser executado por comando ou pela tela de configurações, escolhendo a quantidade de dias
- segredos em `Authorization`, tokens, cookies e headers sensíveis são mascarados antes de persistir

## Como funciona a ingestão em tempo real do Slack

- o backend expõe `POST /integrations/slack/events`
- o Slack envia para essa rota sempre que a app recebe eventos configurados em `Event Subscriptions`
- o backend valida a assinatura com `SLACK_SIGNING_SECRET`
- eventos `message` do canal configurado em `SLACK_CHANNEL_ID` são parseados e persistidos
- a ingestão começa automaticamente quando a API está no ar e a URL pública do Slack aponta para ela; não existe processo separado para "ligar"

Para observar funcionando:

- veja os logs da API
- no handshake inicial, você verá `Slack Events API URL verification received`
- a cada evento recebido, verá `Slack event callback received`
- depois do processamento, verá `Slack event processed` com `status: "ingested"` ou `status: "ignored"`

## Teste local com túnel

Com o `docker compose` ativo, a forma mais simples de expor a API local para o Slack é:

```bash
ngrok http 3333
```

Depois use a URL HTTPS gerada pelo túnel em:

- `Event Subscriptions > Request URL`
  `https://SEU-TUNNEL/integrations/slack/events`
- `SLACK_REDIRECT_URI`
  `https://SEU-TUNNEL/auth/slack/callback`

## Testes

```bash
pnpm test
```
