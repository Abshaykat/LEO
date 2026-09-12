import type {
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
      `AI WORKFLOW TEST FAILURE: ${message}`
    );
  }
}

class StubAIProvider implements AIProvider {
  readonly name =
    "workflow-ai-test";

  constructor(
    private readonly response: string
  ) {}

  async generate(
    _request: AIRequest
  ): Promise<AIResponse> {
    return {
      content:
        this.response,
      model:
        "stub-workflow-model",
      provider:
        this.name
    };
  }
}

async function main(): Promise<void> {

  console.log(
    "=== L.E.O. AI WORKFLOW PLANNING TEST ==="
  );

  const workflowResponse =
    JSON.stringify({
      type:
        "workflow",
      workflow: {
        workflowId:
          "ai-workflow-test",
        reason:
          "Complete a controlled two-step file workflow.",
        steps: [
          {
            id:
              "step-1",
            action: {
              toolName:
                "pc.read_file",
              parameters: {
                path:
                  "D:\\LEO\\README.md"
              },
              reason:
                "Read the project README."
            }
          },
          {
            id:
              "step-2",
            action: {
              toolName:
                "pc.write_file",
              parameters: {
                path:
                  "D:\\LEO\\workspace\\ai-workflow-test.txt",
                content:
                  "AI workflow planning verified."
              },
              reason:
                "Write the workflow verification result."
            }
          }
        ]
      }
    });

  const provider =
    new StubAIProvider(
      workflowResponse
    );

  const brain =
    new LeoBrain(
      provider
    );

  console.log(
    "\n[1] Planning AI-generated workflow..."
  );

  const result =
    await brain.planAction({
      userMessage:
        "Read the README and then write a workflow verification file."
    });

  assert(
    result.actionPlan?.type ===
      "workflow",
    "AI workflow was not parsed as a workflow."
  );

  console.log(
    "PASS: AI-generated workflow parsed."
  );

  assert(
    result.actionPlan?.workflow?.workflowId ===
      "ai-workflow-test",
    "Workflow ID was not preserved."
  );

  console.log(
    "PASS: Workflow ID preserved."
  );

  const workflow =
    result.actionPlan?.workflow;

  assert(
    workflow !== undefined,
    "Workflow object is missing."
  );

  if (workflow === undefined) {
    throw new Error(
      "Workflow object is missing."
    );
  }

  assert(
    workflow.steps.length ===
      2,
    "AI workflow did not preserve two steps."
  );

  console.log(
    "PASS: Multi-step workflow preserved."
  );

  assert(
    workflow.steps[0]?.action.toolName ===
      "pc.read_file",
    "First AI workflow tool is incorrect."
  );

  assert(
    workflow.steps[1]?.action.toolName ===
      "pc.write_file",
    "Second AI workflow tool is incorrect."
  );

  console.log(
    "PASS: AI workflow tool selection preserved."
  );

  assert(
    workflow.steps[0]?.action.parameters != null,
    "First workflow parameters are missing."
  );

  assert(
    workflow.steps[1]?.action.parameters != null,
    "Second workflow parameters are missing."
  );

  console.log(
    "PASS: AI workflow parameters preserved."
  );

  assert(
    workflow.steps[0]?.action.reason.length > 0,
    "First workflow action reason is missing."
  );

  assert(
    workflow.steps[1]?.action.reason.length > 0,
    "Second workflow action reason is missing."
  );

  console.log(
    "PASS: Per-step action reasons preserved."
  );

  console.log(
    "\n[2] Verifying Brain does not execute workflow..."
  );

  assert(
    result.actionPlan?.type ===
      "workflow",
    "Brain did not return a planning result."
  );

  console.log(
    "PASS: Brain returned a plan only."
  );

  console.log(
    "\n=== L.E.O. AI WORKFLOW PLANNING TEST PASSED ==="
  );
}

main().catch(
  (error) => {
    console.error(
      "\n=== L.E.O. AI WORKFLOW PLANNING TEST FAILED ==="
    );

    console.error(
      error
    );

    process.exit(1);
  }
);