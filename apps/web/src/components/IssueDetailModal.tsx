import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addOccurrencesToIssue,
  getIssue,
  postIssueResolutionToSlack,
  removeOccurrenceFromIssue,
  updateIssue,
} from "../api/client";
import { useAppSettings } from "../settings/AppSettingsContext";
import { OccurrenceDetailModal } from "./OccurrenceDetailModal";
import { StatusBadge } from "./StatusBadge";

const issueStatuses = ["open", "pending", "resolved", "canceled"] as const;

interface IssueDetailModalProps {
  issueId: string;
  onClose: () => void;
}

export function IssueDetailModal({ issueId, onClose }: IssueDetailModalProps) {
  const { isKindIgnored, syncEnabled } = useAppSettings();
  const queryClient = useQueryClient();
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState<string | null>(null);
  const [occurrenceIds, setOccurrenceIds] = useState("");
  const [slackSyncPrompt, setSlackSyncPrompt] = useState<{
    comment: string;
    occurrenceCount: number;
  } | null>(null);
  const [slackSyncFeedback, setSlackSyncFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [editState, setEditState] = useState({
    title: "",
    description: "",
    status: "open",
  });

  const issueQuery = useQuery({
    queryKey: ["issue", issueId],
    queryFn: () => getIssue(issueId),
    enabled: Boolean(issueId),
    refetchInterval: syncEnabled ? 15000 : false,
  });

  useEffect(() => {
    if (issueQuery.data) {
      setEditState({
        title: issueQuery.data.title,
        description: issueQuery.data.description ?? "",
        status: issueQuery.data.status,
      });
    }
  }, [issueQuery.data]);

  const updateMutation = useMutation({
    mutationFn: (payload: {
      title: string;
      description: string;
      status: (typeof issueStatuses)[number];
      previousStatus: (typeof issueStatuses)[number];
    }) =>
      updateIssue(issueId, {
        title: payload.title,
        description: payload.description,
        status: payload.status,
      }),
    onSuccess: async (updatedIssue, payload) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["issues"] }),
        queryClient.invalidateQueries({ queryKey: ["issue", issueId] }),
        queryClient.invalidateQueries({ queryKey: ["occurrences"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["catalog"] }),
      ]);

      const trimmedComment = payload.description.trim();
      const movedToResolved =
        payload.previousStatus !== "resolved" && payload.status === "resolved";

      setSlackSyncFeedback(null);
      if (movedToResolved && trimmedComment && updatedIssue.occurrenceCount > 0) {
        setSlackSyncPrompt({
          comment: trimmedComment,
          occurrenceCount: updatedIssue.occurrenceCount,
        });
      }
    },
  });

  const slackSyncMutation = useMutation({
    mutationFn: (comment: string) => postIssueResolutionToSlack(issueId, comment),
    onSuccess: async (result) => {
      setSlackSyncPrompt(null);
      setSlackSyncFeedback({
        kind: "success",
        message: `Contexto publicado em ${result.postedReplyCount} thread(s) e check aplicado em ${result.addedReactionCount} mensagem(ns).`,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["issue", issueId] }),
        queryClient.invalidateQueries({ queryKey: ["issues"] }),
        queryClient.invalidateQueries({ queryKey: ["occurrences"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
    onError: (error) => {
      setSlackSyncFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Não foi possível publicar no Slack.",
      });
    },
  });

  const addMutation = useMutation({
    mutationFn: () =>
      addOccurrencesToIssue(
        issueId,
        occurrenceIds
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    onSuccess: async () => {
      setOccurrenceIds("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["issue", issueId] }),
        queryClient.invalidateQueries({ queryKey: ["issues"] }),
        queryClient.invalidateQueries({ queryKey: ["occurrences"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["catalog"] }),
      ]);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (occurrenceIdToRemove: string) =>
      removeOccurrenceFromIssue(issueId, occurrenceIdToRemove),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["issue", issueId] }),
        queryClient.invalidateQueries({ queryKey: ["issues"] }),
        queryClient.invalidateQueries({ queryKey: ["occurrences"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["catalog"] }),
      ]);
    },
  });

  const visibleIssueOccurrences =
    issueQuery.data?.occurrences?.filter((occurrence) => !isKindIgnored(occurrence.kind)) ?? [];

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} role="presentation">
        <section
          aria-modal="true"
          className="modal-panel issue-modal"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
        >
          <div className="modal-header">
            <div>
              <p className="eyebrow">Detalhes da issue</p>
              <h3>Editar issue</h3>
            </div>
            <button className="ghost-button modal-close-button" onClick={onClose} type="button">
              Fechar
            </button>
          </div>

          {issueQuery.isLoading ? <p>Carregando issue...</p> : null}

          {issueQuery.data ? (
            <div className="detail modal-body">
              <div className="panel-header issue-header">
                <div className="stack-tight issue-header-copy">
                  <h3>{issueQuery.data.title}</h3>
                  <p className="muted-text">Tratativa operacional ligada a um erro recorrente.</p>
                </div>
                <StatusBadge status={issueQuery.data.status} />
              </div>

              {issueQuery.data.catalog ? (
                <div className="detail-grid">
                  <div>
                    <span className="eyebrow">Erro recorrente</span>
                    <p>
                      {issueQuery.data.catalog.topic} / {issueQuery.data.catalog.kind}
                    </p>
                  </div>
                  <div>
                    <span className="eyebrow">Status do erro recorrente</span>
                    <p>{issueQuery.data.catalog.status ?? "-"}</p>
                  </div>
                </div>
              ) : null}

              <div className="stack">
                {slackSyncFeedback ? (
                  <p className={`catalog-feedback ${slackSyncFeedback.kind}`}>
                    {slackSyncFeedback.message}
                  </p>
                ) : null}
                <input
                  placeholder="Título da issue"
                  value={editState.title}
                  onChange={(event) =>
                    setEditState((current) => ({ ...current, title: event.target.value }))
                  }
                />
                <textarea
                  placeholder="Contexto, hipótese, próximos passos"
                  value={editState.description}
                  onChange={(event) =>
                    setEditState((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
                <select
                  value={editState.status}
                  onChange={(event) =>
                    setEditState((current) => ({ ...current, status: event.target.value }))
                  }
                >
                  {issueStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                <div className="action-row">
                  <button
                    className="primary-button"
                    onClick={() =>
                      updateMutation.mutate({
                        title: editState.title,
                        description: editState.description,
                        status: editState.status as (typeof issueStatuses)[number],
                        previousStatus:
                          (issueQuery.data?.status as (typeof issueStatuses)[number]) ?? "open",
                      })
                    }
                  >
                    Salvar issue
                  </button>
                </div>
              </div>

              <section className="detail-section">
                <div className="panel-header">
                  <h4>Adicionar DLQs por ID</h4>
                  <span>Vínculo manual</span>
                </div>
                <textarea
                  placeholder="Cole IDs separados por vírgula"
                  value={occurrenceIds}
                  onChange={(event) => setOccurrenceIds(event.target.value)}
                />
                <button className="ghost-button" onClick={() => addMutation.mutate()}>
                  Vincular DLQs
                </button>
              </section>

              <section className="detail-section">
                <div className="panel-header">
                  <h4>DLQs vinculadas</h4>
                  <span>{visibleIssueOccurrences.length} itens</span>
                </div>
                <div className="list">
                  {visibleIssueOccurrences.map((occurrence) => (
                    <div className="list-item compact issue-occurrence-item" key={occurrence.id}>
                      <button
                        className="issue-occurrence-link"
                        onClick={() => setSelectedOccurrenceId(occurrence.id)}
                        type="button"
                      >
                        <div className="list-item-body">
                          <strong>{occurrence.kind}</strong>
                          <p className="list-item-meta">{occurrence.topic}</p>
                        </div>
                      </button>
                      <div className="inline-actions issue-occurrence-actions">
                        <StatusBadge status={occurrence.status} />
                        <button
                          className="ghost-button"
                          onClick={() => removeMutation.mutate(occurrence.id)}
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          ) : null}
        </section>
      </div>

      {selectedOccurrenceId ? (
        <OccurrenceDetailModal
          occurrenceId={selectedOccurrenceId}
          onClose={() => setSelectedOccurrenceId(null)}
        />
      ) : null}

      {slackSyncPrompt ? (
        <div
          className="modal-backdrop"
          onClick={() => setSlackSyncPrompt(null)}
          role="presentation"
        >
          <section
            aria-modal="true"
            className="modal-panel slack-sync-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">Publicar no Slack</p>
                <h3>Enviar contexto da resolução?</h3>
              </div>
              <button
                className="ghost-button modal-close-button"
                onClick={() => setSlackSyncPrompt(null)}
                type="button"
              >
                Fechar
              </button>
            </div>

            <div className="detail modal-body">
              <p className="muted-text">
                Esta issue foi marcada como resolvida. Deseja publicar o contexto abaixo nas threads
                das {slackSyncPrompt.occurrenceCount} DLQs vinculadas e adicionar um check na
                mensagem original?
              </p>

              <pre>{slackSyncPrompt.comment}</pre>

              <div className="action-row">
                <button
                  className="ghost-button"
                  onClick={() => setSlackSyncPrompt(null)}
                  type="button"
                >
                  Agora não
                </button>
                <button
                  className="primary-button"
                  disabled={slackSyncMutation.isPending}
                  onClick={() => slackSyncMutation.mutate(slackSyncPrompt.comment)}
                  type="button"
                >
                  {slackSyncMutation.isPending ? "Publicando..." : "Publicar no Slack"}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
