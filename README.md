# DLQ Organizer

Monorepo TypeScript para centralizar DLQs vindas do Slack, agrupar erros recorrentes, acompanhar tratativas em issues e gerar relatórios operacionais.

## Visão geral

O sistema faz:

- ingestão em tempo real de mensagens do Slack via Events API
- sincronização histórica de mensagens do canal via `conversations.history`
- importação manual de conteúdo copiado do Slack
- agrupamento automático de DLQs equivalentes em `Erros recorrentes`
- abertura e acompanhamento de `Issues`
- atualização de status por reação no Slack
- publicação de contexto de resolução de issue na thread original do Slack
- geração de relatório em PDF e publicação no Confluence

## Estrutura do monorepo

```text
apps/
  api/     Fastify + Prisma + Slack + relatórios
  web/     React + Vite + TanStack Query
packages/
  shared/  Tipos compartilhados entre API e frontend
```

## Pré-requisitos

- Node.js 20+
- `pnpm`
- Docker e Docker Compose

## Setup local em desenvolvimento

Esse é o fluxo recomendado para rodar localmente com hot reload no backend e frontend.

### 1. Instale as dependências

```bash
pnpm install
```

### 2. Crie o `.env`

```bash
cp .env.example .env
```

### 3. Suba apenas o Postgres no Docker

O `pnpm dev` **não sobe o banco**. Ele sobe somente API e frontend.

```bash
docker compose up -d postgres
```

Se quiser confirmar:

```bash
docker compose ps
```

### 4. Gere o client do Prisma

```bash
pnpm prisma:generate
```

### 5. Aplique o schema no banco

```bash
pnpm prisma:db:push
```

### 6. Suba API e frontend

```bash
pnpm dev
```

Isso sobe:

- API em `http://localhost:3333`
- Frontend em `https://localhost:5173`

### 7. Abra a aplicação

```text
https://localhost:5173
```

Como o frontend usa HTTPS local via Vite, o navegador pode mostrar aviso de certificado na primeira vez. Aceite a exceção.

## Resumo rápido do fluxo local

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres
pnpm prisma:generate
pnpm prisma:db:push
pnpm dev
```

## O que o `pnpm dev` sobe

O script da raiz:

```bash
pnpm dev
```

executa em paralelo:

- `@dlq-organizer/api`
- `@dlq-organizer/web`

Ele **não** sobe:

- Postgres
- nginx
- stack Docker completa

Para desenvolvimento, o fluxo normal é:

- Postgres no Docker
- API e frontend via `pnpm dev`

## Variáveis de ambiente

Copie de:

```bash
cp .env.example .env
```

### Mínimo para rodar local sem Slack

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
- o login via Slack é bypassado

### Todas as envs atuais

```env
NODE_ENV=development
PORT=3333
WEB_ORIGIN=https://localhost:5173
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dlq_organizer?schema=public
COOKIE_SECRET=
DEV_AUTH_BYPASS=true

SLACK_SIGNING_SECRET=
SLACK_BOT_TOKEN=
SLACK_APP_TOKEN=
SLACK_CHANNEL_ID=
SLACK_TEAM_ID=
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_REDIRECT_URI=
SLACK_ALLOWED_EMAIL_DOMAIN=
SLACK_ALLOWED_USER_IDS=
BACKFILL_DAYS=90

CONFLUENCE_BASE_URL=
CONFLUENCE_EMAIL=
CONFLUENCE_API_TOKEN=
CONFLUENCE_SPACE_KEY=
CONFLUENCE_PARENT_PAGE_ID=

