import { useEffect, useState } from "react";
import type { AuthenticatedUser } from "@dlq-organizer/shared";
import { NavLink, Outlet } from "react-router-dom";

import { logout } from "../api/client";

interface AppShellProps {
  user: AuthenticatedUser;
}

type ThemeMode = "dark" | "light";

function SunIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="4.5" />
      <path
        d="M12 2.5v2.25M12 19.25v2.25M21.5 12h-2.25M4.75 12H2.5M18.72 5.28l-1.6 1.6M6.88 17.12l-1.6 1.6M18.72 18.72l-1.6-1.6M6.88 6.88l-1.6-1.6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M15.4 3.5a8.9 8.9 0 1 0 5.1 15.95A9.5 9.5 0 0 1 15.4 3.5Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function AppShell({ user }: AppShellProps) {
  const [theme, setTheme] = useState<ThemeMode>("dark");

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("dlq-organizer-theme");
    const initialTheme: ThemeMode =
      storedTheme === "light" || storedTheme === "dark" ? storedTheme : "dark";

    setTheme(initialTheme);
    document.documentElement.dataset.theme = initialTheme;
  }, []);

  function toggleTheme() {
    const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("dlq-organizer-theme", nextTheme);
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-header-top">
            <div className="stack-tight">
              <p className="eyebrow">Slack DLQ Ops</p>
              <h1>DLQ Organizer</h1>
            </div>
            <button
              aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
              className={`theme-toggle theme-toggle-${theme}`}
              onClick={toggleTheme}
              type="button"
            >
              <span className={`theme-icon ${theme === "light" ? "active" : ""}`}>
                <SunIcon />
              </span>
              <span className={`theme-icon ${theme === "dark" ? "active" : ""}`}>
                <MoonIcon />
              </span>
            </button>
          </div>
          <p className="sidebar-subtitle">DLQs, erros recorrentes e acompanhamento em um só fluxo.</p>
        </div>

        <div className="sidebar-body">
          <nav className="nav">
            <NavLink to="/">Dashboard</NavLink>
            <NavLink to="/occurrences">DLQs</NavLink>
            <NavLink to="/issues">Issues</NavLink>
            <NavLink to="/catalog">Erros recorrentes</NavLink>
            <NavLink to="/reports">Relatórios</NavLink>
            <NavLink to="/manual-import">Importar Manual</NavLink>
            <NavLink to="/settings">Configurações</NavLink>
          </nav>

          <div className="sidebar-footer">
            <div className="user-card">
              {user.image ? <img src={user.image} alt={user.name} /> : null}
              <div className="sidebar-identity">
                <strong>{user.name}</strong>
                <span>{user.email ?? user.slackUserId}</span>
              </div>
            </div>
            <button
              className="ghost-button"
              onClick={async () => {
                await logout();
                window.location.reload();
              }}
            >
              Sair
            </button>
          </div>
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
