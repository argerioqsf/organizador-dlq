import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { ApiError, getMe } from "../api/client";
import { AppShell } from "../components/AppShell";
import { LoginScreen } from "../components/LoginScreen";
import { CatalogPage } from "../pages/CatalogPage";
import { DashboardPage } from "../pages/DashboardPage";
import { IssuesPage } from "../pages/IssuesPage";
import { ManualImportPage } from "../pages/ManualImportPage";
import { OccurrencesPage } from "../pages/OccurrencesPage";
import { ReportsPage } from "../pages/ReportsPage";
import { SettingsPage } from "../pages/SettingsPage";
import { AppSettingsProvider } from "../settings/AppSettingsContext";

const queryClient = new QueryClient();

function AuthenticatedApp() {
  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
    retry: false,
  });

  if (meQuery.isLoading) {
    return <main className="login-screen">Carregando...</main>;
  }

  if (
    meQuery.isError &&
    meQuery.error instanceof ApiError &&
    meQuery.error.status === 401
  ) {
    return <LoginScreen />;
  }

  if (meQuery.isError || !meQuery.data) {
    return <main className="login-screen">Não foi possível carregar a sessão.</main>;
  }

  return (
    <Routes>
      <Route element={<AppShell user={meQuery.data} />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/occurrences" element={<OccurrencesPage />} />
        <Route path="/occurrences/:occurrenceId" element={<OccurrencesPage />} />
        <Route path="/issues" element={<IssuesPage />} />
        <Route path="/issues/:issueId" element={<IssuesPage />} />
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/manual-import" element={<ManualImportPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppSettingsProvider>
        <BrowserRouter>
          <AuthenticatedApp />
        </BrowserRouter>
      </AppSettingsProvider>
    </QueryClientProvider>
  );
}
