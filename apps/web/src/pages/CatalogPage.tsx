import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ApiError,
  createIssueFromCatalog,
  listIssues,
  listCatalog,
  listOccurrences,
  updateCatalogStatus,
} from "../api/client";
import { IssueDetailModal } from "../components/IssueDetailModal";
import { OccurrenceDetailModal } from "../components/OccurrenceDetailModal";
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
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [expandedCatalogId, setExpandedCatalogId] = useState<string | null>(null);
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState<string | null>(null);
  const [issuesCatalogId, setIssuesCatalogId] = useState<string | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [issueFeedback, setIssueFeedback] = useState<{
    catalogId: string;
    kind: "success" | "error";
    message: string;
  } | null>(null);
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
    onSuccess: async (createdIssue, catalogId) => {
      setIssueFeedback({
        catalogId,
        kind: "success",
        message: `Issue criada com ${createdIssue.occurrenceCount} DLQs vinculadas.`,
      });
      setSelectedIssueId(createdIssue.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["catalog"] }),
        queryClient.invalidateQueries({ queryKey: ["issues"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["occurrences"] }),
      ]);
    },
    onError: (error, catalogId) => {
      setIssueFeedback({
        catalogId,
        kind: "error",
        message:
          error instanceof ApiError
            ? error.message
            : "Não foi possível abrir uma issue para esse erro recorrente.",
      });
    },
  });

  const filteredItems = useMemo(() => {
    const items = (catalogQuery.data?.items ?? [])
      .filter((entry) => !isKindIgnored(entry.kind))
      .filter((entry) => (statusFilter ? entry.status === statusFilter : true))
      .sort((left, right) => {
        if (right.occurrenceCount !== left.occurrenceCount) {
          return right.occurrenceCount - left.occurrenceCount;
        }

        const leftLastSeen = left.lastSeenAt ? new Date(left.lastSeenAt).getTime() : 0;
        const rightLastSeen = right.lastSeenAt ? new Date(right.lastSeenAt).getTime() : 0;

        return rightLastSeen - leftLastSeen;
      });

    return items;
  }, [catalogQuery.data?.items, isKindIgnored, statusFilter]);

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-heading">
          <p className="eyebrow">Erros recorrentes</p>
          <h2>Erros recorrentes</h2>
          <p className="page-summary">
            Veja erros recorrentes formados por várias DLQs, acompanhe o status técnico e abra issues apenas
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
            <p className="muted-text">Nenhum erro recorrente visível com os filtros locais atuais.</p>
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
                  <div className="catalog-card-side">
                    <span className="catalog-highlight">{entry.occurrenceCount} DLQs</span>
                    <StatusBadge status={entry.status} />
                  </div>
                </div>

                <div className="catalog-card-metrics">
                  <div className="metric-pill">
                    <span>DLQs</span>
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
                    <span>Última DLQ</span>
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
                    disabled={issueMutation.isPending}
                    onClick={() => {
                      setIssueFeedback(null);
                      issueMutation.mutate(entry.id);
                    }}
                  >
                    {issueMutation.isPending ? "Criando..." : "Abrir issue"}
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
                  <button
                    className="text-link-button"
                    onClick={() => setIssuesCatalogId(entry.id)}
                    type="button"
                  >
                    Ver issues
                  </button>
                </div>

                {expandedCatalogId === entry.id ? (
                  <CatalogOccurrences
                    catalogId={entry.id}
                    onOpenOccurrence={(occurrenceId) => setSelectedOccurrenceId(occurrenceId)}
                  />
                ) : null}

                {issueFeedback?.catalogId === entry.id ? (
                  <p className={`catalog-feedback ${issueFeedback.kind}`}>
                    {issueFeedback.message}
                  </p>
                ) : null}
              </article>
            ))
          )}
        </div>
      </section>

      {selectedOccurrenceId ? (
        <OccurrenceDetailModal
          occurrenceId={selectedOccurrenceId}
          onClose={() => setSelectedOccurrenceId(null)}
        />
      ) : null}

      {issuesCatalogId ? (
        <CatalogIssuesModal
          catalogId={issuesCatalogId}
          onClose={() => setIssuesCatalogId(null)}
          onSelectIssue={(issueId) => {
            setIssuesCatalogId(null);
            setSelectedIssueId(issueId);
          }}
        />
      ) : null}

      {selectedIssueId ? (
        <IssueDetailModal issueId={selectedIssueId} onClose={() => setSelectedIssueId(null)} />
      ) : null}
    </div>
  );
}

