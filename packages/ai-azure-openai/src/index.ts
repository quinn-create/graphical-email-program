import type { AiProviderAdapter } from "@mattermail/ai-core";
import { createMockAdapter, defaultModelsFor } from "@mattermail/ai-core";
import type { ProviderType } from "@mattermail/shared";

export interface AiAzureOpenaiConfig {
  apiKey?: string;
  baseUrl?: string;
  organizationId?: string;
  projectId?: string;
  deploymentName?: string;
  apiVersion?: string;
  timeoutMs?: number;
  /** When true, use mock responses (default when no credentials). */
  mock?: boolean;
}

/**
 * AZURE_OPENAI provider adapter.
 * Real HTTP calls are used only when apiKey/credentials are provided and mock!==true.
 * Without credentials, Mock/Demo mode is used and never claims a real connection.
 */
export function createAiAzureOpenaiAdapter(config: AiAzureOpenaiConfig = {}): AiProviderAdapter {
  const useMock = config.mock !== false && !config.apiKey;
  if (useMock) {
    return createMockAdapter("AZURE_OPENAI" as ProviderType, defaultModelsFor("AZURE_OPENAI" as ProviderType));
  }
  // Production HTTP adapter skeleton — validates config and falls back to mock list until live call wiring.
  // Credentials stay in main process / secret store; never passed to renderer.
  return createHttpAiAzureOpenaiAdapter(config);
}

function createHttpAiAzureOpenaiAdapter(config: AiAzureOpenaiConfig): AiProviderAdapter {
  const mock = createMockAdapter("AZURE_OPENAI" as ProviderType, defaultModelsFor("AZURE_OPENAI" as ProviderType));
  return {
    ...mock,
    async testConnection() {
      if (!config.apiKey && "AZURE_OPENAI" !== "OLLAMA") {
        return { ok: false, message: "API key required for live AZURE_OPENAI connection" };
      }
      // Live connection test would call the provider models endpoint here.
      // Until credentials are supplied in-app, report clearly that live mode is configured but not verified in this environment.
      return {
        ok: false,
        message: "Live AZURE_OPENAI adapter configured — connection not verified (no network test in scaffold). Use Mock mode or run connection test from Settings with credentials.",
      };
    },
  };
}

export const PROVIDER_TYPE = "AZURE_OPENAI" as const;
