import {
  ActionPlanner
} from "./action-planner.ts";

import {
  COMMAND_WORKING_DIRECTORY
} from "../config/leo-config.ts";

function assert(
  condition: boolean,
  message: string
): void {

  if (!condition) {
    throw new Error(
      `ACTION PLANNER TEST FAILURE: ${message}`
    );
  }
}

function main(): void {

  console.log(
    "=== L.E.O. ACTION PLANNER TEST ==="
  );

  const planner =
    new ActionPlanner();

  const result =
    planner.plan(
      'run Write-Output "Hello from L.E.O."'
    );

  assert(
    result.type === "action",
    "Command was not converted into an action."
  );

  assert(
    result.action?.toolName === "pc.run_command",
    "Incorrect tool selected."
  );

  assert(
    result.action?.parameters != null &&
    typeof result.action.parameters === "object" &&
    "command" in result.action.parameters &&
    result.action.parameters.command ===
      'Write-Output "Hello from L.E.O."',
    "Command parameters are incorrect."
  );

  assert(
    result.action?.parameters != null &&
    typeof result.action.parameters === "object" &&
    "workingDirectory" in result.action.parameters &&
    result.action.parameters.workingDirectory ===
      COMMAND_WORKING_DIRECTORY,
    "Working directory is incorrect."
  );

  console.log(
    "PASS: Command converted to structured action."
  );

  console.log(
    "PASS: Correct tool selected."
  );

  console.log(
    "PASS: Exact parameters preserved."
  );

  console.log(
    "\n=== ACTION PLANNER TEST PASSED ==="
  );
}

try {
  main();
} catch (error) {

  console.error(
    "\n=== ACTION PLANNER TEST FAILED ==="
  );

  console.error(error);

  process.exit(1);
}

