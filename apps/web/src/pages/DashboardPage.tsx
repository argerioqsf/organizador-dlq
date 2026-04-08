import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { getDashboard } from "../api/client";
import { IssueDetailModal } from "../components/IssueDetailModal";
import { OccurrenceDetailModal } from "../components/OccurrenceDetailModal";
import { StatCard } from "../components/StatCard";
import { StatusBadge } from "../components/StatusBadge";
import { useAppSettings } from "../settings/AppSettingsContext";

function summarizeIssue(title: string) {
  return title.length > 88 ? `${title.slice(0, 88)}...` : title;
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

  if (dashboardQuery.isLoading) {
    return <section className="panel">Carregando dashboard...</section>;
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return <section className="panel">Não foi possível carregar o dashboard.</section>;
  }

  const data = dashboardQuery.data;
  const filteredHighlightedIssues = data.highlightedIssues.filter(
    (issue) => !isKindIgnored(issue.catalog?.kind ?? issue.kind),
  );
  const filteredTopKinds = data.topKinds.filter((item) => !isKindIgnored(item.kind));
  const filteredRecentOccurrences = data.recentOccurrences.filter(
    (occurrence) => !isKindIgnored(occurrence.kind),
  );

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
        <StatCard label="Total de DLQs" value={data.totalOccurrences} tone="accent" />
        <StatCard label="Novas" value={data.statusCounts.new} />
        <StatCard label="Investigando" value={data.statusCounts.investigating} />
        <StatCard label="Resolvidas" value={data.statusCounts.resolved} />
        <StatCard label="Erros recorrentes abertos" value={data.catalogStatusCounts.open} />
        <StatCard label="Erros recorrentes pendentes" value={data.catalogStatusCounts.pending} />
        <StatCard label="Issues abertas" value={data.issueStatusCounts.open} />
        <StatCard label="Issues pendentes" value={data.issueStatusCounts.pending} />
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
            {data.topTopics.map((item) => (
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
          {filteredRecentOccurrences.length === 0 ? (
              <p className="muted-text">Nenhuma DLQ visível com os filtros locais atuais.</p>
            ) : (
              filteredRecentOccurrences.map((occurrence) => (
                <button
                  className="list-item occurrence-row dashboard-item-button"
                  key={occurrence.id}
                  onClick={() => setSelectedOccurrenceId(occurrence.id)}
                  type="button"
                >
                  <div className="occurrence-row-date">
                    {new Date(occurrence.createdAt).toLocaleString()}
                  </div>
                  <div className="occurrence-row-main">
                    <strong>{occurrence.kind}</strong>
                    <p className="list-item-meta">{occurrence.topic}</p>
                  </div>
                  <div className="occurrence-row-side">
                    <span className="subtle-label">Issue</span>
                    <p>{occurrence.issue?.title ?? "Sem issue"}</p>
                  </div>
                  <StatusBadge status={occurrence.status} />
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
