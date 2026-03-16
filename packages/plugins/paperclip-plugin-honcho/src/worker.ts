import { definePlugin, runWorker, type ToolRunContext, type ToolResult } from "@paperclipai/plugin-sdk";
import manifest from "./manifest.js";
import { ACTION_KEYS, DATA_KEYS, DEFAULT_SEARCH_LIMIT, TOOL_NAMES } from "./constants.js";
import { assertConfigured, getResolvedConfig } from "./config.js";
import { createHonchoClient } from "./honcho-client.js";
import { backfillCompany, getIssueContext, loadIssueStatusData, replayIssue, searchMemory, syncIssue } from "./sync.js";

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

function inferIssueId(params: Record<string, unknown>, runCtx?: Partial<ToolRunContext>): string | null {
  if (typeof params.issueId === "string" && params.issueId.trim()) return params.issueId.trim();
  return typeof runCtx?.issueId === "string" && runCtx.issueId.trim() ? runCtx.issueId.trim() : null;
}

const plugin = definePlugin({
  async setup(ctx) {
    ctx.data.register(DATA_KEYS.issueStatus, async (params) => {
      const issueId = requireString(params.issueId, "issueId");
      const companyId = requireString(params.companyId, "companyId");
      return await loadIssueStatusData(ctx, issueId, companyId);
    });

    ctx.actions.register(ACTION_KEYS.testConnection, async () => {
      const config = await getResolvedConfig(ctx);
      assertConfigured(config);
      const client = await createHonchoClient({ ctx, config });
      const companies = await ctx.companies.list({ limit: 1, offset: 0 });
      const sampleCompanyId = companies[0]?.id ?? "paperclip-test";
      const workspaceId = await client.ensureWorkspace(sampleCompanyId);
      return {
        ok: true,
        workspaceId,
        at: new Date().toISOString(),
      };
    });

    ctx.actions.register(ACTION_KEYS.resyncIssue, async (params) => {
      const issueId = requireString(params.issueId, "issueId");
      const companyId = requireString(params.companyId, "companyId");
      return await replayIssue(ctx, issueId, companyId);
    });

    ctx.actions.register(ACTION_KEYS.backfillCompany, async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      return await backfillCompany(ctx, companyId);
    });

    ctx.events.on("issue.created", async (event) => {
      try {
        if (!event.entityId) return;
        await syncIssue(ctx, event.entityId, event.companyId, { replay: false });
      } catch (error) {
        ctx.logger.warn("Honcho sync on issue.created failed", {
          issueId: event.entityId,
          companyId: event.companyId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    ctx.events.on("issue.comment.created", async (event) => {
      try {
        if (!event.entityId) return;
        const payload = typeof event.payload === "object" && event.payload !== null
          ? (event.payload as Record<string, unknown>)
          : {};
        await syncIssue(ctx, event.entityId, event.companyId, {
          replay: false,
          commentIdHint: typeof payload.commentId === "string" ? payload.commentId : null,
        });
      } catch (error) {
        ctx.logger.warn("Honcho sync on issue.comment.created failed", {
          issueId: event.entityId,
          companyId: event.companyId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    ctx.events.on("issue.document.created", async (event) => {
      const config = await getResolvedConfig(ctx);
      if (!config.syncIssueDocuments || !event.entityId) return;
      const payload = typeof event.payload === "object" && event.payload !== null
        ? (event.payload as Record<string, unknown>)
        : {};
      await syncIssue(ctx, event.entityId, event.companyId, {
        replay: false,
        documentKeyHint: typeof payload.key === "string" ? payload.key : null,
      });
    });

    ctx.events.on("issue.document.updated", async (event) => {
      const config = await getResolvedConfig(ctx);
      if (!config.syncIssueDocuments || !event.entityId) return;
      const payload = typeof event.payload === "object" && event.payload !== null
        ? (event.payload as Record<string, unknown>)
        : {};
      await syncIssue(ctx, event.entityId, event.companyId, {
        replay: false,
        documentKeyHint: typeof payload.key === "string" ? payload.key : null,
      });
    });

    ctx.tools.register(
      TOOL_NAMES.getIssueContext,
      manifest.tools?.find((tool) => tool.name === TOOL_NAMES.getIssueContext) ?? {
        displayName: "Honcho Issue Context",
        description: "Retrieve Honcho context for an issue.",
        parametersSchema: { type: "object", properties: {} },
      },
      async (params, runCtx): Promise<ToolResult> => {
        const issueId = inferIssueId(params as Record<string, unknown>, runCtx);
        if (!issueId) return { error: "issueId is required" };
        const context = await getIssueContext(ctx, issueId, runCtx.companyId);
        return {
          content: context.preview ?? "No Honcho context available for this issue yet.",
          data: context,
        };
      },
    );

    ctx.tools.register(
      TOOL_NAMES.searchMemory,
      manifest.tools?.find((tool) => tool.name === TOOL_NAMES.searchMemory) ?? {
        displayName: "Honcho Search Memory",
        description: "Search Honcho memory",
        parametersSchema: { type: "object", properties: {} },
      },
      async (params, runCtx): Promise<ToolResult> => {
        const input = params as Record<string, unknown>;
        const query = requireString(input.query, "query");
        const issueId = inferIssueId(input, runCtx);
        const scope = input.scope === "workspace" ? "workspace" : "session";
        const limit = typeof input.limit === "number" && Number.isFinite(input.limit)
          ? Math.max(1, Math.min(10, Math.floor(input.limit)))
          : DEFAULT_SEARCH_LIMIT;
        const results = await searchMemory(ctx, runCtx.agentId, runCtx.companyId, {
          query,
          issueId: issueId ?? undefined,
          scope: issueId ? scope : "workspace",
          limit,
        });
        const content = results.length > 0
          ? results
            .map((result, index) => `Result ${index + 1}: ${result.content ?? "(no content)"}`)
            .join("\n\n")
          : "No Honcho memory results found.";
        return {
          content,
          data: {
            query,
            issueId,
            scope: issueId ? scope : "workspace",
            results,
          },
        };
      },
    );

    ctx.tools.register(
      TOOL_NAMES.askPeer,
      manifest.tools?.find((tool) => tool.name === TOOL_NAMES.askPeer) ?? {
        displayName: "Honcho Ask Peer",
        description: "Ask a Honcho peer",
        parametersSchema: { type: "object", properties: {} },
      },
      async (params, runCtx): Promise<ToolResult> => {
        const config = await getResolvedConfig(ctx);
        if (!config.enablePeerChat) {
          return { error: "Honcho peer chat is disabled in plugin config" };
        }
        assertConfigured(config);
        const input = params as Record<string, unknown>;
        const targetPeerId = requireString(input.targetPeerId, "targetPeerId");
        const query = requireString(input.query, "query");
        const issueId = inferIssueId(input, runCtx) ?? undefined;
        const client = await createHonchoClient({ ctx, config });
        const response = await client.askPeer(runCtx.companyId, runCtx.agentId, {
          targetPeerId,
          query,
          issueId,
        });
        const content = response.text ?? response.response ?? response.messages?.map((message) => message.content).filter(Boolean).join("\n\n") ?? "No Honcho peer response returned.";
        return {
          content,
          data: response,
        };
      },
    );
  },

  async onHealth() {
    return { status: "ok", message: "Honcho worker is running" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
