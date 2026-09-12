import type { AIProvider } from "./ai-provider.ts";

const providers = new Map<string, AIProvider>();

export function registerAIProvider(
  provider: AIProvider
): void {
  if (providers.has(provider.name)) {
    throw new Error(
      `AI provider already registered: ${provider.name}`
    );
  }

  providers.set(provider.name, provider);
}

export function getAIProvider(
  name: string
): AIProvider | undefined {
  return providers.get(name);
}

export function listAIProviders(): string[] {
  return [...providers.keys()];
}
