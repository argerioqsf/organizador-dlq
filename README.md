# DLQ Organizer

Monorepo TypeScript para centralizar DLQs recebidas no Slack, agrupar erros recorrentes e acompanhar tratativas via issues.

## O que o projeto faz

- recebe mensagens do Slack via Events API
- faz backfill de mensagens antigas do canal via `conversations.history`
- permite importação manual de mensagens copiadas do Slack
- agrupa várias DLQs equivalentes em `Erros recorrentes`
- permite abrir `Issues` para tratar um erro recorrente
- expõe dashboard, listagem de DLQs, erros recorrentes, issues e configurações

## Stack

- `apps/api`: Fastify + Prisma + Postgres + integração com Slack
- `apps/web`: React + Vite + TanStack Query
- `packages/shared`: tipos compartilhados entre API e frontend

## Estrutura

```text
apps/
  api/
  web/
packages/
  shared/
```

## Pré-requisitos

- Node.js 20+
- `pnpm`
- Docker e Docker Compose

## Variáveis de ambiente

Copie o arquivo de exemplo:

```bash
cp .env.example .env
```

As variáveis mais importantes para rodar localmente são:

- `DATABASE_URL`
- `COOKIE_SECRET`
- `DEV_AUTH_BYPASS`
- `WEB_ORIGIN`
- `PORT`

Para desenvolvimento local sem depender do login do Slack, o setup mínimo pode ficar assim:

```env
NODE_ENV=development
PORT=3333
WEB_ORIGIN=https://localhost:5173
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dlq_organizer?schema=public
COOKIE_SECRET=replace-me-with-a-long-random-secret
DEV_AUTH_BYPASS=true
VITE_API_BASE_URL=
```

Com isso:

- a API sobe em `http://localhost:3333`
- o frontend sobe em `https://localhost:5173`
- a autenticação via Slack é ignorada localmente

## Rodando localmente em desenvolvimento

Esse é o fluxo recomendado para desenvolvimento.

### 1. Instale as dependências

```bash
pnpm install
```

### 2. Suba apenas o Postgres no Docker

O `pnpm dev` não sobe o banco. Ele sobe somente API e frontend.  
Então, antes de tudo, levante o Postgres:

```bash
docker compose up -d postgres
```

Se quiser confirmar que o banco subiu:

```bash
docker compose ps
```

### 3. Gere o client do Prisma

```bash
pnpm prisma:generate
```

### 4. Aplique o schema no banco

```bash
pnpm prisma:db:push
```

### 5. Suba API e frontend em modo dev

```bash
pnpm dev
```

Isso sobe:

- API: `http://localhost:3333`
- Frontend: `https://localhost:5173`

### 6. Abra a aplicação

Abra:

```text
https://localhost:5173
```

Como o Vite usa HTTPS local com certificado de desenvolvimento, o navegador pode mostrar um aviso na primeira vez. Aceite a exceção para continuar.

## Resumo rápido do fluxo local

Se você só quiser o caminho curto:

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres
pnpm prisma:generate
pnpm prisma:db:push
pnpm dev
```

## O que o `pnpm dev` sobe

O comando:

```bash
pnpm dev
```

executa em paralelo:

- `@dlq-organizer/api`
- `@dlq-organizer/web`

Ele **não** sobe o Postgres. Por isso o banco precisa estar rodando antes, normalmente com Docker.

## Desenvolvimento sem Slack

Se `DEV_AUTH_BYPASS=true`, você consegue testar a aplicação sem configurar OAuth do Slack.

Isso é útil para:

- importar conteúdo manualmente
- validar layout e regras do sistema
- testar DLQs e erros recorrentes localmente

## Importação manual sem Slack

Mesmo sem integração ativa com Slack, você pode testar o parser e as regras da aplicação pela UI.

Passos:

1. abra `https://localhost:5173/manual-import`
2. cole uma ou várias mensagens copiadas do Slack
3. ou envie um arquivo `.txt` / `.log`
4. clique em `Importar conteúdo`

Essa importação usa a mesma lógica real de:

- parser
- deduplicação por mensagem
- agrupamento em erros recorrentes
- criação e vínculo de issues

## Integração com Slack

Para usar a integração real com Slack, você precisa preencher também:

- `SLACK_SIGNING_SECRET`
- `SLACK_BOT_TOKEN`
- `SLACK_CHANNEL_ID`
- `SLACK_TEAM_ID`
- `SLACK_CLIENT_ID`
- `SLACK_CLIENT_SECRET`
- `SLACK_REDIRECT_URI`

## Como funciona a ingestão em tempo real do Slack

- o backend expõe `POST /integrations/slack/events`
- o Slack envia eventos para essa rota
- a assinatura é validada com `SLACK_SIGNING_SECRET`
- mensagens do canal configurado em `SLACK_CHANNEL_ID` são parseadas e persistidas
- não existe worker separado: a ingestão acontece automaticamente enquanto a API estiver no ar

Logs esperados:

- `Slack Events API URL verification received`
- `Slack event callback received`
- `Slack event processed`

O `status` final costuma ser:

- `ingested`
- `ignored`

## Backfill do Slack

O backfill lê mensagens históricas do canal usando `conversations.history`.

Você pode disparar isso de duas formas:

### Pela UI

Em `Configurações`, escolhendo quantos dias de histórico quer buscar.

### Pelo comando

```bash
pnpm backfill
```

O padrão vem de:

```env
BACKFILL_DAYS=90
```

## Teste local com túnel público

Se você quiser testar o Slack apontando para sua máquina local, exponha a API com um túnel.

Exemplo com `ngrok`:

```bash
ngrok http 3333
```

Depois use a URL HTTPS gerada em:

- `Event Subscriptions > Request URL`
  - `https://SEU-TUNNEL/integrations/slack/events`
- `SLACK_REDIRECT_URI`
  - `https://SEU-TUNNEL/auth/slack/callback`

Se o callback OAuth local já estiver funcionando via `https://localhost:5173/auth/slack/callback`, você pode manter esse callback local e usar o túnel apenas para a Events API.

## Rodando tudo via Docker Compose

Se você quiser subir um ambiente mais próximo de produção:

```bash
cp .env.example .env
docker compose up --build
```

Isso sobe:

- Postgres em `localhost:5432`
- API em `localhost:3333`
- aplicação publicada pelo reverse proxy em `http://localhost:8080`

Observação:

- dentro do Docker, a API usa `postgres` como host do banco
- por isso o `docker-compose.yml` sobrescreve o `DATABASE_URL` interno da API

## Principais rotas

- `POST /integrations/slack/events`
- `POST /api/manual-import`
- `POST /api/slack/backfill`
- `GET /api/slack/backfill`
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
- `POST /api/issues/:id/slack-resolution`
- `GET /api/catalog`
- `PATCH /api/catalog/:id`
- `POST /api/catalog/:id/issues`

## Regras principais

- novas DLQs são agrupadas automaticamente em erros recorrentes por assinatura técnica
- issues são abertas manualmente a partir de um erro recorrente
- um mesmo erro recorrente pode ter várias issues ao longo do tempo
- o backfill pode atualizar status com base em reações já existentes no Slack
- reações no Slack podem atualizar status da DLQ no sistema
- segredos em headers e payloads sensíveis são mascarados antes de persistir

## Scripts úteis

```bash
pnpm dev
pnpm build
pnpm lint
pnpm test
pnpm prisma:generate
pnpm prisma:db:push
pnpm prisma:migrate
pnpm backfill
```

## Testes

```bash
pnpm test
```
