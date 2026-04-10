import { describe, expect, it } from "vitest";

import {
  resolveCatalogBackfillPlan,
  resolveCatalogStatusAfterManualOccurrenceUpdate,
  resolveCatalogStatusFromCurrentState,
  resolveCatalogStatusAfterOccurrenceResolution,
} from "./automation.js";

describe("resolveCatalogBackfillPlan", () => {
  it("keeps catalog pending when there is any active issue", () => {
    expect(
      resolveCatalogBackfillPlan({
        currentStatus: "resolved",
        occurrenceStatuses: ["resolved"],
        newOccurrenceStatuses: [],
        activeIssueCount: 1,
        unassignedOccurrenceCount: 0,
      }),
    ).toEqual({
      nextCatalogStatus: "pending",
      shouldCreateAutoIssue: false,
      shouldAttachToActiveIssue: false,
    });
  });

  it("keeps the catalog resolved when all occurrences are resolved", () => {
    expect(
      resolveCatalogBackfillPlan({
        currentStatus: "resolved",
        occurrenceStatuses: ["resolved", "resolved"],
        newOccurrenceStatuses: ["resolved"],
        activeIssueCount: 0,
        unassignedOccurrenceCount: 1,
      }).nextCatalogStatus,
    ).toBe("resolved");
  });

  it("moves the catalog to pending when a new resolved DLQ is added but other DLQs are still unresolved", () => {
    expect(
      resolveCatalogBackfillPlan({
        currentStatus: "open",
        occurrenceStatuses: ["resolved", "new", "new"],
        newOccurrenceStatuses: ["resolved"],
        activeIssueCount: 0,
        unassignedOccurrenceCount: 1,
      }).nextCatalogStatus,
    ).toBe("pending");
  });

  it("resolves the catalog when every occurrence is resolved and there is no new input", () => {
    expect(
      resolveCatalogBackfillPlan({
        currentStatus: "pending",
        occurrenceStatuses: ["resolved", "resolved"],
        newOccurrenceStatuses: [],
        activeIssueCount: 0,
        unassignedOccurrenceCount: 0,
      }).nextCatalogStatus,
    ).toBe("resolved");
  });

  it("creates an auto issue only when a new investigating occurrence was added", () => {
    expect(
      resolveCatalogBackfillPlan({
        currentStatus: "open",
        occurrenceStatuses: ["investigating"],
        newOccurrenceStatuses: ["investigating"],
        activeIssueCount: 0,
        unassignedOccurrenceCount: 2,
      }),
    ).toEqual({
      nextCatalogStatus: "pending",
      shouldCreateAutoIssue: true,
      shouldAttachToActiveIssue: false,
    });
  });

  it("keeps the catalog open when there are only new occurrences and no active issue", () => {
    expect(
      resolveCatalogBackfillPlan({
        currentStatus: "pending",
        occurrenceStatuses: ["new", "new", "resolved"],
        newOccurrenceStatuses: ["new"],
        activeIssueCount: 0,
        unassignedOccurrenceCount: 3,
      }),
    ).toEqual({
      nextCatalogStatus: "open",
      shouldCreateAutoIssue: false,
      shouldAttachToActiveIssue: false,
    });
  });

  it("attaches unassigned occurrences to an existing active issue", () => {
    expect(
      resolveCatalogBackfillPlan({
        currentStatus: "pending",
        occurrenceStatuses: ["new", "investigating"],
        newOccurrenceStatuses: ["new"],
        activeIssueCount: 1,
        unassignedOccurrenceCount: 3,
      }),
    ).toEqual({
      nextCatalogStatus: "pending",
      shouldCreateAutoIssue: false,
      shouldAttachToActiveIssue: true,
    });
  });
});

describe("resolveCatalogStatusAfterOccurrenceResolution", () => {
  it("resolves the catalog when every DLQ is resolved", () => {
    expect(
      resolveCatalogStatusAfterOccurrenceResolution(["resolved", "resolved"]),
    ).toBe("resolved");
  });

  it("reopens the catalog when there is any non-resolved DLQ left", () => {
    expect(
      resolveCatalogStatusAfterOccurrenceResolution(["resolved", "new"]),
    ).toBe("open");
  });
});

describe("resolveCatalogStatusFromCurrentState", () => {
  it("keeps the catalog pending when there is an active issue", () => {
    expect(
      resolveCatalogStatusFromCurrentState({
        occurrenceStatuses: ["new", "new"],
        activeIssueCount: 1,
      }),
    ).toBe("pending");
  });

  it("keeps the catalog pending when there is any investigating DLQ", () => {
    expect(
      resolveCatalogStatusFromCurrentState({
        occurrenceStatuses: ["new", "investigating"],
        activeIssueCount: 0,
      }),
    ).toBe("pending");
  });

  it("resolves the catalog when every DLQ is resolved", () => {
    expect(
      resolveCatalogStatusFromCurrentState({
        occurrenceStatuses: ["resolved", "resolved"],
        activeIssueCount: 0,
      }),
    ).toBe("resolved");
  });

  it("reopens the catalog when all DLQs are new and there is no active issue", () => {
    expect(
      resolveCatalogStatusFromCurrentState({
        occurrenceStatuses: ["new", "new"],
        activeIssueCount: 0,
      }),
    ).toBe("open");
  });
});

describe("resolveCatalogStatusAfterManualOccurrenceUpdate", () => {
  it("moves the catalog to pending when a DLQ is manually marked resolved and others are still unresolved", () => {
    expect(
      resolveCatalogStatusAfterManualOccurrenceUpdate({
        occurrenceStatuses: ["resolved", "new"],
        activeIssueCount: 0,
        changedToStatus: "resolved",
      }),
    ).toBe("pending");
  });

  it("keeps the catalog open when a DLQ is manually moved back to new and there are no active issues", () => {
    expect(
      resolveCatalogStatusAfterManualOccurrenceUpdate({
        occurrenceStatuses: ["new", "new"],
        activeIssueCount: 0,
        changedToStatus: "new",
      }),
    ).toBe("open");
  });

  it("keeps the catalog resolved when every DLQ is resolved", () => {
    expect(
      resolveCatalogStatusAfterManualOccurrenceUpdate({
        occurrenceStatuses: ["resolved", "resolved"],
        activeIssueCount: 0,
        changedToStatus: "resolved",
      }),
    ).toBe("resolved");
  });
});