function CatalogOccurrences({
  catalogId,
  onOpenOccurrence,
}: {
  catalogId: string;
  onOpenOccurrence: (occurrenceId: string) => void;
}) {
  const { isKindIgnored, syncEnabled } = useAppSettings();
  const occurrencesQuery = useQuery({
    queryKey: ["catalog-occurrences", catalogId],
    queryFn: () => listOccurrences({ catalogId, limit: 12 }),
    refetchInterval: syncEnabled ? 15000 : false,
  });

  if (occurrencesQuery.isLoading) {
    return <div className="catalog-occurrences"><p className="muted-copy">Carregando DLQs...</p></div>;
  }

  if (occurrencesQuery.isError || !occurrencesQuery.data) {
    return <div className="catalog-occurrences"><p className="muted-copy">Não foi possível carregar as DLQs.</p></div>;
  }

  return (
    <div className="catalog-occurrences">
      <div className="catalog-occurrences-header">
        <div>
          <h4>DLQs relacionadas</h4>
          <p>
            {Math.min(occurrencesQuery.data.items.length, 12)} mais recentes de{" "}
            {occurrencesQuery.data.total}
          </p>
        </div>
      </div>

      <div className="catalog-occurrence-list">
        {occurrencesQuery.data.items.filter((occurrence) => !isKindIgnored(occurrence.kind))
          .length === 0 ? (
          <p className="muted-text">Nenhuma DLQ visível com os filtros locais atuais.</p>
        ) : (
          occurrencesQuery.data.items
            .filter((occurrence) => !isKindIgnored(occurrence.kind))
            .map((occurrence) => (
              <CatalogOccurrenceRow
                key={occurrence.id}
                occurrence={occurrence}
                onOpenOccurrence={onOpenOccurrence}
              />
            ))
        )}
      </div>
    </div>
  );
}

function CatalogOccurrenceRow({
  occurrence,
  onOpenOccurrence,
}: {
  occurrence: Awaited<ReturnType<typeof listOccurrences>>["items"][number];
  onOpenOccurrence: (occurrenceId: string) => void;
}) {
  const summary = summarizeOccurrence(occurrence);

  return (
    <button
      className="catalog-occurrence-item catalog-occurrence-button"
      onClick={() => onOpenOccurrence(occurrence.id)}
      type="button"
    >
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
    </button>
  );
}

function CatalogIssuesModal({
  catalogId,
  onClose,
  onSelectIssue,
}: {
  catalogId: string;
  onClose: () => void;
  onSelectIssue: (issueId: string) => void;
}) {
  const { isKindIgnored, syncEnabled } = useAppSettings();
  const issuesQuery = useQuery({
    queryKey: ["catalog-issues", catalogId],
    queryFn: () => listIssues({ catalogId, limit: 200 }),
    enabled: Boolean(catalogId),
    refetchInterval: syncEnabled ? 15000 : false,
  });

  const visibleIssues =
    issuesQuery.data?.items.filter((issue) => !isKindIgnored(issue.catalog?.kind ?? issue.kind)) ??
    [];

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section
        aria-modal="true"
        className="modal-panel catalog-issues-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">Issues do erro recorrente</p>
            <h3>Issues vinculadas</h3>
          </div>
          <button className="ghost-button modal-close-button" onClick={onClose} type="button">
            Fechar
          </button>
        </div>

        {issuesQuery.isLoading ? <p>Carregando issues...</p> : null}

        {issuesQuery.data ? (
          <div className="list modal-body">
          {visibleIssues.length === 0 ? (
            <p className="muted-text">Nenhuma issue encontrada para esse erro recorrente.</p>
          ) : (
            visibleIssues.map((issue) => (
              <button
                className="list-item catalog-issue-item"
                key={issue.id}
                onClick={() => onSelectIssue(issue.id)}
                type="button"
              >
                <div className="list-item-body">
                  <strong>{issue.title}</strong>
                  <p className="list-item-meta">
                    {issue.occurrenceCount} DLQs • {issue.kind ?? issue.catalog?.kind ?? "-"}
                  </p>
                </div>
                <StatusBadge status={issue.status} />
              </button>
              ))
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
