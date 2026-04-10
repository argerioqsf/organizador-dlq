import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import type { DlqOccurrence } from "@dlq-organizer/shared";

import { getDashboard } from "../api/client";
import { IssueDetailModal } from "../components/IssueDetailModal";
import { OccurrenceDetailModal } from "../components/OccurrenceDetailModal";
import { StatCard } from "../components/StatCard";
import { StatusBadge } from "../components/StatusBadge";
import { useAppSettings } from "../settings/AppSettingsContext";

function summarizeIssue(title: string) {
  return title.length > 88 ? `${title.slice(0, 88)}...` : title;
}

function buildRecentDlqGroupKey(occurrence: DlqOccurrence) {
  return occurrence.catalogId || `${occurrence.topic}::${occurrence.kind}::${occurrence.fingerprint}`;
}

function groupRecentDlqs(items: DlqOccurrence[]) {
  const groups = new Map<
    string,
    {
      representative: DlqOccurrence;
      count: number;
      issueTitles: Set<string>;
    }
  >();

  for (const occurrence of items) {
    const key = buildRecentDlqGroupKey(occurrence);
    const current = groups.get(key);

    if (!current) {
      groups.set(key, {
        representative: occurrence,
        count: 1,
        issueTitles: new Set(occurrence.issue?.title ? [occurrence.issue.title] : []),
      });
      continue;
    }

    current.count += 1;
    if (occurrence.issue?.title) {
      current.issueTitles.add(occurrence.issue.title);
    }

    if (new Date(occurrence.createdAt).getTime() > new Date(current.representative.createdAt).getTime()) {
      current.representative = occurrence;
    }
  }

  return Array.from(groups.values()).sort(
    (left, right) =>
      new Date(right.representative.createdAt).getTime() -
      new Date(left.representative.createdAt).getTime(),
  );
}

