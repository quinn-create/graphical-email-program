import type { AiProviderAdapter } from "@mattermail/ai-core";
import { createMockAdapter, defaultModelsFor } from "@mattermail/ai-core";
import type { ProviderType } from "@mattermail/shared";

export interface AiOpenrouterConfig {
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
 * OPENROUTER provider adapter.
 * Real HTTP calls are used only when apiKey/credentials are provided and mock!==true.
 * Without credentials, Mock/Demo mode is used and never claims a real connection.
 */
export function createAiOpenrouterAdapter(config: AiOpenrouterConfig = {}): AiProviderAdapter {
  const useMock = config.mock !== false && !config.apiKey;
  if (useMock) {
    return createMockAdapter("OPENROUTER" as ProviderType, defaultModelsFor("OPENROUTER" as ProviderType));
  }
  // Production HTTP adapter skeleton — validates config and falls back to mock list until live call wiring.
  // Credentials stay in main process / secret store; never passed to renderer.
  return createHttpAiOpenrouterAdapter(config);
}

function createHttpAiOpenrouterAdapter(config: AiOpenrouterConfig): AiProviderAdapter {
  const mock = createMockAdapter("OPENROUTER" as ProviderType, defaultModelsFor("OPENROUTER" as ProviderType));
  return {
    ...mock,
    async testConnection() {
      if (!config.apiKey && "OPENROUTER" !== "OLLAMA") {
        return { ok: false, message: "API key required for live OPENROUTER connection" };
      }
      // Live connection test would call the provider models endpoint here.
      // Until credentials are supplied in-app, report clearly that live mode is configured but not verified in this environment.
      return {
        ok: false,
        message: "Live OPENROUTER adapter configured — connection not verified (no network test in scaffold). Use Mock mode or run connection test from Settings with credentials.",
      };
    },
  };
}

export const PROVIDER_TYPE = "OPENROUTER" as const;
