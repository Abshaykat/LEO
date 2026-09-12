import assert from "node:assert/strict";
import type { AIProvider, AIRequest, AIResponse } from "../ai/ai-provider.ts";
import { LeoBrain, detectConversationStyle } from "./leo-brain.ts";

class CaptureProvider implements AIProvider {
  readonly name = "conversation-context-test";
  lastRequest?: AIRequest;

  async generate(request: AIRequest): Promise<AIResponse> {
    this.lastRequest = request;
    return {
      provider: this.name,
      model: "test-model",
      content: "6 Sept 2026, 00:56\nTranslation and context:\n- User greeting\nSteps:\n1. Analyze the request\nProposed response:\nBujhlam. Ami tomar shathe naturally kotha bolchi."
    };
  }
}

async function main(): Promise<void> {
  assert.equal(detectConversationStyle("Hello LEO, how are you?"), "english");
  assert.equal(detectConversationStyle("হ্যালো লিও, কেমন আছো?"), "bangla");
  assert.equal(detectConversationStyle("Hello LEO, kemon acho? tomar capability shomporke jante chai."), "banglish");
  assert.equal(detectConversationStyle("হ্যালো LEO, kemon acho?"), "mixed");

  const provider = new CaptureProvider();
  const brain = new LeoBrain(provider);

  await brain.respond({
    userMessage: "Hello LEO, kemon acho? tomar capability shomporke jante chai.",
    conversation: [
      { role: "user", content: "Ami L.E.O. niye kaj kortesi." },
      { role: "assistant", content: "Haan, bujhte parchi." }
    ]
  });

  const system = provider.lastRequest?.messages.find(message => message.role === "system")?.content ?? "";
  assert.match(system, /Banglish using Latin letters|Banglish/);
  assert.match(system, /tomar capability shomporke jante chai/);
  assert.match(system, /CURRENT DATE\/TIME \(Bangladesh, Asia\/Dhaka\)/);
  assert.ok(
    provider.lastRequest?.messages.some(
      message => message.role === "user" && message.content === "Ami L.E.O. niye kaj kortesi."
    )
  );

  console.log("PASS: Bangla/Banglish/mixed language detection and live date-time context.");
  console.log("PASS: Recent conversation history is forwarded.");
  assert.equal(provider.lastRequest?.messages.at(-1)?.content, "Hello LEO, kemon acho? tomar capability shomporke jante chai.");
  assert.equal(provider.lastRequest?.maxTokens, 256);
  assert.equal(
    (await brain.respond({ userMessage: "Hello LEO, kemon acho? tomar capability shomporke jante chai." })).response,
    "Bujhlam. Ami tomar shathe naturally kotha bolchi."
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
