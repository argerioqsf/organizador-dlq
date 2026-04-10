import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getSlackBackfillJob, runSlackBackfill } from "../api/client";
import { useAppSettings } from "../settings/AppSettingsContext";

export function SettingsPage() {
  const queryClient = useQueryClient();
  const {
    syncEnabled,
    setSyncEnabled,
    slackHistoryDays,
    setSlackHistoryDays,
    ignoredKinds,
    addIgnoredKinds,
    removeIgnoredKind,
  } = useAppSettings();
  const [draftKinds, setDraftKinds] = useState("");
  const [draftHistoryDays, setDraftHistoryDays] = useState(String(slackHistoryDays));

  const ignoredKindsPreview = useMemo(
    () => ignoredKinds.slice().sort((left, right) => left.localeCompare(right)),
    [ignoredKinds],
  );

  const backfillJobQuery = useQuery({
    queryKey: ["slack-backfill-job"],
    queryFn: getSlackBackfillJob,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "queued" || status === "running" ? 2000 : false;
    },
  });

  const backfillMutation = useMutation({
    mutationFn: (days: number) => runSlackBackfill(days),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["slack-backfill-job"] });
    },
  });

  function handleAddKinds() {
    addIgnoredKinds(draftKinds);
    setDraftKinds("");
  }

  function normalizeDraftHistoryDays() {
    const parsed = Number(draftHistoryDays);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    const normalized = Math.min(Math.max(Math.round(parsed), 1), 365);
    setSlackHistoryDays(normalized);
    setDraftHistoryDays(String(normalized));
    return normalized;
  }

  function handleHistoryDaysSave() {
    normalizeDraftHistoryDays();
  }

  function handleBackfill() {
    const normalized = normalizeDraftHistoryDays();
    if (normalized === null) {
      return;
    }

    backfillMutation.mutate(normalized);
  }

  const backfillJob = backfillJobQuery.data;
  const isBackfillRunning =
    backfillJob?.status === "queued" || backfillJob?.status === "running";

  useEffect(() => {
    if (backfillJob?.status !== "succeeded" || !backfillJob.finishedAt) {
      return;
    }

    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["occurrences"] }),
      queryClient.invalidateQueries({ queryKey: ["issues"] }),
      queryClient.invalidateQueries({ queryKey: ["catalog"] }),
    ]);
  }, [backfillJob?.finishedAt, backfillJob?.status, queryClient]);

  function getBackfillButtonLabel() {
    if (backfillMutation.isPending || backfillJob?.status === "queued") {
      return "Enfileirando sincronização...";
    }

    if (backfillJob?.status === "running") {
      return "Sincronização em andamento...";
    }

    return "Sincronizar histórico agora";
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-heading">
          <p className="eyebrow">Aplicação</p>
          <h2>Configurações</h2>
          <p className="page-summary">
            Controle o comportamento local da interface e execute a importação do histórico
            do Slack sem depender de comandos no terminal.
          </p>
        </div>
      </header>

      <section className="grid two-columns">
        <article className="panel stack">
          <div className="section-title">
            <h3>Sincronização automática</h3>
            <p>
              Controla o auto-refresh da interface para acompanhar novas mensagens já
              ingeridas pelo backend.
            </p>
          </div>

          <div className="settings-toggle-row">
            <div>
              <strong>{syncEnabled ? "Ativada" : "Desativada"}</strong>
              <p className="muted-text">
                Quando ativa, dashboard, erros recorrentes, issues e DLQs atualizam sozinhos
                no navegador.
              </p>
            </div>
            <button
              className={`settings-switch ${syncEnabled ? "active" : ""}`}
              onClick={() => setSyncEnabled(!syncEnabled)}
              type="button"
            >
              <span />
            </button>
          </div>

          <p className="muted-text settings-footnote">
            A ingestão em tempo real via Events API continua rodando no backend. Esse toggle
            controla apenas a frequência de atualização da interface.
          </p>
        </article>

        <article className="panel stack">
          <div className="section-title">
            <h3>Histórico do Slack</h3>
            <p>
              O backfill histórico usa `conversations.history` para buscar mensagens antigas
              do canal configurado. Antes, isso só existia via `pnpm backfill` com o padrão
              de 90 dias.
            </p>
          </div>

          <div className="settings-history-grid">
            <label className="field">
              <span>Dias de histórico</span>
              <input
                type="number"
                min={1}
                max={365}
                value={draftHistoryDays}
                onChange={(event) => setDraftHistoryDays(event.target.value)}
              />
            </label>

            <div className="settings-history-copy">
              <span className="subtle-label">Como funciona</span>
              <p className="muted-text">
                Ao sincronizar, o backend calcula um `oldest` com base em agora menos o
                número de dias informado, percorre a paginação do Slack em lotes de até 200
                mensagens e reaproveita a deduplicação já existente por mensagem do canal.
              </p>
            </div>
          </div>

          <div className="action-row">
            <button className="ghost-button" onClick={handleHistoryDaysSave} type="button">
              Salvar dias
            </button>
            <button
              className="primary-button"
              disabled={backfillMutation.isPending || isBackfillRunning}
              onClick={handleBackfill}
              type="button"
            >
              {getBackfillButtonLabel()}
            </button>
          </div>

          {backfillJob ? (
            <div className="settings-backfill-result">
              <div>
                <span className="subtle-label">Status</span>
                <strong>{backfillJob.status}</strong>
              </div>
              <div>
                <span className="subtle-label">Janela usada</span>
                <strong>{backfillJob.requestedDays ? `${backfillJob.requestedDays} dias` : "-"}</strong>
              </div>
              <div>
                <span className="subtle-label">Mensagens processadas</span>
                <strong>{backfillJob.processedCount}</strong>
              </div>
              <div>
                <span className="subtle-label">Última atualização</span>
                <strong>
                  {backfillJob.finishedAt
                    ? new Date(backfillJob.finishedAt).toLocaleString()
                    : backfillJob.startedAt
                      ? new Date(backfillJob.startedAt).toLocaleString()
                      : "-"}
                </strong>
              </div>
            </div>
          ) : null}

          {isBackfillRunning ? (
            <p className="catalog-feedback">
              A solicitação foi aceita e está sendo processada em background. Você pode sair
              desta tela enquanto o backend continua a sincronização.
            </p>
          ) : null}

          {backfillJob?.status === "succeeded" ? (
            <p className="catalog-feedback success">
              Sincronização concluída com sucesso. As listas serão atualizadas com as DLQs
              importadas.
            </p>
          ) : null}

          {backfillJob?.status === "failed" ? (
            <p className="catalog-feedback error">
              {backfillJob.errorMessage ??
                "Não foi possível sincronizar o histórico do Slack. Verifique a configuração da integração."}
            </p>
          ) : null}

          {backfillMutation.isError ? (
            <p className="catalog-feedback error">
              Não foi possível iniciar a sincronização do histórico do Slack.
            </p>
          ) : null}
        </article>

        <article className="panel stack">
          <div className="section-title">
            <h3>Kinds ignorados</h3>
            <p>
              Esconda kinds que não fazem sentido para sua rotina. Essa filtragem vale nas
              telas de dashboard, erros recorrentes, issues e DLQs.
            </p>
          </div>

          <div className="stack">
            <textarea
              placeholder="Adicione um ou mais kinds, separados por vírgula ou quebra de linha"
              value={draftKinds}
              onChange={(event) => setDraftKinds(event.target.value)}
            />
            <div className="action-row">
              <button className="primary-button" onClick={handleAddKinds} type="button">
                Salvar kinds ignorados
              </button>
            </div>
          </div>

          <div className="settings-chip-list">
            {ignoredKindsPreview.length === 0 ? (
              <p className="muted-text">Nenhum kind ignorado configurado.</p>
            ) : (
              ignoredKindsPreview.map((kind) => (
                <button
                  className="settings-chip"
                  key={kind}
                  onClick={() => removeIgnoredKind(kind)}
                  type="button"
                >
                  {kind}
                  <span>Remover</span>
                </button>
              ))
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
