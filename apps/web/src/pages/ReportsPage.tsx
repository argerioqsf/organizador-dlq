import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { downloadOperationalReportPdf } from "../api/client";

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
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);

  const downloadMutation = useMutation({
    mutationFn: () =>
      downloadOperationalReportPdf({
        from: fromDate,
        to: toDate,
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

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-heading">
          <p className="eyebrow">Análises</p>
          <h2>Relatórios</h2>
          <p className="page-summary">
            Gere um PDF com a situação das issues, erros recorrentes e DLQs em um
            intervalo específico. O relatório inclui links para abrir cada DLQ direto no
            Slack.
          </p>
        </div>
      </header>

      <section className="grid two-columns">
        <article className="panel stack">
          <div className="section-title">
            <h3>Gerar relatório PDF</h3>
            <p>
              O relatório usa o horário real das mensagens no Slack e organiza o conteúdo
              em resumo executivo, issues do período, erros recorrentes impactados e lista
              de DLQs com link direto.
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

          <div className="action-row">
            <button
              className="primary-button"
              disabled={!fromDate || !toDate || downloadMutation.isPending}
              onClick={() => {
                setDownloadMessage(null);
                downloadMutation.mutate();
              }}
              type="button"
            >
              {downloadMutation.isPending ? "Gerando PDF..." : "Baixar relatório"}
            </button>
          </div>

          {downloadMessage ? <p className="catalog-feedback success">{downloadMessage}</p> : null}

          {downloadMutation.isError ? (
            <p className="catalog-feedback error">
              Não foi possível gerar o relatório. Revise o intervalo informado e tente
              novamente.
            </p>
          ) : null}
        </article>

        <article className="panel stack">
          <div className="section-title">
            <h3>O que entra no documento</h3>
          </div>

          <p className="muted-text">1. Resumo com volumes e distribuição por status.</p>
          <p className="muted-text">2. Issues relacionadas às DLQs do período.</p>
          <p className="muted-text">3. Erros recorrentes impactados no intervalo.</p>
          <p className="muted-text">4. Lista compacta de DLQs com link para o Slack.</p>
        </article>
      </section>
    </div>
  );
}
