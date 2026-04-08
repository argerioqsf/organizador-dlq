import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { listIssues } from "../api/client";
import { IssueDetailModal } from "../components/IssueDetailModal";
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
  const [filters, setFilters] = useState({
    search: "",
    status: "" as IssueStatusFilter,
    catalogId: searchParams.get("catalogId") ?? "",
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

  const searchSuffix = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const visibleIssues =
    issuesQuery.data?.items.filter((issue) => !isKindIgnored(issue.catalog?.kind ?? issue.kind)) ?? [];

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
            placeholder="Filtrar por erro recorrente"
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
        <IssueDetailModal issueId={issueId} onClose={closeModal} />
      ) : null}
    </div>
  );
}
