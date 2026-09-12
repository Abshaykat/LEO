import {
  configureLeoAI,
  getConfiguredAIProvider
} from "../ai/leo-ai.ts";

import {
  LeoBrain
} from "../orchestrator/leo-brain.ts";

import {
  COMMAND_WORKING_DIRECTORY
} from "../config/leo-config.ts";

import {
  ActionPlanner
} from "./action-planner.ts";

function assert(
  condition: boolean,
  message: string
): void {
  if (!condition) {
    throw new Error(
      `AI ACTION PLANNER TEST FAILURE: ${message}`
    );
  }
}

async function main(): Promise<void> {

  console.log(
    "=== L.E.O. LOCAL AI ACTION PLANNER TEST ==="
  );

  configureLeoAI({
    provider:
      "ollama",
    model:
      "qwen3:1.7b"
  });

  const provider =
    getConfiguredAIProvider(
      "ollama"
    );

  const brain =
    new LeoBrain(
      provider
    );

  const planner =
    new ActionPlanner();

  const result =
    await planner.planWithAI(
      'Run the PowerShell command Write-Output "AI planner ready"',
      brain
    );

  console.log(
    "\nPlan:",
    JSON.stringify(
      result,
      null,
      2
    )
  );

  assert(
    result.type === "action",
    "Local AI did not create an action plan."
  );

  assert(
    result.action?.toolName ===
      "pc.run_command",
    "AI selected an unapproved tool."
  );

  assert(
    result.action?.parameters != null &&
    typeof result.action.parameters === "object",
    "Action parameters are missing."
  );

  const action = result.action;

  assert(
    action !== undefined,
    "AI-generated action is missing."
  );

  if (action === undefined) {
    throw new Error(
      "TEST FAILURE: AI-generated action is missing."
    );
  }

  const parameters =
    action.parameters as Record<string, unknown>;

  assert(
    typeof parameters.command === "string" &&
    parameters.command.length > 0,
    "AI did not provide a command."
  );

  const configuredWorkingDirectory =
    COMMAND_WORKING_DIRECTORY;

  assert(
    parameters.workingDirectory ===
      configuredWorkingDirectory,
    "AI did not preserve the controlled working directory."
  );

  console.log(
    "\nPASS: Local AI produced a structured action."
  );

  console.log(
    "PASS: Tool selection remained restricted."
  );

  console.log(
    "PASS: Action parameters passed validation."
  );

  console.log(
    "\n=== L.E.O. LOCAL AI ACTION PLANNER TEST PASSED ==="
  );
}

main().catch((error) => {

  console.error(
    "\n=== L.E.O. LOCAL AI ACTION PLANNER TEST FAILED ==="
  );

  console.error(error);

  process.exit(1);
});
