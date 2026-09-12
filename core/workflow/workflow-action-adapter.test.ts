import assert from "node:assert/strict";

import {
  executePlannedAction
} from "./workflow-action-adapter.ts";

async function main() {

  const result =
    await executePlannedAction({
      action: {
        toolName: "pc.run_command",
        parameters: {
          command: 'Write-Output "Workflow adapter test"',
          workingDirectory: "D:\\LEO"
        },
        reason:
          "Verify workflow-to-execution integration."
      },

      context: {
        source: "system",
        ownerAuthenticated: true
      }
    });

  assert.equal(
    result.decision,
    "require_approval"
  );

  assert.ok(
    "approvalId" in result
  );

  console.log(
    "Workflow action adapter test passed."
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
