import { useMemo, useState } from "react";

import { useAppSettings } from "../settings/AppSettingsContext";

export function SettingsPage() {
  const { syncEnabled, setSyncEnabled, ignoredKinds, addIgnoredKinds, removeIgnoredKind } =
    useAppSettings();
  const [draftKinds, setDraftKinds] = useState("");

  const ignoredKindsPreview = useMemo(
    () => ignoredKinds.slice().sort((left, right) => left.localeCompare(right)),
    [ignoredKinds],
  );

  function handleAddKinds() {
    addIgnoredKinds(draftKinds);
    setDraftKinds("");
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-heading">
          <p className="eyebrow">Aplicação</p>
          <h2>Configurações</h2>
          <p className="page-summary">
            Ajuste o comportamento local da aplicação sem depender de configuração no banco.
          </p>
        </div>
      </header>

      <section className="grid two-columns">
        <article className="panel stack">
          <div className="section-title">
            <h3>Sincronização automática</h3>
            <p>
              Controla o auto-refresh do front para acompanhar novas mensagens já ingeridas
              pelo backend.
            </p>
          </div>

          <div className="settings-toggle-row">
            <div>
              <strong>{syncEnabled ? "Ativada" : "Desativada"}</strong>
              <p className="muted-text">
                Quando ativa, as telas principais atualizam automaticamente no navegador.
              </p>
            </div>
            <button
              className={`settings-switch ${syncEnabled ? "active" : ""}`}
              onClick={() => setSyncEnabled(!syncEnabled)}
              type="button"
            >
              <span />
            </button>
          </div>
        </article>

        <article className="panel stack">
          <div className="section-title">
            <h3>Kinds ignorados</h3>
            <p>
              Esconda kinds que não fazem sentido para sua rotina. Essa filtragem vale nas
              telas de dashboard, catálogo, issues e ocorrências.
            </p>
          </div>

          <div className="stack">
            <textarea
              placeholder="Adicione um ou mais kinds, separados por vírgula ou quebra de linha"
              value={draftKinds}
              onChange={(event) => setDraftKinds(event.target.value)}
            />
            <div className="action-row">
              <button className="primary-button" onClick={handleAddKinds} type="button">
                Salvar kinds ignorados
              </button>
            </div>
          </div>

          <div className="settings-chip-list">
            {ignoredKindsPreview.length === 0 ? (
              <p className="muted-text">Nenhum kind ignorado configurado.</p>
            ) : (
              ignoredKindsPreview.map((kind) => (
                <button
                  className="settings-chip"
                  key={kind}
                  onClick={() => removeIgnoredKind(kind)}
                  type="button"
                >
                  {kind}
                  <span>Remover</span>
                </button>
              ))
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
