import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { runSlackBackfill } from "../api/client";
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

  const backfillMutation = useMutation({
    mutationFn: (days: number) => runSlackBackfill(days),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["occurrences"] }),
        queryClient.invalidateQueries({ queryKey: ["issues"] }),
        queryClient.invalidateQueries({ queryKey: ["catalog"] }),
      ]);
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
                Quando ativa, dashboard, catálogo, issues e ocorrências atualizam sozinhos
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
              disabled={backfillMutation.isPending}
              onClick={handleBackfill}
              type="button"
            >
              {backfillMutation.isPending
                ? "Sincronizando histórico..."
                : "Sincronizar histórico agora"}
            </button>
          </div>

          {backfillMutation.data ? (
            <div className="settings-backfill-result">
              <div>
                <span className="subtle-label">Janela usada</span>
                <strong>{backfillMutation.data.requestedDays} dias</strong>
              </div>
              <div>
                <span className="subtle-label">Mensagens processadas</span>
                <strong>{backfillMutation.data.processedCount}</strong>
              </div>
            </div>
          ) : null}

          {backfillMutation.isError ? (
            <p className="muted-text">
              Não foi possível sincronizar o histórico do Slack. Verifique `SLACK_BOT_TOKEN`
              e `SLACK_CHANNEL_ID`.
            </p>
          ) : null}
        </article>

        <article className="panel stack">
          <div className="section-title">
            <h3>Kinds ignorados</h3>
            <p>
              Esconda kinds que não fazem sentido para sua rotina. Essa filtragem vale nas
              telas de dashboard, catálogo, issues e ocorrências.
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
