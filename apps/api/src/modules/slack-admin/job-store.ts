import type { SlackBackfillJob } from "@dlq-organizer/shared";

import { backfillSlackMessages } from "../../integrations/slack/service.js";

type MutableSlackBackfillJob = {
  status: SlackBackfillJob["status"];
  requestedDays: number | null;
  processedCount: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  errorMessage: string | null;
};

const currentJob: MutableSlackBackfillJob = {
  status: "idle",
  requestedDays: null,
  processedCount: 0,
  startedAt: null,
  finishedAt: null,
  errorMessage: null,
};

function toSlackBackfillJob(job: MutableSlackBackfillJob): SlackBackfillJob {
  return {
    status: job.status,
    requestedDays: job.requestedDays,
    processedCount: job.processedCount,
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    errorMessage: job.errorMessage,
  };
}

function isRunning(job: MutableSlackBackfillJob): boolean {
  return job.status === "queued" || job.status === "running";
}

export function hasRunningSlackBackfillJob(): boolean {
  return isRunning(currentJob);
}

export function getSlackBackfillJob(): SlackBackfillJob {
  return toSlackBackfillJob(currentJob);
}

export function resetSlackBackfillJob() {
  currentJob.status = "idle";
  currentJob.requestedDays = null;
  currentJob.processedCount = 0;
  currentJob.startedAt = null;
  currentJob.finishedAt = null;
  currentJob.errorMessage = null;
}

export function startSlackBackfillJob(days: number): SlackBackfillJob {
  if (isRunning(currentJob)) {
    return toSlackBackfillJob(currentJob);
  }

  currentJob.status = "queued";
  currentJob.requestedDays = days;
  currentJob.processedCount = 0;
  currentJob.startedAt = new Date();
  currentJob.finishedAt = null;
  currentJob.errorMessage = null;

  queueMicrotask(async () => {
    currentJob.status = "running";

    try {
      const processedCount = await backfillSlackMessages(days);
      currentJob.status = "succeeded";
      currentJob.processedCount = processedCount;
      currentJob.finishedAt = new Date();
      currentJob.errorMessage = null;
    } catch (error) {
      currentJob.status = "failed";
      currentJob.finishedAt = new Date();
      currentJob.errorMessage =
        error instanceof Error ? error.message : "Slack backfill failed.";
    }
  });

  return toSlackBackfillJob(currentJob);
}
