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
      `WORKFLOW PARSER TEST FAILURE: ${message}`
    );
  }
}

class StubAIProvider implements AIProvider {
  readonly name = "workflow-parser-test";

  private readonly content: string;

  constructor(
    content: string
  ) {
    this.content = content;
  }

  async generate(
    _request: AIRequest
  ): Promise<AIResponse> {
    return {
      content:
        this.content,
      model:
        "test-model",
      provider:
        this.name
    };
  }
}

async function runBrain(
  content: string
) {
  const provider =
    new StubAIProvider(
      content
    );

  const brain =
    new LeoBrain(
      provider
    );

  return brain.planAction({
    userMessage:
      "test workflow request"
  });
}

async function main(): Promise<void> {

  console.log(
    "=== L.E.O. WORKFLOW PARSER REGRESSION TEST ==="
  );

  const validWorkflow =
    JSON.stringify({
      type:
        "workflow",
      workflow: {
        workflowId:
          "workflow-parser-test",
        reason:
          "Verify multi-step workflow parsing.",
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
                "Read the L.E.O. README."
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
                  "D:\\LEO\\workspace\\workflow-parser-test.txt",
                content:
                  "Workflow parser regression passed."
              },
              reason:
                "Write the workflow regression result."
            }
          }
        ]
      }
    });

  console.log(
    "\n[1] Valid multi-step workflow..."
  );

  const valid =
    await runBrain(
      validWorkflow
    );

  assert(
    valid.actionPlan?.type ===
      "workflow",
    "Valid workflow was not parsed as a workflow."
  );

  assert(
    valid.actionPlan?.workflow?.workflowId ===
      "workflow-parser-test",
    "Workflow ID was not preserved."
  );

  assert(
    valid.actionPlan?.workflow?.reason ===
      "Verify multi-step workflow parsing.",
    "Workflow reason was not preserved."
  );

  assert(
    valid.actionPlan?.workflow?.steps.length ===
      2,
    "Workflow did not preserve both steps."
  );

  const steps =
    valid.actionPlan?.workflow?.steps;

  assert(
    steps !== undefined,
    "Workflow steps are missing."
  );

  if (steps === undefined) {
    throw new Error(
      "Workflow steps are missing."
    );
  }

  assert(
    steps[0]?.id ===
      "step-1",
    "First step ID was not preserved."
  );

  assert(
    steps[0]?.action.toolName ===
      "pc.read_file",
    "First step tool was not preserved."
  );

  assert(
    steps[1]?.id ===
      "step-2",
    "Second step ID was not preserved."
  );

  assert(
    steps[1]?.action.toolName ===
      "pc.write_file",
    "Second step tool was not preserved."
  );

  console.log(
    "PASS: Valid multi-step workflow parsed."
  );


  console.log(
    "\n[2] Missing workflow ID..."
  );

  const missingWorkflowId =
    JSON.stringify({
      type:
        "workflow",
      workflow: {
        reason:
          "Invalid workflow.",
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
                "Read file."
            }
          }
        ]
      }
    });

  const missingIdResult =
    await runBrain(
      missingWorkflowId
    );

  assert(
    missingIdResult.actionPlan ===
      undefined,
    "Workflow without workflowId was accepted."
  );

  console.log(
    "PASS: Missing workflow ID rejected."
  );


  console.log(
    "\n[3] Empty workflow steps..."
  );

  const emptySteps =
    JSON.stringify({
      type:
        "workflow",
      workflow: {
        workflowId:
          "empty-steps",
        reason:
          "Invalid workflow.",
        steps: []
      }
    });

  const emptyStepsResult =
    await runBrain(
      emptySteps
    );

  assert(
    emptyStepsResult.actionPlan ===
      undefined,
    "Workflow with empty steps was accepted."
  );

  console.log(
    "PASS: Empty workflow steps rejected."
  );


  console.log(
    "\n[4] Invalid workflow step..."
  );

  const invalidStep =
    JSON.stringify({
      type:
        "workflow",
      workflow: {
        workflowId:
          "invalid-step",
        reason:
          "Invalid workflow.",
        steps: [
          {
            id:
              "step-1",
            action: {
              parameters: {}
            }
          }
        ]
      }
    });

  const invalidStepResult =
    await runBrain(
      invalidStep
    );

  assert(
    invalidStepResult.actionPlan ===
      undefined,
    "Workflow with invalid step was accepted."
  );

  console.log(
    "PASS: Invalid workflow step rejected."
  );


  console.log(
    "\n[5] Missing step reason..."
  );

  const missingStepReason =
    JSON.stringify({
      type:
        "workflow",
      workflow: {
        workflowId:
          "missing-step-reason",
        reason:
          "Invalid workflow.",
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
              }
            }
          }
        ]
      }
    });

  const missingReasonResult =
    await runBrain(
      missingStepReason
    );

  assert(
    missingReasonResult.actionPlan ===
      undefined,
    "Workflow with missing step reason was accepted."
  );

  console.log(
    "PASS: Missing step reason rejected."
  );


  console.log(
    "\n[6] Existing normal action parsing..."
  );

  const normalAction =
    JSON.stringify({
      type:
        "action",
      action: {
        toolName:
          "pc.run_command",
        parameters: {
          command:
            'Write-Output "workflow parser regression"',
          workingDirectory:
            "D:\\LEO"
        },
        reason:
          "Verify existing action parsing."
      }
    });

  const actionResult =
    await runBrain(
      normalAction
    );

  assert(
    actionResult.actionPlan?.type ===
      "action",
    "Existing action parsing was broken."
  );

  assert(
    actionResult.actionPlan?.action?.toolName ===
      "pc.run_command",
    "Existing action tool parsing was broken."
  );

  console.log(
    "PASS: Existing action parsing preserved."
  );


  console.log(
    "\n[7] Existing response parsing..."
  );

  const normalResponse =
    JSON.stringify({
      type:
        "response",
      response:
        "Normal response parsing still works."
    });

  const responseResult =
    await runBrain(
      normalResponse
    );

  assert(
    responseResult.actionPlan?.type ===
      "response",
    "Existing response parsing was broken."
  );

  assert(
    responseResult.actionPlan?.response ===
      "Normal response parsing still works.",
    "Existing response content was not preserved."
  );

  console.log(
    "PASS: Existing response parsing preserved."
  );


  console.log(
    "\n=== L.E.O. WORKFLOW PARSER REGRESSION TEST PASSED ==="
  );
}

main().catch(
  (error) => {
    console.error(
      "\n=== L.E.O. WORKFLOW PARSER REGRESSION TEST FAILED ==="
    );

    console.error(
      error
    );

    process.exit(1);
  }
);