VITE_API_BASE_URL=
```

### O que cada grupo faz

#### Base da aplicação

- `PORT`: porta da API
- `WEB_ORIGIN`: origem do frontend usada em cookies e redirects
- `DATABASE_URL`: conexão com Postgres
- `COOKIE_SECRET`: assinatura de sessão/cookie
- `DEV_AUTH_BYPASS`: ignora OAuth do Slack localmente
- `VITE_API_BASE_URL`: base da API para o frontend; vazio usa proxy do Vite

#### Integração com Slack

- `SLACK_SIGNING_SECRET`: valida assinatura dos webhooks do Slack
- `SLACK_BOT_TOKEN`: token `xoxb-...` da app
- `SLACK_APP_TOKEN`: não é necessário no fluxo atual, só se usar Socket Mode
- `SLACK_CHANNEL_ID`: canal monitorado
- `SLACK_TEAM_ID`: workspace esperada para login
- `SLACK_CLIENT_ID`: OAuth app id
- `SLACK_CLIENT_SECRET`: OAuth app secret
- `SLACK_REDIRECT_URI`: callback OAuth cadastrado na app
- `SLACK_ALLOWED_EMAIL_DOMAIN`: filtro opcional de domínio
- `SLACK_ALLOWED_USER_IDS`: filtro opcional por usuários
- `BACKFILL_DAYS`: padrão do backfill por CLI

#### Integração com Confluence

- `CONFLUENCE_BASE_URL`: ex. `https://suaempresa.atlassian.net/wiki`
- `CONFLUENCE_EMAIL`: e-mail da conta Atlassian usada na integração
- `CONFLUENCE_API_TOKEN`: token clássico de API da Atlassian
- `CONFLUENCE_SPACE_KEY`: key do space onde a página será criada
- `CONFLUENCE_PARENT_PAGE_ID`: página pai opcional

## Desenvolvimento sem Slack

Se `DEV_AUTH_BYPASS=true`, você consegue:

- abrir a aplicação sem OAuth
- importar DLQs manualmente
- validar parser, agrupamento e regras de status
- testar layout e relatórios

Isso é o caminho mais rápido para desenvolvimento do produto.

## Importação manual

A aplicação tem uma feature permanente de importação manual.

Você pode:

1. abrir `https://localhost:5173/manual-import`
2. colar uma ou várias mensagens copiadas do Slack
3. ou enviar um arquivo `.txt` / `.log`
4. importar o conteúdo

Essa importação reaproveita a mesma lógica usada pela ingestão real:

- parser
- fingerprint
- agrupamento em `Erros recorrentes`
- criação/vínculo de `Issues`
- atualização de status e automações

## Integração real com Slack

Para usar a integração completa, preencha:

- `SLACK_SIGNING_SECRET`
- `SLACK_BOT_TOKEN`
- `SLACK_CHANNEL_ID`
- `SLACK_TEAM_ID`
- `SLACK_CLIENT_ID`
- `SLACK_CLIENT_SECRET`
- `SLACK_REDIRECT_URI`

### Scopes mínimos recomendados

Em `OAuth & Permissions > Bot Token Scopes`, configure pelo menos:

- `channels:history` para canal público
- `groups:history` para canal privado
- `reactions:read` para sincronizar status por emoji
- `chat:write` para responder thread de resolução
- `reactions:write` para adicionar reação automática de check

Se a app já estiver instalada e você mudar scopes:

- reinstale/reautorize a app

### Event Subscriptions

Em `Event Subscriptions`, configure:

- `message.channels` e/ou `message.groups`
- `reaction_added`
- `reaction_removed`

### Como funciona a ingestão em tempo real

- a API expõe `POST /integrations/slack/events`
- o Slack envia eventos para essa rota
- a assinatura é validada com `SLACK_SIGNING_SECRET`
- o backend filtra pelo canal configurado em `SLACK_CHANNEL_ID`
- mensagens válidas viram DLQs
- reações atualizam status da DLQ no sistema

Logs típicos da API:

- `Slack Events API URL verification received`
- `Slack event callback received`
- `Slack event processed`

Resultados comuns:

- `status: "ingested"`
- `status: "ignored"`

## Status por emoji

Atualmente a automação por reação no Slack segue estas regras:

- `:eyes:` -> DLQ `investigating`
- `:white_check_mark:` ou `:approved:` -> DLQ `resolved`

Além disso:

