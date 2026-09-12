import {
  discoverCapabilities
} from "./capability-discovery.ts";

import {
  createDefaultCapabilityRegistry
} from "./capability-registry.ts";

export interface CapabilityPlan {
  task: string;

  requirements: string[];

  available: string[];

  missing: string[];

  nextAction:
    | "execute"
    | "create_capability";
}

export function
planCapabilities(
  task: string
):
  CapabilityPlan {

  const registry =
    createDefaultCapabilityRegistry();

  const discovery =
    discoverCapabilities(
      task,
      registry
    );

  return {
    task,

    requirements:
      discovery.requirements.map(
        (item) => item.id
      ),

    available:
      discovery.available.map(
        (item) => item.id
      ),

    missing:
      discovery.gaps.map(
        (item) =>
          item.requirement.id
      ),

    nextAction:
      discovery.gaps.length > 0
        ? "create_capability"
        : "execute"
  };
}
