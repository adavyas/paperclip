import type { PluginContext } from "@paperclipai/plugin-sdk";
import { DEFAULT_CONFIG } from "./constants.js";
import type { HonchoPluginConfig, HonchoResolvedConfig } from "./types.js";

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

export async function getResolvedConfig(ctx: PluginContext): Promise<HonchoResolvedConfig> {
  const config = (await ctx.config.get()) as HonchoPluginConfig;
  return {
    honchoApiBaseUrl: normalizeString(config.honchoApiBaseUrl, DEFAULT_CONFIG.honchoApiBaseUrl),
    honchoApiKeySecretRef: normalizeString(config.honchoApiKeySecretRef, DEFAULT_CONFIG.honchoApiKeySecretRef),
    workspacePrefix: normalizeString(config.workspacePrefix, DEFAULT_CONFIG.workspacePrefix) || DEFAULT_CONFIG.workspacePrefix,
    syncIssueComments: normalizeBoolean(config.syncIssueComments, DEFAULT_CONFIG.syncIssueComments),
    syncIssueDocuments: normalizeBoolean(config.syncIssueDocuments, DEFAULT_CONFIG.syncIssueDocuments),
    enablePeerChat: normalizeBoolean(config.enablePeerChat, DEFAULT_CONFIG.enablePeerChat),
  };
}

export function assertConfigured(config: HonchoResolvedConfig): void {
  if (!config.honchoApiBaseUrl) {
    throw new Error("Honcho base URL is not configured");
  }
  if (!config.honchoApiKeySecretRef) {
    throw new Error("Honcho API key secret ref is not configured");
  }
}
