import type { AgentLifecycleStatus } from "./agent-types.ts";

export interface AgentLifecycleTransitionResult {
  allowed: boolean;
  reason?: string;
}

const ALLOWED_TRANSITIONS: Readonly<Record<
  AgentLifecycleStatus,
  readonly AgentLifecycleStatus[]
>> = Object.freeze({
  draft: ["active", "archived"],
  active: ["disabled", "archived"],
  disabled: ["active", "archived"],
  archived: []
});

export function canTransitionAgentLifecycle(
  from: AgentLifecycleStatus,
  to: AgentLifecycleStatus
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function validateAgentLifecycleTransition(
  from: AgentLifecycleStatus,
  to: AgentLifecycleStatus
): AgentLifecycleTransitionResult {
  if (from === to) {
    return {
      allowed: false,
      reason: `Agent is already in lifecycle state: ${from}.`
    };
  }

  if (!canTransitionAgentLifecycle(from, to)) {
    return {
      allowed: false,
      reason:
        `Invalid agent lifecycle transition: ${from} -> ${to}.`
    };
  }

  return {
    allowed: true
  };
}

export function getAllowedAgentLifecycleTransitions(
  status: AgentLifecycleStatus
): readonly AgentLifecycleStatus[] {
  return ALLOWED_TRANSITIONS[status];
}
