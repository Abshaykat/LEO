import type {
  AIProvider,
  AIRequest,
  AIResponse
} from "./ai-provider.ts";

interface OllamaTagResponse { models?: Array<{ name?: string }> }

interface OllamaChatResponse {
  message?: {
    content?: string;
  };
  model?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

export interface OllamaAIProviderOptions {
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  think?: boolean;
  preferredModels?: string[];
}

export class OllamaAIProvider implements AIProvider {

  readonly name = "ollama";

  private readonly baseUrl: string;
  private readonly model: string;
  private readonly temperature?: number;
  private readonly maxTokens?: number;
  private readonly think?: boolean;
  private readonly preferredModels: string[];
  private cachedModel?: string;
  private modelCheckedAt = 0;

  constructor(
    options: OllamaAIProviderOptions = {}
  ) {
    this.baseUrl =
      options.baseUrl ??
      "http://localhost:11434";

    this.model =
      options.model ??
      "qwen3:1.7b";

    this.temperature =
      options.temperature;

    this.maxTokens =
      options.maxTokens;
    this.think =
      options.think ?? false;
    this.preferredModels =
      options.preferredModels ?? ["qwen3:4b", "qwen3:1.7b"];
  }

  private async resolveModel(): Promise<string> {
    const configured = this.model.trim();
    const now = Date.now();
    if (this.cachedModel && now - this.modelCheckedAt < 30000) return this.cachedModel;
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) return configured;
      const data = await response.json() as OllamaTagResponse;
      const installed = new Set(
        (data.models ?? [])
          .map(model => model.name)
          .filter((name): name is string => typeof name === "string")
      );
      const selected = installed.has(configured)
        ? configured
        : this.preferredModels.find(model => installed.has(model)) ?? configured;
      this.cachedModel = selected;
      this.modelCheckedAt = now;
      return selected;
    } catch {
      return configured;
    }
  }

  async generate(
    request: AIRequest
  ): Promise<AIResponse> {

    const model = await this.resolveModel();
    const response =
      await fetch(
        `${this.baseUrl}/api/chat`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json"
          },

          body: JSON.stringify({
            model,

            messages:
              request.messages,

            stream: false,
            think: this.think,
            keep_alive: "10m",

            options: {
              num_ctx: 3072,
              ...(this.temperature !== undefined
                ? {
                    temperature:
                      this.temperature
                  }
                : {}),

              ...((request.maxTokens ?? this.maxTokens) !== undefined
                ? {
                    num_predict:
                      request.maxTokens ?? this.maxTokens
                  }
                : {})
            }
          })
        }
      );

    if (!response.ok) {
      throw new Error(
        `Ollama API request failed: ${response.status} ${response.statusText}`
      );
    }

    const data =
      await response.json() as OllamaChatResponse;

    const content =
      data.message?.content;

    if (
      typeof content !== "string"
    ) {
      throw new Error(
        "Ollama API returned no assistant message content."
      );
    }

    return {
      content,
      model:
        data.model ??
        model,
      provider:
        this.name,
      usage: {
        inputTokens:
          data.prompt_eval_count,
        outputTokens:
          data.eval_count
      }
    };
  }
}
