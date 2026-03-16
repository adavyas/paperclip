import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { peerIdForAgent, sessionIdForIssue, workspaceIdForCompany } from "../src/ids.js";
import { actorFromComment, buildCommentProvenance } from "../src/provenance.js";
import type { Issue, IssueComment, IssueDocument, DocumentRevision } from "@paperclipai/plugin-sdk";

const BASE_CONFIG = {
  honchoApiBaseUrl: "https://api.honcho.dev",
  honchoApiKeySecretRef: "HONCHO_API_KEY",
  workspacePrefix: "paperclip",
  syncIssueComments: true,
  syncIssueDocuments: false,
  enablePeerChat: false,
};

afterEach(() => {
  vi.restoreAllMocks();
});

function installFetchMock() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/v2/workspaces")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (url.includes("/representation")) {
      return new Response(JSON.stringify({
        results: [
          {
            id: "search-1",
            content: "Relevant memory hit",
            metadata: { sourceSystem: "paperclip", issueId: "iss_1" },
            score: 0.98,
          },
        ],
      }), { status: 200 });
    }
    if (url.includes("/chat")) {
      return new Response(JSON.stringify({ text: "Peer answer" }), { status: 200 });
    }
    if (url.includes("/peers")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (url.includes("/sessions") && !url.includes("/messages") && !url.includes("/summaries")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (url.includes("/messages")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (url.includes("/summaries")) {
      return new Response(JSON.stringify({
        summaries: [{ summary: "Investigating auth regression and next steps." }],
      }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function seedHarness(harness: ReturnType<typeof createTestHarness>) {
  const issue = {
    id: "iss_1",
    companyId: "co_1",
    projectId: "proj_1",
    goalId: null,
    parentId: null,
    title: "Fix auth regression",
    description: "Need to investigate auth failures.",
    status: "todo",
    priority: "high",
    assigneeAgentId: "agent_1",
    assigneeUserId: null,
    checkoutRunId: null,
    executionRunId: null,
    executionAgentNameKey: null,
    executionLockedAt: null,
    createdByAgentId: null,
    createdByUserId: "user_1",
    issueNumber: 1,
    identifier: "PAP-1",
    requestDepth: 0,
    billingCode: null,
    assigneeAdapterOverrides: null,
    executionWorkspaceSettings: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    hiddenAt: null,
    createdAt: new Date("2026-03-15T12:00:00.000Z"),
    updatedAt: new Date("2026-03-15T12:00:00.000Z"),
  } satisfies Issue;
  const comments = [
    {
      id: "c_1",
      companyId: "co_1",
      issueId: "iss_1",
      authorAgentId: null,
      authorUserId: "user_1",
      body: "First comment",
      createdAt: new Date("2026-03-15T12:01:00.000Z"),
      updatedAt: new Date("2026-03-15T12:01:00.000Z"),
    },
    {
      id: "c_2",
      companyId: "co_1",
      issueId: "iss_1",
      authorAgentId: "agent_1",
      authorUserId: null,
      body: "Second comment",
      createdAt: new Date("2026-03-15T12:02:00.000Z"),
      updatedAt: new Date("2026-03-15T12:02:00.000Z"),
    },
  ] satisfies IssueComment[];
  const documents = [
    {
      id: "doc_1",
      companyId: "co_1",
      issueId: "iss_1",
      key: "design",
      title: "Design Notes",
      format: "markdown" as const,
      body: "# Design\n\nStable chunk one.\n\nStable chunk two.",
      latestRevisionId: "rev_2",
      latestRevisionNumber: 2,
      createdByAgentId: null,
      createdByUserId: "user_1",
      updatedByAgentId: "agent_1",
      updatedByUserId: null,
      createdAt: new Date("2026-03-15T12:00:00.000Z"),
      updatedAt: new Date("2026-03-15T12:03:00.000Z"),
    },
  ] satisfies IssueDocument[];
  const revisions = [
    {
      id: "rev_1",
      companyId: "co_1",
      documentId: "doc_1",
      issueId: "iss_1",
      key: "design",
      revisionNumber: 1,
      body: "# Design\n\nInitial body.",
      changeSummary: "Initial",
      createdByAgentId: null,
      createdByUserId: "user_1",
      createdAt: new Date("2026-03-15T12:00:00.000Z"),
    },
    {
      id: "rev_2",
      companyId: "co_1",
      documentId: "doc_1",
      issueId: "iss_1",
      key: "design",
      revisionNumber: 2,
      body: "# Design\n\nStable chunk one.\n\nStable chunk two.",
      changeSummary: "Update",
      createdByAgentId: "agent_1",
      createdByUserId: null,
      createdAt: new Date("2026-03-15T12:03:00.000Z"),
    },
  ] satisfies DocumentRevision[];
  harness.seed({
    companies: [{
      id: "co_1",
      name: "Paperclip",
      description: null,
      status: "active",
      issuePrefix: "PAP",
      issueCounter: 1,
      budgetMonthlyCents: 0,
      spentMonthlyCents: 0,
      requireBoardApprovalForNewAgents: true,
      brandColor: null,
      createdAt: new Date("2026-03-15T12:00:00.000Z"),
      updatedAt: new Date("2026-03-15T12:00:00.000Z"),
    }],
    issues: [issue],
    issueComments: comments,
    issueDocuments: documents,
    documentRevisions: revisions,
    agents: [{
      id: "agent_1",
      companyId: "co_1",
      name: "Agent One",
      role: "engineer",
      title: null,
      status: "idle",
      reportsTo: null,
      capabilities: null,
      adapterType: "process",
      adapterConfig: {},
      budgetMonthlyCents: 0,
      spentMonthlyCents: 0,
      lastHeartbeatAt: null,
      metadata: null,
      permissions: { canCreateAgents: false },
      runtimeConfig: {},
      urlKey: "agent-one",
      icon: "bot",
      createdAt: new Date("2026-03-15T12:00:00.000Z"),
      updatedAt: new Date("2026-03-15T12:00:00.000Z"),
    }],
  });
}

describe("paperclip-plugin-honcho", () => {
  it("generates deterministic IDs", () => {
    expect(workspaceIdForCompany("co_1", "paperclip")).toBe("paperclip:co_1");
    expect(sessionIdForIssue("iss_1")).toBe("issue:iss_1");
    expect(peerIdForAgent("agent_1")).toBe("agent:agent_1");
  });

  it("builds provenance for comments", () => {
    const issue = { id: "iss_1", companyId: "co_1", identifier: "PAP-1" } as Issue;
    const comment = {
      id: "c_1",
      companyId: "co_1",
      issueId: "iss_1",
      authorAgentId: null,
      authorUserId: "user_1",
      body: "Hello",
      createdAt: new Date("2026-03-15T12:01:00.000Z"),
      updatedAt: new Date("2026-03-15T12:01:00.000Z"),
    } as IssueComment;
    const provenance = buildCommentProvenance(issue, comment, actorFromComment(comment));
    expect(provenance.sourceSystem).toBe("paperclip");
    expect(provenance.commentId).toBe("c_1");
    expect(provenance.paperclipEntityUrl).toBe("/issues/PAP-1");
  });

  it("syncs issue comments on issue.comment.created and exposes tools/actions", async () => {
    const fetchMock = installFetchMock();
    const harness = createTestHarness({
      manifest,
      config: BASE_CONFIG,
    });
    seedHarness(harness);
    await plugin.definition.setup(harness.ctx);

    await harness.emit("issue.comment.created", { commentId: "c_2" }, {
      entityId: "iss_1",
      entityType: "issue",
      companyId: "co_1",
    });

    const state = harness.getState({
      scopeKind: "issue",
      scopeId: "iss_1",
      namespace: "honcho",
      stateKey: "issue-sync-status",
    }) as Record<string, unknown>;
    expect(state.lastSyncedCommentId).toBe("c_2");

    const contextResult = await harness.executeTool(
      "honcho_get_issue_context",
      {},
      { companyId: "co_1", projectId: "proj_1", agentId: "agent_1", runId: "run_1", issueId: "iss_1" },
    );
    expect(contextResult.content).toContain("Investigating auth regression");

    const searchResult = await harness.executeTool(
      "honcho_search_memory",
      { query: "auth regression" },
      { companyId: "co_1", projectId: "proj_1", agentId: "agent_1", runId: "run_1", issueId: "iss_1" },
    );
    expect(searchResult.content).toContain("Relevant memory hit");

    const disabledAsk = await harness.executeTool(
      "honcho_ask_peer",
      { targetPeerId: "agent:agent_1", query: "What happened?" },
      { companyId: "co_1", projectId: "proj_1", agentId: "agent_1", runId: "run_1", issueId: "iss_1" },
    );
    expect(disabledAsk.error).toContain("disabled");

    const status = await harness.getData("issue-memory-status", { issueId: "iss_1", companyId: "co_1" }) as Record<string, unknown>;
    expect(status.issueId).toBe("iss_1");

    await harness.performAction("resync-issue", { issueId: "iss_1", companyId: "co_1" });
    await harness.performAction("backfill-company", { companyId: "co_1" });
    const connection = await harness.performAction("test-connection");
    expect((connection as Record<string, unknown>).ok).toBe(true);

    expect(fetchMock).toHaveBeenCalled();
  });

  it("syncs document revisions when enabled", async () => {
    installFetchMock();
    const harness = createTestHarness({
      manifest,
      config: {
        ...BASE_CONFIG,
        syncIssueDocuments: true,
      },
    });
    seedHarness(harness);
    await plugin.definition.setup(harness.ctx);

    await harness.emit("issue.document.updated", { key: "design" }, {
      entityId: "iss_1",
      entityType: "issue",
      companyId: "co_1",
    });

    const state = harness.getState({
      scopeKind: "issue",
      scopeId: "iss_1",
      namespace: "honcho",
      stateKey: "issue-sync-status",
    }) as Record<string, unknown>;
    expect(state.lastSyncedDocumentRevisionId).toBe("rev_2");
  });

  it("allows peer chat when enabled", async () => {
    installFetchMock();
    const harness = createTestHarness({
      manifest,
      config: {
        ...BASE_CONFIG,
        enablePeerChat: true,
      },
    });
    seedHarness(harness);
    await plugin.definition.setup(harness.ctx);

    const result = await harness.executeTool(
      "honcho_ask_peer",
      { targetPeerId: "agent:agent_1", query: "Status?" },
      { companyId: "co_1", projectId: "proj_1", agentId: "agent_1", runId: "run_1", issueId: "iss_1" },
    );
    expect(result.content).toContain("Peer answer");
  });
});
