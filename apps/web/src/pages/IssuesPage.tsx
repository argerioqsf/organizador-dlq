import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import {
  addOccurrencesToIssue,
  getIssue,
  listIssues,
  removeOccurrenceFromIssue,
  updateIssue,
} from "../api/client";
import { StatusBadge } from "../components/StatusBadge";
import { useAppSettings } from "../settings/AppSettingsContext";

const issueStatuses = ["open", "pending", "resolved", "canceled"] as const;
type IssueStatusFilter = "" | (typeof issueStatuses)[number];

function compactText(value: string, limit = 96) {
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

export function IssuesPage() {
  const { isKindIgnored, syncEnabled } = useAppSettings();
  const { issueId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    search: "",
    status: "" as IssueStatusFilter,
    catalogId: searchParams.get("catalogId") ?? "",
  });
  const [occurrenceIds, setOccurrenceIds] = useState("");
  const [editState, setEditState] = useState({
    title: "",
    description: "",
    status: "open",
  });

  const issuesQuery = useQuery({
    queryKey: ["issues", filters],
    queryFn: () =>
      listIssues({
        ...filters,
        status: filters.status || undefined,
        catalogId: filters.catalogId || undefined,
      }),
    refetchInterval: syncEnabled ? 15000 : false,
  });

  const issueQuery = useQuery({
    queryKey: ["issue", issueId],
    queryFn: () => getIssue(issueId!),
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
    mutationFn: () =>
      updateIssue(issueId!, {
        title: editState.title,
        description: editState.description,
        status: editState.status as (typeof issueStatuses)[number],
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["issues"] }),
        queryClient.invalidateQueries({ queryKey: ["issue", issueId] }),
        queryClient.invalidateQueries({ queryKey: ["occurrences"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
  });

  const addMutation = useMutation({
    mutationFn: () =>
      addOccurrencesToIssue(
        issueId!,
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
      ]);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (occurrenceIdToRemove: string) =>
      removeOccurrenceFromIssue(issueId!, occurrenceIdToRemove),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["issue", issueId] }),
        queryClient.invalidateQueries({ queryKey: ["issues"] }),
        queryClient.invalidateQueries({ queryKey: ["occurrences"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
  });

  const searchSuffix = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const visibleIssues =
    issuesQuery.data?.items.filter((issue) => !isKindIgnored(issue.catalog?.kind ?? issue.kind)) ?? [];
  const visibleIssueOccurrences =
    issueQuery.data?.occurrences?.filter((occurrence) => !isKindIgnored(occurrence.kind)) ?? [];

  function closeModal() {
    navigate(`/issues${searchSuffix}`);
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-heading">
          <p className="eyebrow">Operação</p>
          <h2>Issues</h2>
          <p className="page-summary">
            Use issues apenas quando houver atuação real sobre um problema recorrente.
          </p>
        </div>
      </header>

      <section className="panel">
        <div className="panel-header">
          <h3>Lista</h3>
          <span>{visibleIssues.length} itens</span>
        </div>
        <div className="filter-panel compact issue-filter-panel">
          <input
            placeholder="Buscar issue"
            value={filters.search}
            onChange={(event) =>
              setFilters((current) => ({ ...current, search: event.target.value }))
            }
          />
          <select
            value={filters.status}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                status: event.target.value as IssueStatusFilter,
              }))
            }
          >
            <option value="">Todos os status</option>
            {issueStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <input
            placeholder="Filtrar por catálogo"
            value={filters.catalogId}
            onChange={(event) =>
              setFilters((current) => ({ ...current, catalogId: event.target.value }))
            }
          />
        </div>
        <div className="list">
          {visibleIssues.length === 0 ? (
            <p className="muted-text">Nenhuma issue visível com os filtros locais atuais.</p>
          ) : (
            visibleIssues.map((issue) => (
              <Link
                className={`list-item issue-list-card ${issueId === issue.id ? "selected" : ""}`}
                key={issue.id}
                to={`/issues/${issue.id}${searchSuffix}`}
              >
                <div className="list-item-body">
                  <strong>{compactText(issue.title, 84)}</strong>
                  <p className="list-item-meta">
                    {issue.occurrenceCount} DLQs
                    {issue.catalog ? ` • ${compactText(issue.catalog.kind, 42)}` : ""}
                  </p>
                </div>
                <StatusBadge status={issue.status} />
              </Link>
            ))
          )}
        </div>
      </section>

      {issueId ? (
        <div className="modal-backdrop" onClick={closeModal} role="presentation">
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
              <button className="ghost-button modal-close-button" onClick={closeModal} type="button">
                Fechar
              </button>
            </div>

            {issueQuery.isLoading ? <p>Carregando issue...</p> : null}

            {issueQuery.data ? (
              <div className="detail modal-body">
                <div className="panel-header issue-header">
                  <div className="stack-tight issue-header-copy">
                    <h3>{issueQuery.data.title}</h3>
                    <p className="muted-text">Tratativa operacional ligada a um catálogo técnico.</p>
                  </div>
                  <StatusBadge status={issueQuery.data.status} />
                </div>

                {issueQuery.data.catalog ? (
                  <div className="detail-grid">
                    <div>
                      <span className="eyebrow">Catálogo</span>
                      <p>
                        {issueQuery.data.catalog.topic} / {issueQuery.data.catalog.kind}
                      </p>
                    </div>
                    <div>
                      <span className="eyebrow">Status do catálogo</span>
                      <p>{issueQuery.data.catalog.status ?? "-"}</p>
                    </div>
                  </div>
                ) : null}

                <div className="stack">
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
                    <button className="primary-button" onClick={() => updateMutation.mutate()}>
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
                    Vincular ocorrências
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
                        <div className="list-item-body">
                          <Link to={`/occurrences/${occurrence.id}`}>{occurrence.kind}</Link>
                          <p className="list-item-meta">{compactText(occurrence.topic, 68)}</p>
                        </div>
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
      ) : null}
    </div>
  );
}
