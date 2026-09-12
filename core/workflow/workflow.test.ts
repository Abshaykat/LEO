import assert from "node:assert/strict";

import {
  runWorkflow
} from "./workflow-runner.ts";

import type {
  WorkflowDefinition,
  WorkflowState
} from "./workflow.ts";

async function testSequentialWorkflow() {

  interface State extends WorkflowState {
    value: number;
  }

  const definition: WorkflowDefinition<State> = {
    id: "test-sequential",
    startNodeId: "start",
    nodes: {
      start: {
        id: "start",
        async run({ state }) {
          return {
            state: {
              ...state,
              value: state.value + 1
            }
          };
        },
        next: () => "finish"
      },

      finish: {
        id: "finish",
        async run({ state }) {
          return {
            state: {
              ...state,
              value: state.value + 1
            },
            output: "done"
          };
        }
      }
    }
  };

  const result =
    await runWorkflow(
      definition,
      { value: 0 }
    );

  assert.equal(
    result.status,
    "completed"
  );

  assert.equal(
    result.state.value,
    2
  );

  assert.equal(
    result.output,
    "done"
  );

  assert.equal(
    result.history.length,
    2
  );
}

async function testConditionalTransition() {

  interface State extends WorkflowState {
    approved: boolean;
    path?: string;
  }

  const definition: WorkflowDefinition<State> = {
    id: "test-conditional",
    startNodeId: "decision",
    nodes: {
      decision: {
        id: "decision",
        async run({ state }) {
          return {
            state
          };
        },
        next: (state) =>
          state.approved
            ? "approved"
            : "rejected"
      },

      approved: {
        id: "approved",
        async run({ state }) {
          return {
            state: {
              ...state,
              path: "approved"
            }
          };
        }
      },

      rejected: {
        id: "rejected",
        async run({ state }) {
          return {
            state: {
              ...state,
              path: "rejected"
            }
          };
        }
      }
    }
  };

  const approved =
    await runWorkflow(
      definition,
      { approved: true }
    );

  assert.equal(
    approved.status,
    "completed"
  );

  assert.equal(
    approved.state.path,
    "approved"
  );

  const rejected =
    await runWorkflow(
      definition,
      { approved: false }
    );

  assert.equal(
    rejected.status,
    "completed"
  );

  assert.equal(
    rejected.state.path,
    "rejected"
  );
}

async function testRetry() {

  interface State extends WorkflowState {
    attempts: number;
  }

  let attempts = 0;

  const definition: WorkflowDefinition<State> = {
    id: "test-retry",
    startNodeId: "unstable",
    nodes: {
      unstable: {
        id: "unstable",

        retry: {
          maxAttempts: 3
        },

        async run({ state }) {

          attempts++;

          if (attempts < 3) {
            throw new Error(
              "Temporary failure"
            );
          }

          return {
            state: {
              ...state,
              attempts
            }
          };
        }
      }
    }
  };

  const result =
    await runWorkflow(
      definition,
      { attempts: 0 }
    );

  assert.equal(
    result.status,
    "completed"
  );

  assert.equal(
    result.state.attempts,
    3
  );

  assert.equal(
    result.history.length,
    3
  );

  assert.equal(
    result.history[0].status,
    "failure"
  );

  assert.equal(
    result.history[1].status,
    "failure"
  );

  assert.equal(
    result.history[2].status,
    "success"
  );
}

async function testFailure() {

  const definition: WorkflowDefinition<Record<string, unknown>> = {
    id: "test-failure",
    startNodeId: "broken",
    nodes: {
      broken: {
        id: "broken",

        async run() {
          throw new Error(
            "Expected test failure"
          );
        }
      }
    }
  };

  const result =
    await runWorkflow(
      definition,
      {}
    );

  assert.equal(
    result.status,
    "failed"
  );

  assert.equal(
    result.error,
    "Expected test failure"
  );
}

async function testStepLimit() {

  const definition: WorkflowDefinition<Record<string, unknown>> = {
    id: "test-step-limit",
    startNodeId: "loop",
    maxSteps: 3,
    nodes: {
      loop: {
        id: "loop",

        async run({ state }) {
          return {
            state
          };
        },

        next: () => "loop"
      }
    }
  };

  const result =
    await runWorkflow(
      definition,
      {}
    );

  assert.equal(
    result.status,
    "failed"
  );

  assert.match(
    result.error ?? "",
    /maximum step limit/
  );
}

async function main() {

  await testSequentialWorkflow();
  await testConditionalTransition();
  await testRetry();
  await testFailure();
  await testStepLimit();

  console.log(
    "Workflow tests passed."
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
