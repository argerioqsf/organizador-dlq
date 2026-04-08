import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import {
  createIssueFromCatalog,
  listCatalog,
  listOccurrences,
  updateCatalogStatus,
} from "../api/client";
import { StatusBadge } from "../components/StatusBadge";
import { useAppSettings } from "../settings/AppSettingsContext";

const catalogStatuses = ["open", "pending", "resolved", "canceled"] as const;

function extractCatalogSignature(signatureText: string): string {
  const errorCode = signatureText.match(/"errorCode":"([^"]+)"/)?.[1];
  const statusCode = signatureText.match(/"(?:statusCode|httpStatusCode)":(\d+)/)?.[1];
  const referenceId = signatureText.match(/"referenceId":"([^"]+)"/)?.[1];
  const message = signatureText.match(/"message":"([^"]+)"/)?.[1];
  const name = signatureText.match(/"name":"([^"]+)"/)?.[1];

  const parts = [
    statusCode ? `HTTP ${statusCode}` : null,
    errorCode ?? name ?? null,
    message ?? null,
    referenceId ? `ref ${referenceId}` : null,
  ].filter(Boolean);

  if (parts.length > 0) {
    return parts.join(" • ");
  }

  return signatureText.replace(/\s+/g, " ").trim().slice(0, 120);
}

function summarizeOccurrence(entry: {
  errorMessage?: string | null;
  externalReference?: string | null;
  messageKey?: string | null;
  createdAt: string;
}) {
  const message = entry.errorMessage?.replace(/\s+/g, " ").trim();
  const identity = entry.externalReference ?? entry.messageKey;

  return {
    message: message?.slice(0, 118) || "Sem resumo de erro",
    identity,
    timestamp: new Date(entry.createdAt).toLocaleString(),
  };
}

