import type { AiProviderAdapter } from "@mattermail/ai-core";
import { createMockAdapter, defaultModelsFor } from "@mattermail/ai-core";
import type { ProviderType } from "@mattermail/shared";

export interface AiOpenaiCompatibleConfig {
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
 * CUSTOM_OPENAI_COMPATIBLE provider adapter.
 * Real HTTP calls are used only when apiKey/credentials are provided and mock!==true.
 * Without credentials, Mock/Demo mode is used and never claims a real connection.
 */
export function createAiOpenaiCompatibleAdapter(config: AiOpenaiCompatibleConfig = {}): AiProviderAdapter {
  const useMock = config.mock !== false && !config.apiKey;
  if (useMock) {
    return createMockAdapter("CUSTOM_OPENAI_COMPATIBLE" as ProviderType, defaultModelsFor("CUSTOM_OPENAI_COMPATIBLE" as ProviderType));
  }
  // Production HTTP adapter skeleton — validates config and falls back to mock list until live call wiring.
  // Credentials stay in main process / secret store; never passed to renderer.
  return createHttpAiOpenaiCompatibleAdapter(config);
}

function createHttpAiOpenaiCompatibleAdapter(config: AiOpenaiCompatibleConfig): AiProviderAdapter {
  const mock = createMockAdapter("CUSTOM_OPENAI_COMPATIBLE" as ProviderType, defaultModelsFor("CUSTOM_OPENAI_COMPATIBLE" as ProviderType));
  return {
    ...mock,
    async testConnection() {
      if (!config.apiKey && "CUSTOM_OPENAI_COMPATIBLE" !== "OLLAMA") {
        return { ok: false, message: "API key required for live CUSTOM_OPENAI_COMPATIBLE connection" };
      }
      // Live connection test would call the provider models endpoint here.
      // Until credentials are supplied in-app, report clearly that live mode is configured but not verified in this environment.
      return {
        ok: false,
        message: "Live CUSTOM_OPENAI_COMPATIBLE adapter configured — connection not verified (no network test in scaffold). Use Mock mode or run connection test from Settings with credentials.",
      };
    },
  };
}

export const PROVIDER_TYPE = "CUSTOM_OPENAI_COMPATIBLE" as const;
