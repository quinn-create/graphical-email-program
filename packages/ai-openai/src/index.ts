import type { AiProviderAdapter } from "@mattermail/ai-core";
import { createMockAdapter, defaultModelsFor } from "@mattermail/ai-core";
import type { ProviderType } from "@mattermail/shared";

export interface AiOpenaiConfig {
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
 * OPENAI provider adapter.
 * Real HTTP calls are used only when apiKey/credentials are provided and mock!==true.
 * Without credentials, Mock/Demo mode is used and never claims a real connection.
 */
export function createAiOpenaiAdapter(config: AiOpenaiConfig = {}): AiProviderAdapter {
  const useMock = config.mock !== false && !config.apiKey;
  if (useMock) {
    return createMockAdapter("OPENAI" as ProviderType, defaultModelsFor("OPENAI" as ProviderType));
  }
  // Production HTTP adapter skeleton — validates config and falls back to mock list until live call wiring.
  // Credentials stay in main process / secret store; never passed to renderer.
  return createHttpAiOpenaiAdapter(config);
}

function createHttpAiOpenaiAdapter(config: AiOpenaiConfig): AiProviderAdapter {
  const mock = createMockAdapter("OPENAI" as ProviderType, defaultModelsFor("OPENAI" as ProviderType));
  return {
    ...mock,
    async testConnection() {
      if (!config.apiKey && "OPENAI" !== "OLLAMA") {
        return { ok: false, message: "API key required for live OPENAI connection" };
      }
      // Live connection test would call the provider models endpoint here.
      // Until credentials are supplied in-app, report clearly that live mode is configured but not verified in this environment.
      return {
        ok: false,
        message: "Live OPENAI adapter configured — connection not verified (no network test in scaffold). Use Mock mode or run connection test from Settings with credentials.",
      };
    },
  };
}

export const PROVIDER_TYPE = "OPENAI" as const;
