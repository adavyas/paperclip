import { afterEach, describe, expect, it, vi } from "vitest";
import plugin from "../src/worker.js";
import { createHonchoHarness, installFetchMock } from "./helpers.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("honcho actions and UI data", () => {
  it("backfill_company records company status and warns when all syncing is disabled", async () => {
    installFetchMock();
    const harness = createHonchoHarness({
      config: {
        syncIssueComments: false,
        syncIssueDocuments: false,
      },
    });

    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction("backfill-company", { companyId: "co_1" }) as Record<string, unknown>;
    expect(result.processedIssues).toBe(1);

    const companyState = harness.getState({
      scopeKind: "company",
      scopeId: "co_1",
      namespace: "honcho",
      stateKey: "company-sync-status",
    }) as Record<string, unknown>;
    expect(typeof companyState.lastBackfillAt).toBe("string");
    expect(companyState.lastError).toMatchObject({
      message: expect.stringContaining("syncing disabled"),
    });
  });

  it("surfaces the latest sync error through issue-memory-status for the issue tab", async () => {
    installFetchMock({ failOn: ["/messages"] });
    const harness = createHonchoHarness();

    await plugin.definition.setup(harness.ctx);
    await expect(harness.performAction("resync-issue", { issueId: "iss_1", companyId: "co_1" })).rejects.toThrow();

    const status = await harness.getData<Record<string, unknown>>("issue-memory-status", {
      issueId: "iss_1",
      companyId: "co_1",
    });

    expect(status.syncEnabled).toBe(true);
    expect(status.config).toMatchObject({
      syncIssueComments: true,
      syncIssueDocuments: false,
      enablePeerChat: false,
    });
    expect(status.lastError).toMatchObject({
      issueId: "iss_1",
      message: expect.stringContaining("forced failure"),
    });
  });
});
