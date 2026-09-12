import type {
  AIProvider,
  AIRequest,
  AIResponse
} from "../ai/ai-provider.ts";

export class TestAIProvider
  implements AIProvider {

  readonly name = "test";

  async generate(
    request: AIRequest
  ): Promise<AIResponse> {

    const lastMessage =
      [...request.messages]
        .reverse()
        .find(
          (message) =>
            message.role === "user"
        );

    return {
      content:
        `L.E.O. received: ${lastMessage?.content ?? ""}`,
      model: "test-model",
      provider: this.name
    };
  }
}
