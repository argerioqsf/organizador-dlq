import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  assignOccurrenceIssue,
  clearOccurrenceIssue,
  getOccurrence,
  listIssues,
  listOccurrences,
  updateOccurrenceStatus,
} from "../api/client";
import { StatusBadge } from "../components/StatusBadge";
import { useAppSettings } from "../settings/AppSettingsContext";

const occurrenceStatuses = ["new", "investigating", "resolved", "ignored"] as const;
type OccurrenceStatusFilter = "" | (typeof occurrenceStatuses)[number];

function compactText(value: string, limit = 88) {
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

export function OccurrencesPage() {
  const { isKindIgnored, syncEnabled } = useAppSettings();
  const { occurrenceId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    search: "",
    topic: "",
    kind: "",
    status: "" as OccurrenceStatusFilter,
  });

  const occurrencesQuery = useQuery({
    queryKey: ["occurrences", filters],
    queryFn: () => listOccurrences({ ...filters, status: filters.status || undefined }),
    refetchInterval: syncEnabled ? 15000 : false,
  });

  const issuesQuery = useQuery({
    queryKey: ["issues", "all"],
    queryFn: () => listIssues({ limit: 200 }),
    refetchInterval: syncEnabled ? 15000 : false,
  });

  const occurrenceQuery = useQuery({
    queryKey: ["occurrence", occurrenceId],
    queryFn: () => getOccurrence(occurrenceId!),
    enabled: Boolean(occurrenceId),
    refetchInterval: syncEnabled ? 15000 : false,
  });

  const statusMutation = useMutation({
    mutationFn: (status: (typeof occurrenceStatuses)[number]) =>
      updateOccurrenceStatus(occurrenceId!, status),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["occurrences"] }),
        queryClient.invalidateQueries({ queryKey: ["occurrence", occurrenceId] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["issues"] }),
      ]);
    },
  });

  const issueMutation = useMutation({
    mutationFn: (issueId: string | null) =>
      issueId
        ? assignOccurrenceIssue(occurrenceId!, issueId)
        : clearOccurrenceIssue(occurrenceId!),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["occurrences"] }),
        queryClient.invalidateQueries({ queryKey: ["occurrence", occurrenceId] }),
        queryClient.invalidateQueries({ queryKey: ["issues"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
  });

  const selectedOccurrence = occurrenceQuery.data;
  const visibleOccurrences =
    occurrencesQuery.data?.items.filter((occurrence) => !isKindIgnored(occurrence.kind)) ?? [];
  const visibleIssues =
    issuesQuery.data?.items.filter((issue) => !isKindIgnored(issue.catalog?.kind ?? issue.kind)) ?? [];

  function closeModal() {
    navigate("/occurrences");
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-heading">
          <p className="eyebrow">Triagem</p>
          <h2>Ocorrências de DLQ</h2>
          <p className="page-summary">
            Revise cada alerta, entenda o contexto do erro e vincule a uma issue apenas
            quando houver tratativa operacional.
          </p>
        </div>
      </header>

      <section className="panel filter-panel">
        <input
          placeholder="Buscar texto livre"
          value={filters.search}
          onChange={(event) =>
            setFilters((current) => ({ ...current, search: event.target.value }))
          }
        />
        <input
          placeholder="Topic"
          value={filters.topic}
          onChange={(event) =>
            setFilters((current) => ({ ...current, topic: event.target.value }))
          }
        />
        <input
          placeholder="Kind"
          value={filters.kind}
          onChange={(event) =>
            setFilters((current) => ({ ...current, kind: event.target.value }))
          }
        />
        <select
          value={filters.status}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              status: event.target.value as OccurrenceStatusFilter,
            }))
          }
        >
          <option value="">Todos os status</option>
          {occurrenceStatuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>Lista</h3>
          <span>{visibleOccurrences.length} itens</span>
        </div>
        <div className="list">
          {visibleOccurrences.length === 0 ? (
            <p className="muted-text">Nenhuma ocorrência visível com os filtros locais atuais.</p>
          ) : (
            visibleOccurrences.map((occurrence) => (
              <Link
                className={`list-item ${occurrenceId === occurrence.id ? "selected" : ""}`}
                key={occurrence.id}
                to={`/occurrences/${occurrence.id}`}
              >
                <div className="list-item-body">
                  <strong>{occurrence.kind}</strong>
                  <p className="list-item-meta">{compactText(occurrence.topic, 72)}</p>
                  <small className="list-item-caption">
                    {new Date(occurrence.createdAt).toLocaleString()}
                  </small>
                </div>
                <StatusBadge status={occurrence.status} />
              </Link>
            ))
          )}
        </div>
      </section>

      {occurrenceId ? (
        <div className="modal-backdrop" onClick={closeModal} role="presentation">
          <section
            aria-modal="true"
            className="modal-panel occurrence-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">Detalhes da ocorrência</p>
                <h3>Inspecionar DLQ</h3>
              </div>
              <button className="ghost-button modal-close-button" onClick={closeModal} type="button">
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
                    defaultValue={selectedOccurrence.issueId ?? ""}
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
      ) : null}
    </div>
  );
}
