import {
  canTransitionAgentLifecycle,
  validateAgentLifecycleTransition,
  getAllowedAgentLifecycleTransitions
} from "./agent-lifecycle-policy.ts";

function assert(
  condition: unknown,
  message: string
): void {
  if (!condition) {
    throw new Error(message);
  }
}

console.log("\n=== L.E.O. AGENT LIFECYCLE POLICY TEST ===");

assert(
  canTransitionAgentLifecycle("draft", "active"),
  "draft -> active must be allowed."
);

assert(
  canTransitionAgentLifecycle("draft", "archived"),
  "draft -> archived must be allowed."
);

assert(
  canTransitionAgentLifecycle("active", "disabled"),
  "active -> disabled must be allowed."
);

assert(
  canTransitionAgentLifecycle("active", "archived"),
  "active -> archived must be allowed."
);

assert(
  canTransitionAgentLifecycle("disabled", "active"),
  "disabled -> active must be allowed."
);

assert(
  canTransitionAgentLifecycle("disabled", "archived"),
  "disabled -> archived must be allowed."
);

assert(
  !canTransitionAgentLifecycle("archived", "active"),
  "archived -> active must be rejected."
);

assert(
  !canTransitionAgentLifecycle("archived", "disabled"),
  "archived -> disabled must be rejected."
);

assert(
  !canTransitionAgentLifecycle("active", "draft"),
  "active -> draft must be rejected."
);

assert(
  !canTransitionAgentLifecycle("disabled", "draft"),
  "disabled -> draft must be rejected."
);

assert(
  !canTransitionAgentLifecycle("draft", "disabled"),
  "draft -> disabled must be rejected."
);

assert(
  !canTransitionAgentLifecycle("draft", "draft"),
  "Same-state transition must be rejected."
);

const invalid = validateAgentLifecycleTransition(
  "archived",
  "active"
);

assert(
  !invalid.allowed,
  "Invalid transition must return allowed=false."
);

assert(
  typeof invalid.reason === "string" &&
    invalid.reason.length > 0,
  "Invalid transition must provide a reason."
);

const activeTransitions =
  getAllowedAgentLifecycleTransitions("active");

assert(
  activeTransitions.includes("disabled"),
  "Active agent must be able to become disabled."
);

assert(
  activeTransitions.includes("archived"),
  "Active agent must be archivable."
);

assert(
  !activeTransitions.includes("draft"),
  "Active agent must not return to draft."
);

const archivedTransitions =
  getAllowedAgentLifecycleTransitions("archived");

assert(
  archivedTransitions.length === 0,
  "Archived agent must be terminal."
);

console.log("PASS: draft -> active.");
console.log("PASS: draft -> archived.");
console.log("PASS: active -> disabled.");
console.log("PASS: active -> archived.");
console.log("PASS: disabled -> active.");
console.log("PASS: disabled -> archived.");
console.log("PASS: invalid lifecycle transitions rejected.");
console.log("PASS: archived state is terminal.");
console.log("PASS: same-state transitions rejected.");

console.log("=== AGENT LIFECYCLE POLICY TEST PASSED ===");