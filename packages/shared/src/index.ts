export const occurrenceStatuses = [
  "new",
  "investigating",
  "resolved",
  "ignored",
] as const;

export type OccurrenceStatus = (typeof occurrenceStatuses)[number];

export const issueStatuses = [
  "open",
  "pending",
  "resolved",
  "canceled",
] as const;

export type IssueStatus = (typeof issueStatuses)[number];

export const catalogStatuses = [
  "open",
  "pending",
  "resolved",
  "canceled",
] as const;

export type CatalogStatus = (typeof catalogStatuses)[number];

export interface AuthenticatedUser {
  id: string;
  slackUserId: string;
  teamId: string;
  name: string;
  email?: string | null;
  image?: string | null;
}

export interface IssueSummary {
  id: string;
  title: string;
  status: IssueStatus;
}

export interface CatalogSummary {
  id: string;
  topic: string;
  kind: string;
  fingerprint: string;
  status?: CatalogStatus;
}

export interface DlqOccurrence {
  id: string;
  channelId: string;
  slackTs: string;
  source: string | null;
  topic: string;
  kind: string;
  messageKey: string | null;
  externalReference: string | null;
  errorMessage: string | null;
  errorResponse: string | null;
  errorStack: string | null;
  curl: string | null;
  fingerprint: string;
  searchableText: string;
  status: OccurrenceStatus;
  slackPermalink: string | null;
  issueId: string | null;
  catalogId: string;
  updatedBySlackUserId: string | null;
  createdAt: string;
  updatedAt: string;
  issue?: IssueSummary | null;
  catalog?: CatalogSummary | null;
}

export interface ErrorCatalogEntry {
  id: string;
  topic: string;
  kind: string;
  fingerprint: string;
  signatureText: string;
  status: CatalogStatus;
  createdAt: string;
  updatedAt: string;
  occurrenceCount: number;
  openIssueCount: number;
  totalIssueCount: number;
  lastSeenAt: string | null;
}

export interface Issue {
  id: string;
  title: string;
  description: string | null;
  status: IssueStatus;
  autoCreated: boolean;
  topic: string | null;
  kind: string | null;
  fingerprint: string | null;
  updatedBySlackUserId: string | null;
  createdAt: string;
  updatedAt: string;
  occurrenceCount: number;
  lastOccurrenceAt: string | null;
  catalog?: CatalogSummary | null;
  occurrences?: DlqOccurrence[];
}

export interface DashboardSummary {
  totalOccurrences: number;
  statusCounts: Record<OccurrenceStatus, number>;
  issueStatusCounts: Record<IssueStatus, number>;
  catalogStatusCounts: Record<CatalogStatus, number>;
  topTopics: Array<{ topic: string; count: number }>;
  topKinds: Array<{ kind: string; count: number }>;
  recentOccurrences: DlqOccurrence[];
  highlightedIssues: Issue[];
}

export interface OccurrenceFilters {
  search?: string;
  topic?: string;
  kind?: string;
  status?: OccurrenceStatus;
  issueId?: string;
  catalogId?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface IssueFilters {
  search?: string;
  status?: IssueStatus;
  topic?: string;
  kind?: string;
  catalogId?: string;
  limit?: number;
}

export interface ApiListResponse<T> {
  items: T[];
  total: number;
}

export interface ManualImportResult {
  importedCount: number;
  skippedCount: number;
  issueCount: number;
  catalogCount: number;
  occurrenceIds: string[];
  skippedSamples: string[];
}

export interface SlackBackfillResult {
  requestedDays: number;
  processedCount: number;
}

export type SlackBackfillJobStatus =
  | "idle"
  | "queued"
  | "running"
  | "succeeded"
  | "failed";

export interface SlackBackfillJob {
  status: SlackBackfillJobStatus;
  requestedDays: number | null;
  processedCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
}

export interface IssueSlackSyncResult {
  issueId: string;
  postedReplyCount: number;
  addedReactionCount: number;
  skippedCount: number;
}
