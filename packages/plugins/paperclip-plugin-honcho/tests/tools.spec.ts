import { afterEach, describe, expect, it, vi } from "vitest";
import plugin from "../src/worker.js";
import { createHonchoHarness, installFetchMock, requestsMatching } from "./helpers.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("honcho tools", () => {
  it("requires issue context for honcho_get_issue_context", async () => {
    installFetchMock();
    const harness = createHonchoHarness();

    await plugin.definition.setup(harness.ctx);

    const result = await harness.executeTool("honcho_get_issue_context", {}, {
      companyId: "co_1",
      projectId: "proj_1",
      agentId: "agent_1",
      runId: "run_1",
    });

    expect(result.error).toBe("issueId is required");
  });

  it("uses workspace scope by default when no issue context is present", async () => {
    const { requests } = installFetchMock();
    const harness = createHonchoHarness();

    await plugin.definition.setup(harness.ctx);

    const result = await harness.executeTool("honcho_search_memory", { query: "auth regression" }, {
      companyId: "co_1",
      projectId: "proj_1",
      agentId: "agent_1",
      runId: "run_1",
    });

    expect(result.content).toContain("Relevant memory hit");
    const representationRequest = requestsMatching(requests, "/representation")[0];
    expect(representationRequest?.body).toMatchObject({
      search_query: "auth regression",
      search_top_k: 5,
    });
    expect(representationRequest?.body).not.toHaveProperty("session_id");
    expect(representationRequest?.body).not.toHaveProperty("target");
  });

  it("defaults search to the current issue session and honors explicit workspace overrides", async () => {
    const { requests } = installFetchMock();
    const harness = createHonchoHarness();

    await plugin.definition.setup(harness.ctx);

    await harness.executeTool("honcho_search_memory", { query: "auth regression" }, {
      companyId: "co_1",
      projectId: "proj_1",
      agentId: "agent_1",
      runId: "run_1",
      issueId: "iss_1",
    });
    await harness.executeTool("honcho_search_memory", { query: "auth regression", scope: "workspace" }, {
      companyId: "co_1",
      projectId: "proj_1",
      agentId: "agent_1",
      runId: "run_1",
      issueId: "iss_1",
    });

    const representationRequests = requestsMatching(requests, "/representation");
    expect(representationRequests).toHaveLength(2);
    expect(representationRequests[0]?.body).toMatchObject({
      session_id: "issue:iss_1",
      target: "issue:iss_1",
    });
    expect(representationRequests[1]?.body).not.toHaveProperty("session_id");
    expect(representationRequests[1]?.body).not.toHaveProperty("target");
  });

  it("does not register honcho_ask_peer when peer chat is disabled", async () => {
    installFetchMock();
    const harness = createHonchoHarness();

    await plugin.definition.setup(harness.ctx);

    await expect(
      harness.executeTool("honcho_ask_peer", { targetPeerId: "agent:agent_1", query: "Status?" }, {
        companyId: "co_1",
        projectId: "proj_1",
        agentId: "agent_1",
        runId: "run_1",
        issueId: "iss_1",
      }),
    ).rejects.toThrow("No tool handler registered");
  });

  it("registers and executes honcho_ask_peer when peer chat is enabled", async () => {
    installFetchMock();
    const harness = createHonchoHarness({
      config: {
        enablePeerChat: true,
      },
    });

    await plugin.definition.setup(harness.ctx);

    const result = await harness.executeTool("honcho_ask_peer", {
      targetPeerId: "agent:agent_1",
      query: "Status?",
    }, {
      companyId: "co_1",
      projectId: "proj_1",
      agentId: "agent_1",
      runId: "run_1",
      issueId: "iss_1",
    });

    expect(result.content).toContain("Peer answer");
  });
});
