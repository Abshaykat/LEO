import {
  registerAIProvider,
  getAIProvider
} from "./provider-registry.ts";

import {
  OllamaAIProvider
} from "./ollama-provider.ts";

export interface LeoAIConfiguration {
  provider?: string;
  model?: string;
  baseUrl?: string;
}

export function configureLeoAI(
  configuration: LeoAIConfiguration = {}
): void {

  const providerName =
    configuration.provider ?? "ollama";

  if (
    providerName === "ollama" &&
    !getAIProvider("ollama")
  ) {

    registerAIProvider(
      new OllamaAIProvider({
        model:
          configuration.model ??
          "qwen3:1.7b",

        baseUrl:
          configuration.baseUrl ??
          "http://localhost:11434"
      })
    );
  }
}

export function getConfiguredAIProvider(
  providerName = "ollama"
) {

  const provider =
    getAIProvider(providerName);

  if (!provider) {
    throw new Error(
      `L.E.O. AI provider is not configured: ${providerName}`
    );
  }

  return provider;
}
