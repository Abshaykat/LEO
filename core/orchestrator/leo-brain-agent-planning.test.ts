import type { AIMessage, AIProvider, AIRequest, AIResponse } from "../ai/ai-provider.ts";
import { LeoBrain } from "./leo-brain.ts";

class CaptureProvider implements AIProvider {
  readonly name = "capture-provider";
  lastRequest?: AIRequest;

  async generate(request: AIRequest): Promise<AIResponse> {
    this.lastRequest = request;
    return {
      content: JSON.stringify({ type: "response", response: "ok" }),
      provider: this.name,
      model: "capture-model"
    };
  }
}

async function main() {
  console.log("=== L.E.O. AGENT-TOOL PLANNING PROMPT TEST ===");

  const provider = new CaptureProvider();
  const brain = new LeoBrain(provider);

  await brain.planAction({
    userMessage: "Create an agent that manages my local knowledge store, then activate it."
  });

  if (!provider.lastRequest) throw new Error("Provider did not receive a planning request.");
  const systemMessage = provider.lastRequest.messages.find((m: AIMessage) => m.role === "system")?.content ?? "";

  const mustInclude = [
    '"toolName":"agent.create"',
    '"purpose"',
    '"instructions"',
    '"permissions"',
    '"toolName":"<agent.activate|agent.disable|agent.archive>"',
    "draft"
  ];
  for (const fragment of mustInclude) {
    if (!systemMessage.includes(fragment)) {
      throw new Error(`Expected the planning system prompt to teach the agent tool shape (missing: ${fragment}).`);
    }
  }
  console.log("PASS: the planning prompt now documents the exact parameter shape for agent.create and the lifecycle transitions.");

  console.log("\n=== AGENT-TOOL PLANNING PROMPT TEST PASSED ===");
}

main().catch(error => {
  console.error("\n=== TEST FAILED ===");
  console.error(error);
  process.exit(1);
});
