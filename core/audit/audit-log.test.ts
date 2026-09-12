import {
  readFile,
  rm
} from "node:fs/promises";

import {
  getAuditFilePath,
  writeAuditEvent
} from "./audit-log.ts";

async function main() {
  console.log(
    "=== L.E.O. AUDIT LOG TEST ==="
  );

  /*
   * Start with a clean test log.
   */
  await rm(
    getAuditFilePath(),
    {
      force: true
    }
  );

  /*
   * 1. Write an approval request event.
   */
  const requested = await writeAuditEvent({
    type: "approval_requested",
    tool: "pc.run_command",
    approvalId: "audit-test-approval",
    decision: "require_approval",
    reason: "Audit logger test."
  });

  if (
    requested.type !== "approval_requested" ||
    !requested.id ||
    !requested.timestamp
  ) {
    throw new Error(
      "AUDIT FAILURE: Approval event was not created correctly."
    );
  }

  console.log(
    "PASS: Approval request event written."
  );

  /*
   * 2. Write an execution event.
   */
  const execution = await writeAuditEvent({
    type: "execution_succeeded",
    tool: "pc.run_command",
    approvalId: "audit-test-approval",
    decision: "allow",
    reason: "Audit execution test.",
    parametersHash: "test-hash",
    result: {
      stdout: "audit-test",
      exitCode: 0
    }
  });

  if (
    execution.type !== "execution_succeeded" ||
    execution.result === undefined
  ) {
    throw new Error(
      "AUDIT FAILURE: Execution event was not created correctly."
    );
  }

  console.log(
    "PASS: Execution event written."
  );

  /*
   * 3. Verify JSONL persistence.
   */
  const raw = await readFile(
    getAuditFilePath(),
    "utf8"
  );

  const lines = raw
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);

  if (lines.length !== 2) {
    throw new Error(
      `AUDIT FAILURE: Expected 2 events, found ${lines.length}.`
    );
  }

  const parsed = lines.map(
    (line) => JSON.parse(line)
  );

  if (
    parsed[0].type !== "approval_requested" ||
    parsed[1].type !== "execution_succeeded"
  ) {
    throw new Error(
      "AUDIT FAILURE: Persisted event order/content is incorrect."
    );
  }

  console.log(
    "PASS: JSONL persistence verified."
  );

  /*
   * 4. Verify unique event IDs.
   */
  if (parsed[0].id === parsed[1].id) {
    throw new Error(
      "AUDIT FAILURE: Event IDs are not unique."
    );
  }

  console.log(
    "PASS: Unique event IDs verified."
  );

  /*
   * 5. Verify timestamps.
   */
  if (
    typeof parsed[0].timestamp !== "string" ||
    typeof parsed[1].timestamp !== "string"
  ) {
    throw new Error(
      "AUDIT FAILURE: Timestamp missing."
    );
  }

  console.log(
    "PASS: Event timestamps verified."
  );

  console.log(
    "\n=== AUDIT LOG TEST PASSED ==="
  );
}

main().catch((error) => {
  console.error(
    "\n=== AUDIT LOG TEST FAILED ==="
  );

  console.error(error);

  process.exit(1);
});
