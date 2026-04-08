import type {
  ApiListResponse,
  AuthenticatedUser,
  CatalogStatus,
  DashboardSummary,
  DlqOccurrence,
  ErrorCatalogEntry,
  Issue,
  IssueFilters,
  IssueStatus,
  ManualImportResult,
  OccurrenceFilters,
  OccurrenceStatus,
} from "@dlq-organizer/shared";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const payload = (await response.json()) as { message?: string };
      message = payload.message ?? message;
    } catch {
      message = response.statusText;
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function buildQuery(params: object) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (
      value !== undefined &&
      value !== "" &&
      (typeof value === "string" || typeof value === "number")
    ) {
      searchParams.set(key, String(value));
    }
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export { ApiError };

export function loginWithSlack() {
  window.location.href = `${API_BASE_URL}/auth/slack/login`;
}

export function logout() {
  return request<void>("/auth/logout", { method: "POST" });
}

export function getMe() {
  return request<AuthenticatedUser>("/api/me");
}

export function getDashboard() {
  return request<DashboardSummary>("/api/dashboard");
}

export function listOccurrences(filters: OccurrenceFilters = {}) {
  return request<ApiListResponse<DlqOccurrence>>(
    `/api/occurrences${buildQuery(filters)}`,
  );
}

export function getOccurrence(id: string) {
  return request<DlqOccurrence>(`/api/occurrences/${id}`);
}

export function updateOccurrenceStatus(id: string, status: OccurrenceStatus) {
  return request<DlqOccurrence>(`/api/occurrences/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function assignOccurrenceIssue(id: string, issueId: string) {
  return request<DlqOccurrence>(`/api/occurrences/${id}/issue`, {
    method: "POST",
    body: JSON.stringify({ issueId }),
  });
}

export function clearOccurrenceIssue(id: string) {
  return request<DlqOccurrence>(`/api/occurrences/${id}/issue`, {
    method: "DELETE",
  });
}

export function listIssues(filters: IssueFilters = {}) {
  return request<ApiListResponse<Issue>>(`/api/issues${buildQuery(filters)}`);
}

export function getIssue(id: string) {
  return request<Issue>(`/api/issues/${id}`);
}

export function createIssue(payload: {
  title?: string;
  description?: string;
  status?: IssueStatus;
  occurrenceIds?: string[];
  catalogId?: string;
  includeUnassignedOccurrences?: boolean;
}) {
  return request<Issue>("/api/issues", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateIssue(
  id: string,
  payload: {
    title?: string;
    description?: string | null;
    status?: IssueStatus;
  },
) {
  return request<Issue>(`/api/issues/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function addOccurrencesToIssue(id: string, occurrenceIds: string[]) {
  return request<Issue>(`/api/issues/${id}/occurrences`, {
    method: "POST",
    body: JSON.stringify({ occurrenceIds }),
  });
}

export function removeOccurrenceFromIssue(issueId: string, occurrenceId: string) {
  return request<Issue>(`/api/issues/${issueId}/occurrences/${occurrenceId}`, {
    method: "DELETE",
  });
}

export function listCatalog() {
  return request<ApiListResponse<ErrorCatalogEntry>>("/api/catalog");
}

export function updateCatalogStatus(id: string, status: CatalogStatus) {
  return request<ErrorCatalogEntry>(`/api/catalog/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function createIssueFromCatalog(
  id: string,
  payload: {
    title?: string;
    description?: string;
    status?: IssueStatus;
    includeUnassignedOccurrences?: boolean;
  } = {},
) {
  return request<Issue>(`/api/catalog/${id}/issues`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function importManualContent(payload: {
  content: string;
  sourceName?: string;
}) {
  return request<ManualImportResult>("/api/manual-import", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
