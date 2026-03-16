import type { PluginContext } from "@paperclipai/plugin-sdk";
import { COMPANY_STATUS_STATE_KEY, ISSUE_STATUS_STATE_KEY, STATE_NAMESPACE } from "./constants.js";
import type { CompanySyncStatus, IssueSyncStatus, SyncErrorSummary } from "./types.js";

const EMPTY_ISSUE_STATUS: IssueSyncStatus = {
  lastSyncedCommentId: null,
  lastSyncedCommentCreatedAt: null,
  lastSyncedDocumentRevisionKey: null,
  lastSyncedDocumentRevisionId: null,
  lastBackfillAt: null,
  replayRequestedAt: null,
  replayInProgress: false,
  lastError: null,
  latestContextPreview: null,
  latestContextFetchedAt: null,
  latestAppendAt: null,
};

const EMPTY_COMPANY_STATUS: CompanySyncStatus = {
  lastBackfillAt: null,
  lastError: null,
};

function issueStateKey(issueId: string) {
  return {
    scopeKind: "issue" as const,
    scopeId: issueId,
    namespace: STATE_NAMESPACE,
    stateKey: ISSUE_STATUS_STATE_KEY,
  };
}

function companyStateKey(companyId: string) {
  return {
    scopeKind: "company" as const,
    scopeId: companyId,
    namespace: STATE_NAMESPACE,
    stateKey: COMPANY_STATUS_STATE_KEY,
  };
}

export async function getIssueSyncStatus(ctx: PluginContext, issueId: string): Promise<IssueSyncStatus> {
  const value = await ctx.state.get(issueStateKey(issueId));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...EMPTY_ISSUE_STATUS };
  }
  return { ...EMPTY_ISSUE_STATUS, ...(value as IssueSyncStatus) };
}

export async function setIssueSyncStatus(ctx: PluginContext, issueId: string, status: IssueSyncStatus): Promise<void> {
  await ctx.state.set(issueStateKey(issueId), status);
}

export async function patchIssueSyncStatus(
  ctx: PluginContext,
  issueId: string,
  patch: Partial<IssueSyncStatus>,
): Promise<IssueSyncStatus> {
  const next = { ...(await getIssueSyncStatus(ctx, issueId)), ...patch };
  await setIssueSyncStatus(ctx, issueId, next);
  return next;
}

export async function clearIssueSyncStatus(ctx: PluginContext, issueId: string): Promise<void> {
  await ctx.state.delete(issueStateKey(issueId));
}

export async function getCompanySyncStatus(ctx: PluginContext, companyId: string): Promise<CompanySyncStatus> {
  const value = await ctx.state.get(companyStateKey(companyId));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...EMPTY_COMPANY_STATUS };
  }
  return { ...EMPTY_COMPANY_STATUS, ...(value as CompanySyncStatus) };
}

export async function patchCompanySyncStatus(
  ctx: PluginContext,
  companyId: string,
  patch: Partial<CompanySyncStatus>,
): Promise<CompanySyncStatus> {
  const next = { ...(await getCompanySyncStatus(ctx, companyId)), ...patch };
  await ctx.state.set(companyStateKey(companyId), next);
  return next;
}

export function buildSyncErrorSummary(input: {
  message: string;
  code?: string | null;
  issueId?: string | null;
  commentId?: string | null;
  documentKey?: string | null;
}): SyncErrorSummary {
  return {
    at: new Date().toISOString(),
    message: input.message,
    code: input.code ?? null,
    issueId: input.issueId ?? null,
    commentId: input.commentId ?? null,
    documentKey: input.documentKey ?? null,
  };
}
