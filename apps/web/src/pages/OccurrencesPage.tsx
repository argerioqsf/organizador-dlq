import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { listOccurrences } from "../api/client";
import { OccurrenceDetailModal } from "../components/OccurrenceDetailModal";
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
  const visibleOccurrences =
    occurrencesQuery.data?.items.filter((occurrence) => !isKindIgnored(occurrence.kind)) ?? [];

  function closeModal() {
    navigate("/occurrences");
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-heading">
          <p className="eyebrow">Triagem</p>
          <h2>DLQs</h2>
          <p className="page-summary">
            Revise cada DLQ, entenda o contexto do erro e vincule a uma issue apenas
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
            <p className="muted-text">Nenhuma DLQ visível com os filtros locais atuais.</p>
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
        <OccurrenceDetailModal occurrenceId={occurrenceId} onClose={closeModal} />
      ) : null}
    </div>
  );
}
