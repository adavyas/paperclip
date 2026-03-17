import type { DocumentRevision, Issue, IssueComment, PluginContext } from "@paperclipai/plugin-sdk";
import {
  DEFAULT_BACKFILL_BATCH_SIZE,
  DEFAULT_DOCUMENT_SECTION_OVERLAP,
  DEFAULT_DOCUMENT_SECTION_SIZE,
  DEFAULT_SEARCH_LIMIT,
} from "./constants.js";
import { getResolvedConfig } from "./config.js";
import { peerIdForAgent, peerIdForUser } from "./ids.js";
import { actorFromComment, actorFromDocumentRevision, buildCommentProvenance, buildDocumentProvenance, splitDocumentIntoSections } from "./provenance.js";
import { buildSyncErrorSummary, clearIssueSyncStatus, getIssueSyncStatus, patchCompanySyncStatus, patchIssueSyncStatus } from "./state.js";
import { createHonchoClient } from "./honcho-client.js";
import type {
  HonchoActor,
  HonchoIssueContext,
  HonchoMessageInput,
  HonchoResolvedConfig,
  IssueDocumentBundle,
  SearchMemoryParams,
  SyncIssueOptions,
  SyncIssueResult,
  SyncableIssueResource,
} from "./types.js";

function peerIdFromActor(actor: HonchoActor): string {
  if (actor.authorType === "agent") return peerIdForAgent(actor.authorId);
  if (actor.authorType === "user") return peerIdForUser(actor.authorId);
  return "system:paperclip";
}

function compareComments(left: IssueComment, right: IssueComment): number {
  return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
}

function compareRevisions(left: DocumentRevision, right: DocumentRevision): number {
  return left.revisionNumber - right.revisionNumber;
}

async function fetchIssueResources(
  ctx: PluginContext,
  issueId: string,
  companyId: string,
  config: HonchoResolvedConfig,
): Promise<SyncableIssueResource> {
  const issue = await ctx.issues.get(issueId, companyId);
  if (!issue) {
    throw new Error("Issue not found");
  }
  const comments = (await ctx.issues.listComments(issueId, companyId)).sort(compareComments);
  const documents: IssueDocumentBundle[] = config.syncIssueDocuments
    ? await Promise.all(
      (await ctx.issues.documents.list(issueId, companyId)).map(async (document) => ({
        document,
        revisions: (await ctx.issues.listDocumentRevisions(issueId, document.key, companyId)).sort(compareRevisions),
      })),
    )
    : [];
  return { issue, comments, documents };
}

async function buildCommentMessages(issue: Issue, comments: IssueComment[], replay: boolean, lastSyncedCommentId: string | null): Promise<HonchoMessageInput[]> {
  const started = replay || !lastSyncedCommentId;
  const messages: HonchoMessageInput[] = [];
  let unlocked = started;
  for (const comment of comments) {
    if (!unlocked) {
      if (comment.id === lastSyncedCommentId) {
        unlocked = true;
      }
      continue;
    }
    if (!comment.body.trim()) continue;
    const actor = actorFromComment(comment);
    messages.push({
      content: comment.body,
      peerId: peerIdFromActor(actor),
      createdAt: new Date(comment.createdAt).toISOString(),
      metadata: {
        ...buildCommentProvenance(issue, comment, actor),
        issueTitle: issue.title,
        issueStatus: issue.status,
      },
    });
  }
  return messages;
}

function buildDocumentMessages(
  issue: Issue,
  documents: IssueDocumentBundle[],
  lastSyncedRevisionId: string | null,
): HonchoMessageInput[] {
  const messages: HonchoMessageInput[] = [];
  let unlocked = lastSyncedRevisionId == null;

  for (const bundle of documents) {
    for (const revision of bundle.revisions) {
      if (!unlocked) {
        if (revision.id === lastSyncedRevisionId) {
          unlocked = true;
        }
        continue;
      }
      const actor = actorFromDocumentRevision(revision);
      for (const section of splitDocumentIntoSections(
        bundle.document,
        revision,
        DEFAULT_DOCUMENT_SECTION_SIZE,
        DEFAULT_DOCUMENT_SECTION_OVERLAP,
      )) {
        messages.push({
          content: section.content,
          peerId: peerIdFromActor(actor),
          createdAt: new Date(revision.createdAt).toISOString(),
          metadata: {
            ...buildDocumentProvenance(issue, revision, actor),
            documentKey: bundle.document.key,
            documentTitle: bundle.document.title,
            revisionNumber: revision.revisionNumber,
            sectionKey: section.key,
            sectionIndex: section.index,
          },
        });
      }
    }
  }
  return messages;
}

