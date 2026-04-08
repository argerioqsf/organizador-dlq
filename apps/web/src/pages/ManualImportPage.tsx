import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { importManualContent } from "../api/client";

export function ManualImportPage() {
  const queryClient = useQueryClient();
  const [sourceName, setSourceName] = useState("manual-import.txt");
  const [content, setContent] = useState("");

  const importMutation = useMutation({
    mutationFn: () => importManualContent({ content, sourceName }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["occurrences"] }),
        queryClient.invalidateQueries({ queryKey: ["issues"] }),
        queryClient.invalidateQueries({ queryKey: ["catalog"] }),
      ]);
    },
  });

  async function handleFileChange(file: File | null) {
    if (!file) {
      return;
    }

    setSourceName(file.name);
    setContent(await file.text());
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-heading">
          <p className="eyebrow">Teste inicial</p>
          <h2>Importação manual</h2>
          <p className="page-summary">
            Cole exportações do Slack ou envie arquivos de texto para alimentar o sistema
            antes da integração oficial com a API do Slack.
          </p>
        </div>
      </header>

      <section className="grid detail-layout">
        <article className="panel">
          <div className="stack">
            <label className="field">
              <span>Nome do arquivo</span>
              <input
                value={sourceName}
                onChange={(event) => setSourceName(event.target.value)}
              />
            </label>

            <label className="field">
              <span>Arquivo `.txt` ou `.log`</span>
              <input
                type="file"
                accept=".txt,.log,.md"
                onChange={(event) =>
                  handleFileChange(event.target.files?.[0] ?? null)
                }
              />
            </label>

            <label className="field">
              <span>Conteúdo copiado do Slack</span>
              <textarea
                className="big-textarea"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Cole aqui uma ou várias mensagens NEW DLQ MESSAGE"
              />
            </label>

            <button
              className="primary-button"
              disabled={!content.trim() || importMutation.isPending}
              onClick={() => importMutation.mutate()}
            >
              {importMutation.isPending ? "Importando..." : "Importar conteúdo"}
            </button>
          </div>
        </article>

        <article className="panel">
          <div className="section-title">
            <h3>Como usar</h3>
            <p>Fluxo rápido para validar parser, catálogos e triagem.</p>
          </div>
          <div className="stack muted-copy">
            <p>1. Copie uma ou várias mensagens do Slack contendo `NEW DLQ MESSAGE`.</p>
            <p>2. Cole no campo de texto ou selecione um arquivo texto.</p>
            <p>3. A importação usa o mesmo parser, catálogo e lógica de ocorrências do fluxo real.</p>
          </div>

          {importMutation.data ? (
            <section className="detail-section top-gap">
              <h3>Resultado</h3>
              <div className="detail-grid">
                <div>
                  <span className="eyebrow">Importadas</span>
                  <p>{importMutation.data.importedCount}</p>
                </div>
                <div>
                  <span className="eyebrow">Ignoradas</span>
                  <p>{importMutation.data.skippedCount}</p>
                </div>
                <div>
                  <span className="eyebrow">Issues no banco</span>
                  <p>{importMutation.data.issueCount}</p>
                </div>
                <div>
                  <span className="eyebrow">Catálogos no banco</span>
                  <p>{importMutation.data.catalogCount}</p>
                </div>
              </div>

              {importMutation.data.occurrenceIds.length > 0 ? (
                <div className="list top-gap">
                  {importMutation.data.occurrenceIds.slice(0, 10).map((id) => (
                    <Link className="list-item compact" key={id} to={`/occurrences/${id}`}>
                      <strong>{id}</strong>
                      <span>Abrir ocorrência</span>
                    </Link>
                  ))}
                </div>
              ) : null}

              {importMutation.data.skippedSamples.length > 0 ? (
                <section className="detail-section top-gap">
                  <h4>Amostras ignoradas</h4>
                  {importMutation.data.skippedSamples.map((sample, index) => (
                    <pre key={index}>{sample}</pre>
                  ))}
                </section>
              ) : null}
            </section>
          ) : null}
        </article>
      </section>
    </div>
  );
}