export function CatalogPage() {
  const { isKindIgnored, syncEnabled } = useAppSettings();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [expandedCatalogId, setExpandedCatalogId] = useState<string | null>(null);
  const catalogQuery = useQuery({
    queryKey: ["catalog"],
    queryFn: listCatalog,
    refetchInterval: syncEnabled ? 15000 : false,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: (typeof catalogStatuses)[number] }) =>
      updateCatalogStatus(id, status),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["catalog"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["occurrences"] }),
      ]);
    },
  });

  const issueMutation = useMutation({
    mutationFn: (catalogId: string) =>
      createIssueFromCatalog(catalogId, { includeUnassignedOccurrences: true }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["catalog"] }),
        queryClient.invalidateQueries({ queryKey: ["issues"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["occurrences"] }),
      ]);
    },
  });

  const filteredItems = useMemo(() => {
    const items = (catalogQuery.data?.items ?? []).filter((entry) => !isKindIgnored(entry.kind));
    if (!statusFilter) {
      return items;
    }

    return items.filter((entry) => entry.status === statusFilter);
  }, [catalogQuery.data?.items, isKindIgnored, statusFilter]);

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-heading">
          <p className="eyebrow">Agrupamentos técnicos</p>
          <h2>Catálogo de erros</h2>
          <p className="page-summary">
            Veja padrões recorrentes, acompanhe o status técnico e abra issues apenas
            quando o problema realmente estiver em tratamento.
          </p>
        </div>
      </header>

      <section className="panel">
        <div className="panel-header">
          <h3>Lista</h3>
          <div className="catalog-toolbar">
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">Todos os status</option>
              {catalogStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="catalog-list">
          {filteredItems.length === 0 ? (
            <p className="muted-text">Nenhum catálogo visível com os filtros locais atuais.</p>
          ) : (
            filteredItems.map((entry) => (
              <article className="catalog-card" key={entry.id}>
                <div className="catalog-card-header">
                  <div className="card-copy">
                    <p className="card-kicker">{entry.topic}</p>
                    <h3>{entry.kind}</h3>
                    <p className="catalog-signature" title={extractCatalogSignature(entry.signatureText)}>
                      {extractCatalogSignature(entry.signatureText)}
                    </p>
                  </div>
                  <StatusBadge status={entry.status} />
                </div>

                <div className="catalog-card-metrics">
                  <div className="metric-pill">
                    <span>Ocorrências</span>
                    <strong>{entry.occurrenceCount}</strong>
                  </div>
                  <div className="metric-pill">
                    <span>Issues abertas</span>
                    <strong>{entry.openIssueCount}</strong>
                  </div>
                  <div className="metric-pill">
                    <span>Total issues</span>
                    <strong>{entry.totalIssueCount}</strong>
                  </div>
                  <div className="metric-pill metric-pill-wide">
                    <span>Última ocorrência</span>
                    <strong>
                      {entry.lastSeenAt
                        ? new Date(entry.lastSeenAt).toLocaleString()
                        : "-"}
                    </strong>
                  </div>
                </div>

                <div className="catalog-card-actions">
                  <select
                    value={entry.status}
                    onChange={(event) =>
                      statusMutation.mutate({
                        id: entry.id,
                        status: event.target.value as (typeof catalogStatuses)[number],
                      })
                    }
                  >
                    {catalogStatuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  <button
                    className="ghost-button"
                    onClick={() => issueMutation.mutate(entry.id)}
                  >
                    Abrir issue
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() =>
                      setExpandedCatalogId((current) =>
                        current === entry.id ? null : entry.id,
                      )
                    }
                  >
                    {expandedCatalogId === entry.id ? "Ocultar DLQs" : "Ver DLQs"}
                  </button>
                  <Link className="text-link-button" to={`/issues?catalogId=${entry.id}`}>
                    Ver issues
                  </Link>
                </div>

                {expandedCatalogId === entry.id ? (
                  <CatalogOccurrences catalogId={entry.id} />
                ) : null}
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function CatalogOccurrences({ catalogId }: { catalogId: string }) {
  const { isKindIgnored, syncEnabled } = useAppSettings();
  const occurrencesQuery = useQuery({
    queryKey: ["catalog-occurrences", catalogId],
    queryFn: () => listOccurrences({ catalogId, limit: 12 }),
    refetchInterval: syncEnabled ? 15000 : false,
  });

  if (occurrencesQuery.isLoading) {
    return <div className="catalog-occurrences"><p className="muted-copy">Carregando ocorrências...</p></div>;
  }

  if (occurrencesQuery.isError || !occurrencesQuery.data) {
    return <div className="catalog-occurrences"><p className="muted-copy">Não foi possível carregar as ocorrências.</p></div>;
  }

  return (
    <div className="catalog-occurrences">
      <div className="catalog-occurrences-header">
        <div>
          <h4>Ocorrências relacionadas</h4>
          <p>
            {Math.min(occurrencesQuery.data.items.length, 12)} mais recentes de{" "}
            {occurrencesQuery.data.total}
          </p>
        </div>
      </div>

      <div className="catalog-occurrence-list">
        {occurrencesQuery.data.items.filter((occurrence) => !isKindIgnored(occurrence.kind))
          .length === 0 ? (
          <p className="muted-text">Nenhuma ocorrência visível com os filtros locais atuais.</p>
        ) : (
          occurrencesQuery.data.items
            .filter((occurrence) => !isKindIgnored(occurrence.kind))
            .map((occurrence) => (
              <CatalogOccurrenceRow key={occurrence.id} occurrence={occurrence} />
            ))
        )}
      </div>
    </div>
  );
}

function CatalogOccurrenceRow({
  occurrence,
}: {
  occurrence: Awaited<ReturnType<typeof listOccurrences>>["items"][number];
}) {
  const summary = summarizeOccurrence(occurrence);

  return (
    <Link className="catalog-occurrence-item" to={`/occurrences/${occurrence.id}`}>
      <div className="catalog-occurrence-topline">
        <strong>{occurrence.kind}</strong>
        <StatusBadge status={occurrence.status} />
      </div>

      <p className="catalog-occurrence-message" title={summary.message}>
        {summary.message}
      </p>

      <div className="catalog-occurrence-meta">
        {summary.identity ? (
          <span className="catalog-occurrence-chip" title={summary.identity}>
            {summary.identity}
          </span>
        ) : null}
        <small>{summary.timestamp}</small>
      </div>
    </Link>
  );
}
