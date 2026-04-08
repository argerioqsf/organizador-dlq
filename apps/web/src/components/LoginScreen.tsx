import { loginWithSlack } from "../api/client";

export function LoginScreen() {
  return (
    <main className="login-screen">
      <section className="login-card">
        <p className="eyebrow">Internal Tool</p>
        <h1>DLQ Organizer</h1>
        <p>
          Centralize as DLQs do canal de Slack, agrupe erros recorrentes e
          trate issues operacionais sem depender do histórico do canal.
        </p>
        <button className="primary-button" onClick={loginWithSlack}>
          Entrar com Slack
        </button>
      </section>
    </main>
  );
}
