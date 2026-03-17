import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { getResolvedConfig } from "../src/config.js";
import { BASE_CONFIG, createHonchoHarness, installFetchMock } from "./helpers.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("honcho config", () => {
  it("declares the settings page and dashboard widget using the current plugin framework slots", () => {
    expect(manifest.capabilities).toEqual(expect.arrayContaining([
      "instance.settings.register",
      "ui.dashboardWidget.register",
      "ui.detailTab.register",
    ]));
    expect(manifest.ui?.slots).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "settingsPage", displayName: "Honcho Settings" }),
      expect.objectContaining({ type: "dashboardWidget", displayName: "Honcho Memory" }),
      expect.objectContaining({ type: "detailTab", displayName: "Memory" }),
    ]));
  });

  it("normalizes config values and applies defaults", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        honchoApiBaseUrl: " https://api.honcho.dev/ ",
        honchoApiKeySecretRef: " HONCHO_API_KEY ",
        workspacePrefix: "   ",
        syncIssueComments: "unexpected",
        syncIssueDocuments: true,
        enablePeerChat: "nope",
        observeAgentPeers: "nope",
      },
    });

    const resolved = await getResolvedConfig(harness.ctx);

    expect(resolved.honchoApiBaseUrl).toBe("https://api.honcho.dev/");
    expect(resolved.honchoApiKeySecretRef).toBe("HONCHO_API_KEY");
    expect(resolved.workspacePrefix).toBe(BASE_CONFIG.workspacePrefix);
    expect(resolved.syncIssueComments).toBe(true);
    expect(resolved.syncIssueDocuments).toBe(true);
    expect(resolved.enablePeerChat).toBe(false);
    expect(resolved.observeAgentPeers).toBe(false);
  });

  it("implements the current SDK config validation hook", async () => {
    const result = await plugin.definition.onValidateConfig?.({
      honchoApiBaseUrl: "ftp://api.honcho.dev",
      honchoApiKeySecretRef: "",
      workspacePrefix: "paperclip",
    });

    expect(result).toEqual({
      ok: false,
      errors: [
        "Honcho base URL must use http or https",
        "Honcho API key secret ref is required",
      ],
    });
  });

  it("warns when all syncing is disabled without rejecting the config", async () => {
    const result = await plugin.definition.onValidateConfig?.({
      ...BASE_CONFIG,
      syncIssueComments: false,
      syncIssueDocuments: false,
    });

    expect(result?.ok).toBe(true);
    expect(result?.warnings?.[0]).toContain("disabled");
  });

  it("fails test-connection before any outbound request when config is invalid", async () => {
    const { fetchMock } = installFetchMock();
    const harness = createHonchoHarness({
      config: {
        honchoApiBaseUrl: "",
        honchoApiKeySecretRef: "",
      },
    });

    await plugin.definition.setup(harness.ctx);

    await expect(harness.performAction("test-connection")).rejects.toThrow("Honcho base URL is required");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
