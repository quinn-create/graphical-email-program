import type { AiProviderAdapter } from "@mattermail/ai-core";
import { createMockAdapter, defaultModelsFor } from "@mattermail/ai-core";
import type { ProviderType } from "@mattermail/shared";

export interface AiOllamaConfig {
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
 * OLLAMA provider adapter.
 * Real HTTP calls are used only when apiKey/credentials are provided and mock!==true.
 * Without credentials, Mock/Demo mode is used and never claims a real connection.
 */
export function createAiOllamaAdapter(config: AiOllamaConfig = {}): AiProviderAdapter {
  const useMock = config.mock !== false && !config.apiKey;
  if (useMock) {
    return createMockAdapter("OLLAMA" as ProviderType, defaultModelsFor("OLLAMA" as ProviderType));
  }
  // Production HTTP adapter skeleton — validates config and falls back to mock list until live call wiring.
  // Credentials stay in main process / secret store; never passed to renderer.
  return createHttpAiOllamaAdapter(config);
}

function createHttpAiOllamaAdapter(config: AiOllamaConfig): AiProviderAdapter {
  const mock = createMockAdapter("OLLAMA" as ProviderType, defaultModelsFor("OLLAMA" as ProviderType));
  return {
    ...mock,
    async testConnection() {
      if (!config.apiKey && "OLLAMA" !== "OLLAMA") {
        return { ok: false, message: "API key required for live OLLAMA connection" };
      }
      // Live connection test would call the provider models endpoint here.
      // Until credentials are supplied in-app, report clearly that live mode is configured but not verified in this environment.
      return {
        ok: false,
        message: "Live OLLAMA adapter configured — connection not verified (no network test in scaffold). Use Mock mode or run connection test from Settings with credentials.",
      };
    },
  };
}

export const PROVIDER_TYPE = "OLLAMA" as const;
