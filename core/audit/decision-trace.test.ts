import {
  createTraceId,
  recordDecisionTrace
} from "./decision-trace.ts";

import {
  getAuditFilePath
} from "./audit-logger.ts";

import {
  readFile,
  rm
} from "node:fs/promises";

function assert(
  condition: boolean,
  message: string
): void {
  if (!condition) {
    throw new Error(
      `DECISION TRACE TEST FAILURE: ${message}`
    );
  }
}

async function main(): Promise<void> {

  console.log(
    "=== L.E.O. DECISION TRACE TEST ==="
  );

  const traceId =
    createTraceId();

  assert(
    typeof traceId === "string" &&
    traceId.length > 0,
    "Trace ID was not generated."
  );

  await recordDecisionTrace({
    traceId,
    stage:
      "action_planned",
    outcome:
      "pending",
    tool:
      "pc.run_command",
    reason:
      "User explicitly requested command execution.",
    details: {
      source:
        "text",
      provider:
        "security-test-provider",
      model:
        "security-test-model"
    }
  });

  await recordDecisionTrace({
    traceId,
    stage:
      "action_validated",
    outcome:
      "allow",
    tool:
      "pc.run_command",
    details: {
      parametersValidated:
        true,
      workingDirectoryControlled:
        true
    }
  });

  const content =
    await readFile(
      getAuditFilePath(),
      "utf8"
    );

  const records =
    content
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map(
        line =>
          JSON.parse(line) as Record<string, unknown>
      );

  const matching =
    records.filter(
      record =>
        record.type ===
          "decision_trace" &&
        typeof record.details ===
          "object" &&
        record.traceId === traceId
    );

  assert(
    matching.length === 2,
    `Expected 2 trace records, found ${matching.length}.`
  );

  for (const record of matching) {

    assert(
      record.traceId === traceId,
      "Trace ID mismatch."
    );

    const details =
      record.details as Record<string, unknown>;

    assert(
      typeof details.stage === "string",
      "Trace stage missing."
    );
  }

  console.log(
    "PASS: Decision trace records are correlated."
  );

  console.log(
    `Trace ID: ${traceId}`
  );

  console.log(
    "=== L.E.O. DECISION TRACE TEST PASSED ==="
  );
}

main().catch(error => {

  console.error(
    "\n=== L.E.O. DECISION TRACE TEST FAILED ==="
  );

  console.error(error);

  process.exit(1);
});


