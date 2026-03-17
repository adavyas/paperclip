import type {
  Issue,
  IssueComment,
  DocumentRevision,
  PluginContext,
  ScopeKey,
  ToolRunContext,
} from "@paperclipai/plugin-sdk";

export type HonchoPluginConfig = {
  honchoApiBaseUrl?: string;
  honchoApiKeySecretRef?: string;
  workspacePrefix?: string;
  syncIssueComments?: boolean;
  syncIssueDocuments?: boolean;
  enablePeerChat?: boolean;
};

export type HonchoResolvedConfig = {
  honchoApiBaseUrl: string;
  honchoApiKeySecretRef: string;
  workspacePrefix: string;
  syncIssueComments: boolean;
  syncIssueDocuments: boolean;
  enablePeerChat: boolean;
};

export type HonchoActor =
  | { authorType: "agent"; authorId: string }
  | { authorType: "user"; authorId: string }
  | { authorType: "system"; authorId: string };

export type IssueSyncStatus = {
  lastSyncedCommentId: string | null;
  lastSyncedCommentCreatedAt: string | null;
  lastSyncedDocumentRevisionKey: string | null;
  lastSyncedDocumentRevisionId: string | null;
  lastBackfillAt: string | null;
  replayRequestedAt: string | null;
  replayInProgress: boolean;
  lastError: SyncErrorSummary | null;
  latestContextPreview: string | null;
  latestContextFetchedAt: string | null;
  latestAppendAt: string | null;
};

export type CompanySyncStatus = {
  lastBackfillAt: string | null;
  lastError: SyncErrorSummary | null;
};

export type SyncErrorSummary = {
  at: string;
  message: string;
  code?: string | null;
  issueId?: string | null;
  commentId?: string | null;
  documentKey?: string | null;
};

export type HonchoProvenance = {
  sourceSystem: "paperclip";
  companyId: string;
  issueId: string;
  commentId: string | null;
  documentRevisionId: string | null;
  authorType: "agent" | "user" | "system";
  authorId: string;
  paperclipEntityUrl: string;
  paperclipIssueIdentifier: string | null;
  ingestedAt: string;
  contentType: "issue_comment" | "issue_document_section";
};

export type HonchoMessageInput = {
  content: string;
  peerId: string;
  createdAt: string;
  metadata: HonchoProvenance & Record<string, unknown>;
};

export type HonchoSessionSummary = {
  summary?: string | null;
  content?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type HonchoSearchResult = {
  id?: string | null;
  content?: string | null;
  metadata?: Record<string, unknown> | null;
  score?: number | null;
};

export type HonchoRepresentationResult = {
  representation?: string | null;
  metadata?: Record<string, unknown> | null;
  summary?: string | null;
  content?: string | null;
  results?: HonchoSearchResult[] | null;
};

export type HonchoChatResult = {
  text?: string | null;
  response?: string | null;
  messages?: Array<{ role?: string | null; content?: string | null }>;
  metadata?: Record<string, unknown> | null;
};

export type HonchoClientInput = {
  ctx: PluginContext;
  config: HonchoResolvedConfig;
};

export type HonchoSearchScope = "workspace" | "session";

export type SearchMemoryParams = {
  query: string;
  issueId?: string;
  scope?: HonchoSearchScope;
  limit?: number;
};

export type AskPeerParams = {
  targetPeerId: string;
  query: string;
  issueId?: string;
};

export type HonchoIssueContext = {
  issueId: string;
  issueIdentifier: string | null;
  sessionId: string;
  workspaceId: string;
  summaries: HonchoSessionSummary[];
  preview: string | null;
};

export type IssueMemoryStatusData = {
  syncEnabled: boolean;
  issueId: string;
  issueIdentifier: string | null;
  lastSyncedCommentId: string | null;
  lastSyncedCommentCreatedAt: string | null;
  lastSyncedDocumentRevisionKey: string | null;
  lastSyncedDocumentRevisionId: string | null;
  lastBackfillAt: string | null;
  replayRequestedAt: string | null;
  replayInProgress: boolean;
  lastError: SyncErrorSummary | null;
  contextPreview: string | null;
  contextFetchedAt: string | null;
  latestAppendAt: string | null;
  config: {
    syncIssueComments: boolean;
    syncIssueDocuments: boolean;
    enablePeerChat: boolean;
  };
};

export type SetupChecklistItem = {
  key: string;
  label: string;
  done: boolean;
  detail: string;
};

export type SetupStatusData = {
  config: {
    honchoApiBaseUrl: string;
    honchoApiKeySecretRef: string;
    workspacePrefix: string;
    syncIssueComments: boolean;
    syncIssueDocuments: boolean;
    enablePeerChat: boolean;
  };
  validation: {
    ok: boolean;
    warnings: string[];
    errors: string[];
  };
  syncEnabled: boolean;
  companyId: string | null;
  companyStatus: CompanySyncStatus | null;
  checklist: SetupChecklistItem[];
};

export type WorkerActionParams = Record<string, unknown>;

export type IssueDocumentRef = {
  key: string;
  title: string | null;
};

export type IssueDocumentBundle = {
  document: IssueDocumentRef;
  revisions: DocumentRevision[];
};

export type SyncableIssueResource = {
  issue: Issue;
  comments: IssueComment[];
  documents: IssueDocumentBundle[];
};

export type SyncIssueOptions = {
  replay?: boolean;
  commentIdHint?: string | null;
  documentKeyHint?: string | null;
};

export type SyncIssueResult = {
  issueId: string;
  issueIdentifier: string | null;
  syncedComments: number;
  syncedDocumentSections: number;
  lastSyncedCommentId: string | null;
  replayed: boolean;
};

export type ScopedStateInput = ScopeKey;

export type HonchoToolRunContext = ToolRunContext & {
  issueId?: string | null;
};
