import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import { ACTION_KEYS, DATA_KEYS, DEFAULT_CONFIG, EXPORT_NAMES, PLUGIN_ID, PLUGIN_VERSION, SLOT_IDS, TOOL_NAMES } from "./constants.js";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Honcho Memory",
  description: "Sync Paperclip issue comments and documents into Honcho and expose scoped memory tools for agents.",
  author: "Paperclip",
  categories: ["connector", "automation", "ui"],
  capabilities: [
    "issues.read",
    "issue.comments.read",
    "issue.documents.read",
    "agents.read",
    "plugin.state.read",
    "plugin.state.write",
    "events.subscribe",
    "agent.tools.register",
    "http.outbound",
    "secrets.read-ref",
    "instance.settings.register",
    "ui.detailTab.register",
    "ui.dashboardWidget.register",
  ],
  instanceConfigSchema: {
    type: "object",
    properties: {
      honchoApiBaseUrl: {
        type: "string",
        title: "Honcho API Base URL",
        default: DEFAULT_CONFIG.honchoApiBaseUrl,
      },
      honchoApiKeySecretRef: {
        type: "string",
        title: "Honcho API Key Secret Ref",
        default: DEFAULT_CONFIG.honchoApiKeySecretRef,
      },
      workspacePrefix: {
        type: "string",
        title: "Workspace Prefix",
        default: DEFAULT_CONFIG.workspacePrefix,
      },
      syncIssueComments: {
        type: "boolean",
        title: "Sync Issue Comments",
        default: DEFAULT_CONFIG.syncIssueComments,
      },
      syncIssueDocuments: {
        type: "boolean",
        title: "Sync Issue Documents",
        default: DEFAULT_CONFIG.syncIssueDocuments,
      },
      enablePeerChat: {
        type: "boolean",
        title: "Enable Peer Chat Tool",
        default: DEFAULT_CONFIG.enablePeerChat,
      },
      observeAgentPeers: {
        type: "boolean",
        title: "Allow Honcho To Observe Agent Peers",
        default: DEFAULT_CONFIG.observeAgentPeers,
      },
    },
  },
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  tools: [
    {
      name: TOOL_NAMES.getIssueContext,
      displayName: "Honcho Issue Context",
      description: "Retrieve compact Honcho context for the current issue session.",
      parametersSchema: {
        type: "object",
        properties: {
          issueId: { type: "string" },
        },
      },
    },
    {
      name: TOOL_NAMES.searchMemory,
      displayName: "Honcho Search Memory",
      description: "Search Honcho memory within the current workspace, narrowing to the current issue by default.",
      parametersSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          issueId: { type: "string" },
          scope: { type: "string", enum: ["workspace", "session"] },
          limit: { type: "number" },
        },
        required: ["query"],
      },
    },
    {
      name: TOOL_NAMES.askPeer,
      displayName: "Honcho Ask Peer",
      description: "Query Honcho peer chat for a target peer. Requires peer chat to be enabled in plugin config.",
      parametersSchema: {
        type: "object",
        properties: {
          targetPeerId: { type: "string" },
          query: { type: "string" },
          issueId: { type: "string" },
        },
        required: ["targetPeerId", "query"],
      },
    },
  ],
  ui: {
    slots: [
      {
        type: "settingsPage",
        id: SLOT_IDS.settingsPage,
        displayName: "Honcho Settings",
        exportName: EXPORT_NAMES.settingsPage,
      },
      {
        type: "dashboardWidget",
        id: SLOT_IDS.dashboardWidget,
        displayName: "Honcho Memory",
        exportName: EXPORT_NAMES.dashboardWidget,
      },
      {
        type: "detailTab",
        id: SLOT_IDS.issueTab,
        displayName: "Memory",
        exportName: EXPORT_NAMES.issueTab,
        entityTypes: ["issue"],
        order: 40,
      },
    ],
  },
};

export const HONCHO_DATA_KEYS = DATA_KEYS;
export const HONCHO_ACTION_KEYS = ACTION_KEYS;
export default manifest;