- remoção de reação recalcula o estado da mensagem
- reações adicionadas pela própria app são ignoradas para evitar reprocessamento redundante
- no backfill, o sistema também lê as reações já presentes e sincroniza o status atual da DLQ

## Backfill / sincronização histórica

Na UI, a área de `Configurações` chama isso de **Sincronização de mensagens do Slack**.

Ela faz:

- leitura histórica do canal via `conversations.history`
- importação de novas DLQs
- reconciliação de DLQs já existentes
- sincronização de status por emojis atuais da mensagem

### Pela UI

Na tela de `Configurações`, você pode:

- escolher a janela em dias
- disparar a sincronização
- acompanhar status do job em background

O job roda assíncrono no backend e a UI faz polling do estado:

- `queued`
- `running`
- `succeeded`
- `failed`

### Pela CLI

```bash
pnpm backfill
```

O padrão usa:

```env
BACKFILL_DAYS=90
```

## Regras principais de negócio

- novas DLQs são agrupadas automaticamente em `Erros recorrentes`
- o agrupamento usa fingerprint técnico e normalização de conteúdo variável
- `Issues` podem ser abertas manualmente para tratar um erro recorrente
- um mesmo erro recorrente pode ter várias issues ao longo do tempo
- mudanças de status da DLQ recalculam o status do erro recorrente por uma regra centralizada
- backfill e eventos do Slack reaproveitam a mesma lógica de atualização de status
- links para Slack e Kafka UI ficam disponíveis nas DLQs

## Relatórios

A aba de relatórios permite:

- gerar PDF
- publicar no Confluence
- filtrar por intervalo de datas
- filtrar por status:
  - `Pendente`
  - `Em andamento`
  - `Concluído`

### PDF

O PDF é baixado com nome único no formato:

```text
relatorio-dlq-2026-04-22-2026-04-29-2904261452.pdf
```

### Confluence

A publicação no Confluence:

- cria uma nova página
- adiciona sufixo curto no título para não sobrescrever
- organiza o conteúdo por status
- dentro de cada status, agrupa por `kind`
- usa `expand` para os detalhes
- inclui links de Slack e Kafka

Exemplo de título:

```text
Analise DLQs abril de 26 #2904261452
```

## Configurações disponíveis na UI

A aba de configurações hoje permite:

- ligar/desligar auto-refresh da interface
- escolher janela da sincronização histórica
- rodar sincronização do Slack
- configurar `ignored kinds` localmente no navegador
- limpar toda a base da aplicação

### Limpeza da base

Existe uma ação destrutiva para apagar:

- DLQs
- issues
- erros recorrentes
- mensagens do Slack já importadas
- estado do job de sincronização

Se houver sincronização em andamento, a limpeza é bloqueada.

## Teste local com túnel público

Para testar o Slack apontando para sua máquina local, exponha a API.

Exemplo com `ngrok`:

```bash
ngrok http 3333
```

Use a URL HTTPS gerada em:

- `Event Subscriptions > Request URL`
  - `https://SEU-TUNNEL/integrations/slack/events`
- `SLACK_REDIRECT_URI`
  - `https://SEU-TUNNEL/auth/slack/callback`

Se seu OAuth já estiver funcionando em `https://localhost:5173/auth/slack/callback`, você pode manter o callback local e usar o túnel apenas para a Events API.

## Rodando tudo via Docker Compose

Se quiser subir um ambiente mais próximo de execução:

```bash
cp .env.example .env
docker compose up --build
```

Isso sobe:

- Postgres em `localhost:5432`
- API em `localhost:3333`
- aplicação publicada pelo reverse proxy em `http://localhost:8080`

Observação:

- dentro do container da API, o banco usa host `postgres`
- por isso o `docker-compose.yml` sobrescreve o `DATABASE_URL` interno

## Principais rotas

- `POST /integrations/slack/events`
- `POST /api/manual-import`
- `POST /api/slack/backfill`
- `GET /api/slack/backfill`
- `DELETE /api/admin/reset-workspace`
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
- `GET /api/reports/operational.pdf`
- `POST /api/reports/confluence`

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
