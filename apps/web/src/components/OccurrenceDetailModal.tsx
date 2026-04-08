import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  assignOccurrenceIssue,
  clearOccurrenceIssue,
  getOccurrence,
  listIssues,
  updateOccurrenceStatus,
} from "../api/client";
import { useAppSettings } from "../settings/AppSettingsContext";
import { StatusBadge } from "./StatusBadge";

const occurrenceStatuses = ["new", "investigating", "resolved", "ignored"] as const;

interface OccurrenceDetailModalProps {
  occurrenceId: string;
  onClose: () => void;
}

export function OccurrenceDetailModal({
  occurrenceId,
  onClose,
}: OccurrenceDetailModalProps) {
  const { isKindIgnored, syncEnabled } = useAppSettings();
  const queryClient = useQueryClient();

  const occurrenceQuery = useQuery({
    queryKey: ["occurrence", occurrenceId],
    queryFn: () => getOccurrence(occurrenceId),
    enabled: Boolean(occurrenceId),
    refetchInterval: syncEnabled ? 15000 : false,
  });

  const issuesQuery = useQuery({
    queryKey: ["issues", "all"],
    queryFn: () => listIssues({ limit: 200 }),
    refetchInterval: syncEnabled ? 15000 : false,
  });

  const statusMutation = useMutation({
    mutationFn: (status: (typeof occurrenceStatuses)[number]) =>
      updateOccurrenceStatus(occurrenceId, status),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["occurrences"] }),
        queryClient.invalidateQueries({ queryKey: ["occurrence", occurrenceId] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["issues"] }),
        queryClient.invalidateQueries({ queryKey: ["catalog"] }),
      ]);
    },
  });

  const issueMutation = useMutation({
    mutationFn: (issueId: string | null) =>
      issueId ? assignOccurrenceIssue(occurrenceId, issueId) : clearOccurrenceIssue(occurrenceId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["occurrences"] }),
        queryClient.invalidateQueries({ queryKey: ["occurrence", occurrenceId] }),
        queryClient.invalidateQueries({ queryKey: ["issues"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["catalog"] }),
      ]);
    },
  });

  const selectedOccurrence = occurrenceQuery.data;
  const visibleIssues =
    issuesQuery.data?.items.filter((issue) => !isKindIgnored(issue.catalog?.kind ?? issue.kind)) ??
    [];

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section
        aria-modal="true"
        className="modal-panel occurrence-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">Detalhes da DLQ</p>
            <h3>Inspecionar DLQ</h3>
          </div>
          <button className="ghost-button modal-close-button" onClick={onClose} type="button">
            Fechar
          </button>
        </div>

        {occurrenceQuery.isLoading ? <p>Carregando detalhes...</p> : null}

        {selectedOccurrence ? (
          <div className="detail modal-body">
            <div className="panel-header">
              <div className="stack-tight">
                <h3>{selectedOccurrence.kind}</h3>
                <p className="muted-text">{selectedOccurrence.topic}</p>
              </div>
              <StatusBadge status={selectedOccurrence.status} />
            </div>

            <div className="detail-grid">
              <div>
                <span className="eyebrow">Key</span>
                <p>{selectedOccurrence.messageKey ?? "-"}</p>
              </div>
              <div>
                <span className="eyebrow">External Reference</span>
                <p>{selectedOccurrence.externalReference ?? "-"}</p>
              </div>
              <div>
                <span className="eyebrow">Issue</span>
                <p>{selectedOccurrence.issue?.title ?? "Sem issue"}</p>
              </div>
              <div>
                <span className="eyebrow">Slack</span>
                <p>
                  {selectedOccurrence.slackPermalink ? (
                    <a href={selectedOccurrence.slackPermalink} target="_blank" rel="noreferrer">
                      Abrir mensagem
                    </a>
                  ) : (
                    "-"
                  )}
                </p>
              </div>
            </div>

            <div className="action-row">
              <select
                value={selectedOccurrence.status}
                onChange={(event) =>
                  statusMutation.mutate(
                    event.target.value as (typeof occurrenceStatuses)[number],
                  )
                }
              >
                {occurrenceStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>

              <select
                value={selectedOccurrence.issueId ?? ""}
                onChange={(event) => issueMutation.mutate(event.target.value || null)}
              >
                <option value="">Sem issue</option>
                {visibleIssues.map((issue) => (
                  <option key={issue.id} value={issue.id}>
                    {issue.title}
                  </option>
                ))}
              </select>
            </div>

            <section className="detail-section">
              <h4>Error Message</h4>
              <pre>{selectedOccurrence.errorMessage ?? "-"}</pre>
            </section>

            <section className="detail-section">
              <h4>Error Response</h4>
              <pre>{selectedOccurrence.errorResponse ?? "-"}</pre>
            </section>

            <section className="detail-section">
              <h4>Error Stack</h4>
              <pre>{selectedOccurrence.errorStack ?? "-"}</pre>
            </section>

            <section className="detail-section">
              <h4>Curl</h4>
              <pre>{selectedOccurrence.curl ?? "-"}</pre>
            </section>
          </div>
        ) : null}
      </section>
    </div>
  );
}
