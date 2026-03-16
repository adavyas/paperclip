import {
  usePluginAction,
  usePluginData,
  type PluginDetailTabProps,
} from "@paperclipai/plugin-sdk/ui";
import { ACTION_KEYS, DATA_KEYS } from "../constants.js";
import type { IssueMemoryStatusData } from "../types.js";

const sectionStyle: React.CSSProperties = {
  display: "grid",
  gap: "0.75rem",
  padding: "1rem",
};

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.35)",
  borderRadius: "12px",
  padding: "0.875rem",
  display: "grid",
  gap: "0.5rem",
  background: "rgba(15, 23, 42, 0.02)",
};

const buttonStyle: React.CSSProperties = {
  width: "fit-content",
  border: "1px solid rgba(15, 23, 42, 0.15)",
  borderRadius: "999px",
  padding: "0.45rem 0.8rem",
  background: "white",
  cursor: "pointer",
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: "0.75rem", alignItems: "start" }}>
      <div style={{ fontSize: "0.85rem", color: "#475569" }}>{label}</div>
      <div style={{ fontSize: "0.92rem" }}>{value}</div>
    </div>
  );
}

export function HonchoIssueMemoryTab({ context }: PluginDetailTabProps) {
  const status = usePluginData<IssueMemoryStatusData>(DATA_KEYS.issueStatus, {
    issueId: context.entityId,
    companyId: context.companyId,
  });
  const resyncIssue = usePluginAction(ACTION_KEYS.resyncIssue);
  const testConnection = usePluginAction(ACTION_KEYS.testConnection);

  if (status.loading) {
    return <div style={sectionStyle}>Loading memory status…</div>;
  }

  if (status.error) {
    return <div style={sectionStyle}>Plugin error: {status.error.message}</div>;
  }

  const data = status.data;
  if (!data) {
    return <div style={sectionStyle}>No memory status available.</div>;
  }

  return (
    <div style={sectionStyle}>
      <div style={cardStyle}>
        <strong>Honcho Memory</strong>
        <div style={{ color: "#475569", fontSize: "0.9rem" }}>
          Sync status and memory preview for this issue.
        </div>
      </div>

      <div style={cardStyle}>
        <Row label="Issue" value={data.issueIdentifier ?? data.issueId} />
        <Row label="Sync enabled" value={data.syncEnabled ? "Yes" : "No"} />
        <Row label="Last synced comment" value={data.lastSyncedCommentId ?? "Not synced yet"} />
        <Row label="Last synced at" value={data.lastSyncedCommentCreatedAt ?? "Never"} />
        <Row label="Last append" value={data.latestAppendAt ?? "Never"} />
        <Row label="Replay requested" value={data.replayRequestedAt ?? "No"} />
        <Row label="Replay in progress" value={data.replayInProgress ? "Yes" : "No"} />
        <Row
          label="Document sync"
          value={
            data.config.syncIssueDocuments
              ? `Enabled (${data.lastSyncedDocumentRevisionKey ?? "no revision synced"})`
              : "Disabled"
          }
        />
        <Row
          label="Peer chat tool"
          value={data.config.enablePeerChat ? "Enabled" : "Disabled"}
        />
      </div>

      <div style={cardStyle}>
        <strong>Context Preview</strong>
        <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.45 }}>
          {data.contextPreview ?? "No Honcho context fetched yet."}
        </div>
        <div style={{ color: "#64748b", fontSize: "0.85rem" }}>
          Preview refreshed: {data.contextFetchedAt ?? "Never"}
        </div>
      </div>

      <div style={cardStyle}>
        <strong>Latest Error</strong>
        <div style={{ color: data.lastError ? "#991b1b" : "#64748b", whiteSpace: "pre-wrap" }}>
          {data.lastError
            ? `${data.lastError.message}${data.lastError.at ? `\n${data.lastError.at}` : ""}`
            : "No sync errors recorded."}
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <button
          type="button"
          style={buttonStyle}
          onClick={() => {
            if (!context.companyId) return;
            void resyncIssue({ issueId: context.entityId, companyId: context.companyId }).catch(console.error);
          }}
        >
          Resync Issue
        </button>
        <button
          type="button"
          style={buttonStyle}
          onClick={() => {
            void testConnection().catch(console.error);
          }}
        >
          Test Connection
        </button>
      </div>
    </div>
  );
}
