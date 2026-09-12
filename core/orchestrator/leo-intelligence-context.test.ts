import type {
  AIMessage,
  AIProvider,
  AIRequest,
  AIResponse
} from "../ai/ai-provider.ts";

import {
  LeoBrain
} from "./leo-brain.ts";

function assert(
  condition: boolean,
  message: string
): void {
  if (!condition) {
    throw new Error(
      `LEO INTELLIGENCE CONTEXT TEST FAILURE: ${message}`
    );
  }
}

class CaptureProvider implements AIProvider {

  readonly name = "capture-provider";

  lastRequest?: AIRequest;

  async generate(
    request: AIRequest
  ): Promise<AIResponse> {
    this.lastRequest = request;

    return {
      content:
        JSON.stringify({
          type:
            "response",

          response:
            "ঠিক আছে, আমি আগের context ব্যবহার করছি।"
        }),

      provider:
        this.name,

      model:
        "capture-model"
    };
  }
}

async function main(): Promise<void> {

  console.log(
    "=== L.E.O. INTELLIGENCE CONTEXT TEST ==="
  );

  const provider =
    new CaptureProvider();

  const brain =
    new LeoBrain(
      provider
    );

  const conversation: AIMessage[] = [
    {
      role:
        "user",
      content:
        "আমার নাম Shaykat."
    },
    {
      role:
        "assistant",
      content:
        "ঠিক আছে, Shaykat."
    }
  ];

  const result =
    await brain.respond({
      userMessage:
        "মনে আছে আমাকে?",

      conversation
    });

  assert(
    provider.lastRequest !== undefined,
    "Provider did not receive a request."
  );

  const messages =
    provider.lastRequest!.messages;

  assert(
    messages.some(
      message =>
        message.role === "system" &&
        message.content.includes("Bangla") &&
        message.content.includes("English") &&
        message.content.includes("Banglish")
    ),
    "L.E.O. language contract is missing."
  );

  assert(
    messages.some(
      message =>
        message.role === "system" &&
        message.content.includes("not a generic chatbot")
    ),
    "L.E.O. identity contract is missing."
  );

  assert(
    messages.some(
      message =>
        message.role === "user" &&
        message.content === "আমার নাম Shaykat."
    ),
    "Previous user context was not forwarded."
  );

  assert(
    messages.some(
      message =>
        message.role === "assistant" &&
        message.content === "ঠিক আছে, Shaykat."
    ),
    "Previous assistant context was not forwarded."
  );

  assert(
    messages.at(-1)?.content === "মনে আছে আমাকে?",
    "Current user message was not appended after context."
  );

  assert(
    result.response.includes("আগের context"),
    "Brain response did not return through L.E.O."
  );

  console.log(
    "PASS: Bangla/context request reached the same L.E.O. brain."
  );

  console.log(
    "PASS: Previous conversation was preserved."
  );

  console.log(
    "PASS: L.E.O. identity/language contract is enforced."
  );

  console.log(
    "\n=== L.E.O. INTELLIGENCE CONTEXT TEST PASSED ==="
  );
}

main().catch((error) => {

  console.error(
    "\n=== L.E.O. INTELLIGENCE CONTEXT TEST FAILED ==="
  );

  console.error(error);
  process.exit(1);
});
