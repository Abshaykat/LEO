export interface AIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface AIRequest {
  messages: AIMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface AIResponse {
  content: string;
  model: string;
  provider: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface AIProvider {
  readonly name: string;

  generate(
    request: AIRequest
  ): Promise<AIResponse>;
}