async function refreshContextPreview(ctx: PluginContext, issue: Issue, config: HonchoResolvedConfig): Promise<HonchoIssueContext> {
  const client = await createHonchoClient({ ctx, config });
  const targetUserId = issue.assigneeUserId ?? issue.createdByUserId ?? null;
  const context = await client.getIssueContext(
    issue.companyId,
    issue.id,
    targetUserId ? peerIdForUser(targetUserId) : null,
  );
  await patchIssueSyncStatus(ctx, issue.id, {
    latestContextPreview: context.preview,
    latestContextFetchedAt: new Date().toISOString(),
    lastError: null,
  });
  return {
    ...context,
    issueIdentifier: issue.identifier ?? null,
  };
}

export async function syncIssue(ctx: PluginContext, issueId: string, companyId: string, options: SyncIssueOptions = {}): Promise<SyncIssueResult> {
  const config = await getResolvedConfig(ctx);
  const status = await getIssueSyncStatus(ctx, issueId);
  const replay = options.replay === true;
  const resources = await fetchIssueResources(ctx, issueId, companyId, config);
  const client = await createHonchoClient({ ctx, config });

  await patchIssueSyncStatus(ctx, issueId, {
    replayInProgress: replay,
    replayRequestedAt: replay ? new Date().toISOString() : status.replayRequestedAt,
  });

  try {
    const commentMessages = config.syncIssueComments
      ? await buildCommentMessages(resources.issue, resources.comments, replay, replay ? null : status.lastSyncedCommentId)
      : [];
    const documentMessages = config.syncIssueDocuments
      ? buildDocumentMessages(resources.issue, resources.documents, replay ? null : status.lastSyncedDocumentRevisionId)
      : [];

    if (commentMessages.length > 0 || documentMessages.length > 0) {
      await client.appendMessages(resources.issue.companyId, resources.issue.id, [...commentMessages, ...documentMessages]);
    } else {
      await client.ensureSession(resources.issue.companyId, resources.issue.id, {
        issue_identifier: resources.issue.identifier,
        issue_title: resources.issue.title,
      });
    }

    const lastComment = resources.comments.at(-1) ?? null;
    const lastDocumentRevision = resources.documents.flatMap((bundle) => bundle.revisions).sort(compareRevisions).at(-1) ?? null;
    const context = await refreshContextPreview(ctx, resources.issue, config);
    await patchIssueSyncStatus(ctx, issueId, {
      lastSyncedCommentId: lastComment?.id ?? status.lastSyncedCommentId,
      lastSyncedCommentCreatedAt: lastComment ? new Date(lastComment.createdAt).toISOString() : status.lastSyncedCommentCreatedAt,
      lastSyncedDocumentRevisionKey: lastDocumentRevision?.key ?? status.lastSyncedDocumentRevisionKey,
      lastSyncedDocumentRevisionId: lastDocumentRevision?.id ?? status.lastSyncedDocumentRevisionId,
      lastBackfillAt: new Date().toISOString(),
      replayInProgress: false,
      lastError: null,
      latestAppendAt: new Date().toISOString(),
      latestContextPreview: context.preview,
      latestContextFetchedAt: new Date().toISOString(),
    });
    return {
      issueId: resources.issue.id,
      issueIdentifier: resources.issue.identifier ?? null,
      syncedComments: commentMessages.length,
      syncedDocumentSections: documentMessages.length,
      lastSyncedCommentId: lastComment?.id ?? null,
      replayed: replay,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await patchIssueSyncStatus(ctx, issueId, {
      replayInProgress: false,
      lastError: buildSyncErrorSummary({
        message,
        issueId,
        commentId: options.commentIdHint ?? null,
        documentKey: options.documentKeyHint ?? null,
      }),
    });
    throw error;
  }
}

export async function replayIssue(ctx: PluginContext, issueId: string, companyId: string): Promise<SyncIssueResult> {
  await clearIssueSyncStatus(ctx, issueId);
  return await syncIssue(ctx, issueId, companyId, { replay: true });
}

export async function backfillCompany(ctx: PluginContext, companyId: string): Promise<{ companyId: string; processedIssues: number }> {
  const config = await getResolvedConfig(ctx);
  let offset = 0;
  let processedIssues = 0;
  let failedIssues = 0;
  let lastFailure: { issueId: string; message: string } | null = null;
  while (true) {
    const issues = await ctx.issues.list({
      companyId,
      limit: DEFAULT_BACKFILL_BATCH_SIZE,
      offset,
    });
    if (issues.length === 0) break;
    for (const issue of issues) {
      try {
        await syncIssue(ctx, issue.id, companyId, { replay: false });
        processedIssues += 1;
      } catch (error) {
        failedIssues += 1;
        lastFailure = {
          issueId: issue.id,
          message: error instanceof Error ? error.message : String(error),
        };
        ctx.logger.warn("Honcho backfill skipped issue after sync failure", {
          companyId,
          issueId: issue.id,
          error: lastFailure.message,
        });
      }
    }
    offset += issues.length;
  }
  const nextStatus = {
    lastBackfillAt: new Date().toISOString(),
    lastError: failedIssues > 0
      ? buildSyncErrorSummary({
        message: `Honcho backfill completed with ${failedIssues} failed issue sync(s)`,
        issueId: lastFailure?.issueId ?? null,
      })
      : !config.syncIssueComments && !config.syncIssueDocuments
        ? buildSyncErrorSummary({ message: "Honcho backfill completed with syncing disabled" })
        : null,
  };
  await patchCompanySyncStatus(ctx, companyId, nextStatus);
  return { companyId, processedIssues };
}

export async function loadIssueStatusData(ctx: PluginContext, issueId: string, companyId: string) {
  const config = await getResolvedConfig(ctx);
  const issue = await ctx.issues.get(issueId, companyId);
  if (!issue) {
    throw new Error("Issue not found");
  }
  const status = await getIssueSyncStatus(ctx, issueId);
  return {
    syncEnabled: config.syncIssueComments || config.syncIssueDocuments,
    issueId,
    issueIdentifier: issue.identifier ?? null,
    lastSyncedCommentId: status.lastSyncedCommentId,
    lastSyncedCommentCreatedAt: status.lastSyncedCommentCreatedAt,
    lastSyncedDocumentRevisionKey: status.lastSyncedDocumentRevisionKey,
    lastSyncedDocumentRevisionId: status.lastSyncedDocumentRevisionId,
    lastBackfillAt: status.lastBackfillAt,
    replayRequestedAt: status.replayRequestedAt,
    replayInProgress: status.replayInProgress,
    lastError: status.lastError,
    contextPreview: status.latestContextPreview,
    contextFetchedAt: status.latestContextFetchedAt,
    latestAppendAt: status.latestAppendAt,
    config: {
      syncIssueComments: config.syncIssueComments,
      syncIssueDocuments: config.syncIssueDocuments,
      enablePeerChat: config.enablePeerChat,
      observeAgentPeers: config.observeAgentPeers,
    },
  };
}

export async function getIssueContext(ctx: PluginContext, issueId: string, companyId: string) {
  const issue = await ctx.issues.get(issueId, companyId);
  if (!issue) throw new Error("Issue not found");
  const config = await getResolvedConfig(ctx);
  const context = await refreshContextPreview(ctx, issue, config);
  return {
    ...context,
    issueIdentifier: issue.identifier ?? null,
  };
}

export async function searchMemory(
  ctx: PluginContext,
  agentId: string,
  companyId: string,
  params: SearchMemoryParams,
) {
  const config = await getResolvedConfig(ctx);
  const client = await createHonchoClient({ ctx, config });
  const scope = params.scope ?? (params.issueId ? "session" : "workspace");
  return await client.searchMemory(companyId, agentId, {
    ...params,
    scope,
    limit: params.limit ?? DEFAULT_SEARCH_LIMIT,
  });
}