export function DashboardPage() {
  const { isKindIgnored, syncEnabled } = useAppSettings();
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState<string | null>(null);
  const dashboardQuery = useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboard,
    refetchInterval: syncEnabled ? 15000 : false,
  });
  const data = dashboardQuery.data;
  const filteredHighlightedIssues = (data?.highlightedIssues ?? []).filter(
    (issue) => !isKindIgnored(issue.catalog?.kind ?? issue.kind),
  );
  const filteredTopKinds = (data?.topKinds ?? []).filter((item) => !isKindIgnored(item.kind));
  const filteredRecentOccurrences = (data?.recentOccurrences ?? []).filter((occurrence) =>
    !isKindIgnored(occurrence.kind),
  );
  const groupedRecentOccurrences = useMemo(
    () => groupRecentDlqs(filteredRecentOccurrences),
    [filteredRecentOccurrences],
  );

  if (dashboardQuery.isLoading) {
    return <section className="panel">Carregando dashboard...</section>;
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return <section className="panel">Não foi possível carregar o dashboard.</section>;
  }

  const dashboardData = dashboardQuery.data;

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-heading">
          <p className="eyebrow">Visão Geral</p>
          <h2>Dashboard</h2>
          <p className="page-summary">
            Acompanhe volume, erros recorrentes ativos, issues em tratamento e a fila mais recente
            sem depender do histórico do Slack.
          </p>
        </div>
        <div className="page-actions">
          <Link className="ghost-button" to="/catalog">
            Abrir erros recorrentes
          </Link>
          <Link className="primary-button button-link" to="/manual-import">
            Importar dados
          </Link>
        </div>
      </header>

      <section className="stats-grid">
        <StatCard label="Total de DLQs" value={dashboardData.totalOccurrences} tone="accent" />
        <StatCard label="Novas" value={dashboardData.statusCounts.new} />
        <StatCard label="Investigando" value={dashboardData.statusCounts.investigating} />
        <StatCard label="Resolvidas" value={dashboardData.statusCounts.resolved} />
        <StatCard label="Erros recorrentes abertos" value={dashboardData.catalogStatusCounts.open} />
        <StatCard label="Erros recorrentes pendentes" value={dashboardData.catalogStatusCounts.pending} />
        <StatCard label="Issues abertas" value={dashboardData.issueStatusCounts.open} />
        <StatCard label="Issues pendentes" value={dashboardData.issueStatusCounts.pending} />
      </section>

      <section className="grid two-columns">
        <article className="panel">
          <div className="panel-header">
            <h3>Issues em acompanhamento</h3>
            <Link to="/issues">Abrir área de issues</Link>
          </div>
          <div className="list">
            {filteredHighlightedIssues.length === 0 ? (
              <p className="muted-text">Nenhuma issue visível com os filtros locais atuais.</p>
            ) : (
              filteredHighlightedIssues.map((issue) => (
                <button
                  className="list-item dashboard-item-button"
                  key={issue.id}
                  onClick={() => setSelectedIssueId(issue.id)}
                  type="button"
                >
                  <div className="list-item-body">
                    <strong>{summarizeIssue(issue.title)}</strong>
                    <p className="list-item-meta">{issue.occurrenceCount} DLQs vinculadas</p>
                  </div>
                  <StatusBadge status={issue.status} />
                </button>
              ))
            )}
          </div>
        </article>

        <article className="panel stack">
          <div className="section-title">
            <h3>Top tópicos</h3>
            <p>Onde o volume está concentrado.</p>
          </div>
          <div className="list">
            {dashboardData.topTopics.map((item) => (
              <div className="list-item compact" key={item.topic}>
                <strong>{item.topic}</strong>
                <span>{item.count}</span>
              </div>
            ))}
          </div>

          <div className="section-title subsection-title">
            <h3>Top kinds</h3>
            <p>Os padrões de evento mais recorrentes.</p>
          </div>
          <div className="list">
            {filteredTopKinds.length === 0 ? (
              <p className="muted-text">Nenhum kind visível com os filtros locais atuais.</p>
            ) : (
              filteredTopKinds.map((item) => (
                <div className="list-item compact" key={item.kind}>
                  <strong>{item.kind}</strong>
                  <span>{item.count}</span>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>Últimas DLQs</h3>
          <Link to="/occurrences">Ver todas</Link>
        </div>
        <div className="list">
          {groupedRecentOccurrences.length === 0 ? (
            <p className="muted-text">Nenhuma DLQ visível com os filtros locais atuais.</p>
          ) : (
              groupedRecentOccurrences.map(({ representative, count, issueTitles }) => (
                <button
                  className="list-item occurrence-row dashboard-item-button"
                  key={representative.id}
                  onClick={() => setSelectedOccurrenceId(representative.id)}
                  type="button"
                >
                  <div className="occurrence-row-date">
                    {new Date(representative.createdAt).toLocaleString()}
                  </div>
                  <div className="occurrence-row-main">
                    <div className="occurrence-row-title">
                      <strong>{representative.kind}</strong>
                      {count > 1 ? (
                        <span className="dashboard-cluster-badge">{count} DLQs</span>
                      ) : null}
                    </div>
                    <p className="list-item-meta">{representative.topic}</p>
                    <small className="list-item-caption">
                      {count > 1
                        ? `${count} DLQs semelhantes entre as últimas recebidas`
                        : "1 DLQ recente"}
                    </small>
                  </div>
                  <div className="occurrence-row-side">
                    <span className="subtle-label">Issue</span>
                    <p>
                      {issueTitles.size === 0
                        ? "Sem issue"
                        : issueTitles.size === 1
                          ? Array.from(issueTitles)[0]
                          : `${issueTitles.size} issues relacionadas`}
                    </p>
                  </div>
                  <StatusBadge status={representative.status} />
                </button>
              ))
            )}
        </div>
      </section>

      {selectedIssueId ? (
        <IssueDetailModal issueId={selectedIssueId} onClose={() => setSelectedIssueId(null)} />
      ) : null}

      {selectedOccurrenceId ? (
        <OccurrenceDetailModal
          occurrenceId={selectedOccurrenceId}
          onClose={() => setSelectedOccurrenceId(null)}
        />
      ) : null}
    </div>
  );
}
