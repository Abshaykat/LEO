import {
  TEST_OWNER_AUTH_TOKEN,
  createTestOwnerAuthenticator
} from "../identity/owner-auth.test-support.ts";
import type {
  AIProvider,
  AIRequest,
  AIResponse
} from "../ai/ai-provider.ts";

import {
  LeoBrain
} from "../orchestrator/leo-brain.ts";

import {
  LeoRuntime
} from "./leo-runtime.ts";

import {
  approveRequest
} from "../approvals/approval-engine.ts";

function assert(
  condition: boolean,
  message: string
): void {
  if (!condition) {
    throw new Error(
      `NATURAL LANGUAGE RUNTIME E2E FAILURE: ${message}`
    );
  }
}

class NaturalLanguageProvider
  implements AIProvider {

  readonly name =
    "natural-language-e2e-provider";

  lastRequest?: AIRequest;

  async generate(
    request: AIRequest
  ): Promise<AIResponse> {

    this.lastRequest =
      request;

    const workingDirectory =
      process.env.LEO_COMMAND_WORKING_DIRECTORY?.trim() ||
      "D:\\LEO";

    return {
      content:
        JSON.stringify({
          type:
            "action",

          action: {
            toolName:
              "pc.run_command",

            parameters: {
              command:
                'Write-Output "Natural language runtime works"',

              workingDirectory
            },

            reason:
              "Executing the command requested through natural-language interpretation."
          }
        }),

      provider:
        this.name,

      model:
        "natural-language-e2e-model"
    };
  }
}


class ConversationOnlyProvider implements AIProvider {
  readonly name = "conversation-only-test-provider";

  lastRequest?: AIRequest;

  async generate(request: AIRequest): Promise<AIResponse> {
    this.lastRequest = request;
    return {
      provider: this.name,
      model: "conversation-only-test-model",
      content: "Hello Owner. I'm L.E.O. and I'm ready to help. What would you like to do?"
    };
  }
}

async function main(): Promise<void> {

  console.log(
    "=== L.E.O. NATURAL-LANGUAGE RUNTIME E2E TEST ==="
  );

  const provider =
    new NaturalLanguageProvider();

  const brain =
    new LeoBrain(
      provider
    );

  const runtime =
    new LeoRuntime(
      brain,
      createTestOwnerAuthenticator()
    );

  console.log(
    "\n[1] Sending natural-language request..."
  );

  const first =
    await runtime.process({
      userMessage:
        "Please run a command that confirms the natural-language runtime is working.",

      source:
        "text",

      ownerAuthToken:
        TEST_OWNER_AUTH_TOKEN
    });

  console.log(first);

  assert(
    provider.lastRequest !== undefined,
    "Natural-language request never reached the AI provider."
  );

  assert(
    provider.lastRequest!.messages.at(-1)?.content ===
      "Please run a command that confirms the natural-language runtime is working.",
    "Original natural-language request was not forwarded to the AI provider."
  );

  console.log(
    "PASS: Natural-language request reached the L.E.O. brain."
  );

  assert(
    first.type ===
      "approval_required",
    "AI-generated action did not enter the approval boundary."
  );

  if (
    first.type !==
    "approval_required"
  ) {
    throw new Error(
      "Unexpected result type."
    );
  }

  assert(
    first.toolName ===
      "pc.run_command",
    "AI selected an unexpected tool."
  );

  assert(
    first.approvalId.length > 0,
    "Approval ID was not generated."
  );

  assert(
    first.traceId.length > 0,
    "Decision trace ID was not generated."
  );

  console.log(
    "PASS: AI-generated action entered owner approval."
  );

  console.log(
    "\n[2] Approving the exact AI-generated action..."
  );

  const approval =
    await approveRequest(
      first.approvalId
    );

  assert(
    approval.status ===
      "approved",
    "AI-generated action approval was not recorded."
  );

  console.log(
    "PASS: Exact AI-generated action was approved."
  );

  console.log(
    "\n[3] Resubmitting the exact natural-language request..."
  );

  const second =
    await runtime.process({
      userMessage:
        "Please run a command that confirms the natural-language runtime is working.",

      source:
        "text",

      ownerAuthToken:
        TEST_OWNER_AUTH_TOKEN,

      approvalId:
        first.approvalId,

      traceId:
        first.traceId
    });

  console.log(second);

  assert(
    second.type ===
      "execution",
    "Approved AI-generated action did not execute."
  );

  if (
    second.type !==
    "execution"
  ) {
    throw new Error(
      "Unexpected result type after approval."
    );
  }

  assert(
    second.toolName ===
      "pc.run_command",
    "Wrong tool reached execution."
  );

  const executionResult =
    second.result as {
      stdout?: string;
      stderr?: string;
      exitCode?: number;
    };

  assert(
    executionResult.exitCode ===
      0,
    "AI-generated command did not execute successfully."
  );

  assert(
    executionResult.stdout?.includes(
      "Natural language runtime works"
    ) === true,
    "Unexpected execution stdout."
  );

  assert(
    executionResult.stderr ===
      "",
    "Execution produced unexpected stderr output."
  );

  console.log(
    "PASS: Exact approved AI-generated action reached execution."
  );

  console.log(
    "\n[4] Verifying ordinary conversation remains conversational..."
  );

  const conversationProvider =
    new ConversationOnlyProvider();
  const conversationBrain =
    new LeoBrain(conversationProvider);
  const conversationRuntime =
    new LeoRuntime(
      conversationBrain,
      createTestOwnerAuthenticator()
    );

  const conversationResult =
    await conversationRuntime.process({
      userMessage:
        "Hello L.E.O., how are you today?",
      source:
        "text",
      ownerAuthToken:
        TEST_OWNER_AUTH_TOKEN,
      conversation: [
        {
          role: "user",
          content: "We are working on L.E.O."
        },
        {
          role: "assistant",
          content: "Yes, Owner."
        }
      ]
    });

  assert(
    conversationProvider.lastRequest !== undefined,
    "Ordinary conversation never reached the L.E.O. brain."
  );

  assert(
    conversationProvider.lastRequest!.messages.some(
      message =>
        message.role === "user" &&
        message.content === "We are working on L.E.O."
    ),
    "Conversation history was not forwarded to the brain."
  );

  assert(
    conversationResult.type === "response",
    "Ordinary conversation was incorrectly routed into action planning or execution."
  );

  assert(
    conversationResult.response.includes("Hello Owner."),
    "The natural conversational response was not preserved."
  );

  console.log(
    "PASS: Ordinary conversation stays conversational without entering execution."
  );
  console.log(
    "PASS: Conversation history is forwarded to the brain."
  );

  console.log(
    "\n=== L.E.O. NATURAL-LANGUAGE RUNTIME E2E TEST PASSED ==="
  );
}

main().catch(
  error => {

    console.error(
      "\n=== L.E.O. NATURAL-LANGUAGE RUNTIME E2E TEST FAILED ==="
    );

    console.error(error);

    process.exit(1);
  }
);
