import { afterEach, describe, expect, it, vi } from "vitest";
import plugin from "../src/worker.js";
import { createHonchoHarness, installFetchMock } from "./helpers.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("paperclip-plugin-honcho smoke", () => {
  it("covers the expected end-to-end plugin pipeline", async () => {
    installFetchMock();
    const harness = createHonchoHarness({
      config: {
        syncIssueDocuments: true,
        enablePeerChat: true,
      },
    });

    await plugin.definition.setup(harness.ctx);

    await harness.emit("issue.comment.created", { commentId: "c_2" }, {
      entityId: "iss_1",
      entityType: "issue",
      companyId: "co_1",
    });
    await harness.emit("issue.document.updated", { key: "design" }, {
      entityId: "iss_1",
      entityType: "issue",
      companyId: "co_1",
    });

    const contextResult = await harness.executeTool("honcho_get_issue_context", {}, {
      companyId: "co_1",
      projectId: "proj_1",
      agentId: "agent_1",
      runId: "run_1",
      issueId: "iss_1",
    });
    const searchResult = await harness.executeTool("honcho_search_memory", { query: "auth regression" }, {
      companyId: "co_1",
      projectId: "proj_1",
      agentId: "agent_1",
      runId: "run_1",
      issueId: "iss_1",
    });
    const askResult = await harness.executeTool("honcho_ask_peer", {
      targetPeerId: "agent:agent_1",
      query: "What happened?",
    }, {
      companyId: "co_1",
      projectId: "proj_1",
      agentId: "agent_1",
      runId: "run_1",
      issueId: "iss_1",
    });

    expect(contextResult.content).toContain("Investigating auth regression");
    expect(searchResult.content).toContain("Relevant memory hit");
    expect(askResult.content).toContain("Peer answer");

    const status = await harness.getData<Record<string, unknown>>("issue-memory-status", {
      issueId: "iss_1",
      companyId: "co_1",
    });
    expect(status.issueId).toBe("iss_1");

    await harness.performAction("resync-issue", { issueId: "iss_1", companyId: "co_1" });
    await harness.performAction("backfill-company", { companyId: "co_1" });
    const connection = await harness.performAction<Record<string, unknown>>("test-connection");
    expect(connection.ok).toBe(true);
  });
});
