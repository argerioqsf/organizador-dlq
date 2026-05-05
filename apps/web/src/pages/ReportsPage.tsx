import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { ReportStatusFilter } from "@dlq-organizer/shared";

import {
  downloadOperationalReportPdf,
  publishOperationalReportToConfluence,
} from "../api/client";

const REPORT_STATUS_OPTIONS: Array<{
  value: ReportStatusFilter;
  label: string;
}> = [
  { value: "pending", label: "Pendente" },
  { value: "in_progress", label: "Em andamento" },
  { value: "resolved", label: "Concluído" },
];

function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function ReportsPage() {
  const defaultDates = useMemo(() => {
    const to = new Date();
    const from = new Date(to);
    from.setDate(to.getDate() - 7);

    return {
      from: toInputDate(from),
      to: toInputDate(to),
    };
  }, []);

  const [fromDate, setFromDate] = useState(defaultDates.from);
  const [toDate, setToDate] = useState(defaultDates.to);
  const [statuses, setStatuses] = useState<ReportStatusFilter[]>([
    "pending",
    "in_progress",
    "resolved",
  ]);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [confluenceMessage, setConfluenceMessage] = useState<string | null>(null);
  const [confluenceLink, setConfluenceLink] = useState<string | null>(null);

  function toggleStatus(status: ReportStatusFilter) {
    setStatuses((current) =>
      current.includes(status)
        ? current.filter((value) => value !== status)
        : [...current, status],
    );
  }

  const downloadMutation = useMutation({
    mutationFn: () =>
      downloadOperationalReportPdf({
        from: fromDate,
        to: toDate,
        statuses,
      }),
    onSuccess: ({ blob, filename }) => {
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      window.URL.revokeObjectURL(url);
      setDownloadMessage("Relatório gerado e download iniciado.");
    },
    onError: () => {
      setDownloadMessage(null);
    },
  });

  const confluenceMutation = useMutation({
    mutationFn: () =>
      publishOperationalReportToConfluence({
        from: fromDate,
        to: toDate,
        statuses,
      }),
    onSuccess: (result) => {
      setConfluenceMessage(`Página criada no Confluence: ${result.title}`);
      setConfluenceLink(result.url);
    },
    onError: () => {
      setConfluenceMessage(null);
      setConfluenceLink(null);
    },
  });

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-heading">
          <p className="eyebrow">Análises</p>
          <h2>Relatórios</h2>
          <p className="page-summary">
            Gere um relatório operacional a partir de um intervalo específico. Você pode
            baixar em PDF ou publicar o conteúdo em uma página do Confluence.
          </p>
        </div>
      </header>

      <section className="grid two-columns">
        <article className="panel stack">
          <div className="section-title">
            <h3>Gerar relatório</h3>
            <p>
              O conteúdo é organizado por kind, agrupando casos recorrentes com
              recorrência, descrição e links para Slack e Kafka.
            </p>
          </div>

          <div className="report-grid">
            <label className="field">
              <span>Data inicial</span>
              <input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
              />
            </label>

            <label className="field">
              <span>Data final</span>
              <input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
              />
            </label>
          </div>

          <div className="field">
            <span>Status incluídos no relatório</span>
            <div className="report-status-grid">
              {REPORT_STATUS_OPTIONS.map((option) => (
                <label className="report-status-option" key={option.value}>
                  <input
                    checked={statuses.includes(option.value)}
                    onChange={() => toggleStatus(option.value)}
                    type="checkbox"
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="action-row">
            <button
              className="primary-button"
              disabled={
                !fromDate ||
                !toDate ||
                statuses.length === 0 ||
                downloadMutation.isPending
              }
              onClick={() => {
                setDownloadMessage(null);
                downloadMutation.mutate();
              }}
              type="button"
            >
              {downloadMutation.isPending ? "Gerando PDF..." : "Baixar relatório"}
            </button>
            <button
              className="ghost-button"
              disabled={
                !fromDate ||
                !toDate ||
                statuses.length === 0 ||
                confluenceMutation.isPending
              }
              onClick={() => {
                setConfluenceMessage(null);
                setConfluenceLink(null);
                confluenceMutation.mutate();
              }}
              type="button"
            >
              {confluenceMutation.isPending
                ? "Publicando..."
                : "Publicar no Confluence"}
            </button>
          </div>

          {downloadMessage ? <p className="catalog-feedback success">{downloadMessage}</p> : null}

          {statuses.length === 0 ? (
            <p className="catalog-feedback error">
              Selecione pelo menos um status para gerar o relatório.
            </p>
          ) : null}

          {confluenceMessage ? (
            <p className="catalog-feedback success">
              {confluenceMessage}
              {confluenceLink ? (
                <>
                  {" "}
                  <a href={confluenceLink} rel="noreferrer" target="_blank">
                    Abrir página
                  </a>
                </>
              ) : null}
            </p>
          ) : null}

          {downloadMutation.isError ? (
            <p className="catalog-feedback error">
              Não foi possível gerar o relatório. Revise o intervalo informado e tente
              novamente.
            </p>
          ) : null}

          {confluenceMutation.isError ? (
            <p className="catalog-feedback error">
              Não foi possível publicar no Confluence. Revise as envs da integração e tente
              novamente.
            </p>
          ) : null}
        </article>

        <article className="panel stack">
          <div className="section-title">
            <h3>Saídas disponíveis</h3>
          </div>

          <p className="muted-text">1. PDF para download rápido e compartilhamento externo.</p>
          <p className="muted-text">
            2. Página no Confluence no modelo agrupado por kind e casos recorrentes.
          </p>
          <p className="muted-text">
            3. Links diretos para Slack e Kafka na DLQ de referência de cada caso.
          </p>
          <p className="muted-text">
            4. Você pode restringir o relatório para pendentes, em andamento e/ou concluídos.
          </p>
        </article>
      </section>
    </div>
  );
}
