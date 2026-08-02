import type { AiProviderAdapter } from "@mattermail/ai-core";
import { createMockAdapter, defaultModelsFor } from "@mattermail/ai-core";
import type { ProviderType } from "@mattermail/shared";

export interface AiMistralConfig {
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
 * MISTRAL provider adapter.
 * Real HTTP calls are used only when apiKey/credentials are provided and mock!==true.
 * Without credentials, Mock/Demo mode is used and never claims a real connection.
 */
export function createAiMistralAdapter(config: AiMistralConfig = {}): AiProviderAdapter {
  const useMock = config.mock !== false && !config.apiKey;
  if (useMock) {
    return createMockAdapter("MISTRAL" as ProviderType, defaultModelsFor("MISTRAL" as ProviderType));
  }
  // Production HTTP adapter skeleton — validates config and falls back to mock list until live call wiring.
  // Credentials stay in main process / secret store; never passed to renderer.
  return createHttpAiMistralAdapter(config);
}

function createHttpAiMistralAdapter(config: AiMistralConfig): AiProviderAdapter {
  const mock = createMockAdapter("MISTRAL" as ProviderType, defaultModelsFor("MISTRAL" as ProviderType));
  return {
    ...mock,
    async testConnection() {
      if (!config.apiKey && "MISTRAL" !== "OLLAMA") {
        return { ok: false, message: "API key required for live MISTRAL connection" };
      }
      // Live connection test would call the provider models endpoint here.
      // Until credentials are supplied in-app, report clearly that live mode is configured but not verified in this environment.
      return {
        ok: false,
        message: "Live MISTRAL adapter configured — connection not verified (no network test in scaffold). Use Mock mode or run connection test from Settings with credentials.",
      };
    },
  };
}

export const PROVIDER_TYPE = "MISTRAL" as const;
