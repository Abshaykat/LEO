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

function assert(
  condition: boolean,
  message: string
): void {
  if (!condition) {
    throw new Error(
      `RUNTIME SECURITY TEST FAILURE: ${message}`
    );
  }
}

class StaticProvider implements AIProvider {

  readonly name =
    "security-test-provider";

  private readonly response:
    string;

  constructor(
    response: string
  ) {
    this.response =
      response;
  }

  async generate(
    _request: AIRequest
  ): Promise<AIResponse> {

    return {
      content:
        this.response,

      provider:
        this.name,

      model:
        "security-test-model"
    };
  }
}

async function expectDenied(
  name: string,
  actionJson: string,
  expectedText: string
): Promise<void> {

  const provider =
    new StaticProvider(
      actionJson
    );

  const brain =
    new LeoBrain(
      provider
    );

  const runtime =
    new LeoRuntime(
      brain,
      createTestOwnerAuthenticator()
    );

  const result =
    await runtime.process({
      userMessage:
        "prepare this action",

      source:
        "text",

      ownerAuthToken:
        TEST_OWNER_AUTH_TOKEN
    });

  console.log(
    `\n[${name}]`
  );

  console.log(
    result
  );

  assert(
    result.type ===
      "denied",
    "Invalid action reached execution flow without denial."
  );

  assert(
    result.response.includes(
      expectedText
    ),
    `Unexpected denial response: ${result.response}`
  );

  console.log(
    "PASS: Invalid action was denied by runtime validation."
  );
}

async function main(): Promise<void> {

  const workingDirectory =
    process.env.LEO_COMMAND_WORKING_DIRECTORY?.trim() ||
    "D:\\LEO";

  console.log(
    "=== L.E.O. RUNTIME SECURITY REGRESSION TEST ==="
  );

  /*
   * These tests use valid ActionPlan JSON so that
   * LeoBrain parsing succeeds and the runtime
   * validation boundary is actually exercised.
   */

  await expectDenied(
    "1. Unsupported tool",
    JSON.stringify({
      type:
        "action",

      action: {
        toolName:
          "pc.delete_everything",

        parameters: {
          command:
            "Write-Output 'bad'",

          workingDirectory:
            workingDirectory
        },

        reason:
          "Invalid security test"
      }
    }),
    "unsupported action tool"
  );

  await expectDenied(
    "2. Wrong working directory",
    JSON.stringify({
      type:
        "action",

      action: {
        toolName:
          "pc.run_command",

        parameters: {
          command:
            "Write-Output 'bad'",

          workingDirectory:
            "C:\\Windows"
        },

        reason:
          "Invalid security test"
      }
    }),
    "uncontrolled working directory"
  );

  await expectDenied(
    "3. Empty command",
    JSON.stringify({
      type:
        "action",

      action: {
        toolName:
          "pc.run_command",

        parameters: {
          command:
            "   ",

          workingDirectory:
            workingDirectory
        },

        reason:
          "Invalid security test"
      }
    }),
    "empty or invalid command"
  );

  await expectDenied(
    "4. Invalid parameters",
    JSON.stringify({
      type:
        "action",

      action: {
        toolName:
          "pc.run_command",

        parameters:
          "not-an-object",

        reason:
          "Invalid security test"
      }
    }),
    "invalid action parameters"
  );

  await expectDenied(
    "5. Missing reason",
    JSON.stringify({
      type:
        "action",

      action: {
        toolName:
          "pc.run_command",

        parameters: {
          command:
            "Write-Output 'bad'",

          workingDirectory:
            workingDirectory
        },

        reason:
          ""
      }
    }),
    "without a valid reason"
  );

  console.log(
    "\n=== L.E.O. RUNTIME SECURITY REGRESSION TEST PASSED ==="
  );
}

main().catch((error) => {

  console.error(
    "\n=== L.E.O. RUNTIME SECURITY REGRESSION TEST FAILED ==="
  );

  console.error(
    error
  );

  process.exit(1);
});
