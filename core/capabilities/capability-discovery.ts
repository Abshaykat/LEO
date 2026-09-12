import type {
  CapabilityDefinition,
  CapabilityDiscoveryResult,
  CapabilityRequirement
} from "./capability-types.ts";

import type {
  CapabilityRegistry
} from "./capability-registry.ts";

function createRequirement(
  id: string,
  description: string,
  kind: CapabilityRequirement["kind"]
): CapabilityRequirement {

  return {
    id,
    description,
    kind
  };
}

const RULES: Array<{
  test: RegExp;
  requirement:
    CapabilityRequirement;
}> = [

  {
    test:
      /\b(powershell|command|run|execute)\b/i,

    requirement:
      createRequirement(
        "local.command.execute",
        "Execute a controlled local command.",
        "tool"
      )
  },

  {
    test:
      /\b(read|open|inspect|view)\b.*\b(file|document|txt|json|csv)\b/i,

    requirement:
      createRequirement(
        "local.file.read",
        "Read a local file.",
        "tool"
      )
  },

  {
    test:
      /\b(write|save|create|edit)\b.*\b(file|document|txt|json|csv)\b/i,

    requirement:
      createRequirement(
        "local.file.write",
        "Write or create a local file.",
        "tool"
      )
  },

  {
    test:
      /\b(list|show)\b.*\b(files|folder|directory)\b/i,

    requirement:
      createRequirement(
        "local.file.list",
        "List local files.",
        "tool"
      )
  },

  {
    test:
      /\b(search|research|find)\b.*\b(web|online|internet|product|website)\b/i,

    requirement:
      createRequirement(
        "web.search",
        "Search public web information.",
        "tool"
      )
  },

  {
    test:
      /\b(read|inspect|open)\b.*\b(web|website|page|url)\b/i,

    requirement:
      createRequirement(
        "web.read",
        "Read public web content.",
        "tool"
      )
  },

  {
    test:
      /\b(excel|spreadsheet|xlsx)\b/i,

    requirement:
      createRequirement(
        "spreadsheet.create",
        "Create or modify a spreadsheet.",
        "integration"
      )
  },

  {
    test:
      /\b(click|type|fill|select|upload|download)\b/i,

    requirement:
      createRequirement(
        "browser.interact",
        "Interact with a browser page.",
        "tool"
      )
  }
];

export function
discoverCapabilities(
  task: string,
  registry: CapabilityRegistry
):
  CapabilityDiscoveryResult {

  if (!task.trim()) {
    throw new Error(
      "Task is required for capability discovery."
    );
  }

  const requirements =
    new Map<
      string,
      CapabilityRequirement
    >();

  for (
    const rule of RULES
  ) {

    if (
      rule.test.test(task)
    ) {

      requirements.set(
        rule.requirement.id,
        rule.requirement
      );
    }
  }

  const discovered =
    [
      ...requirements.values()
    ];

  const available:
    CapabilityDefinition[] = [];

  const gaps:
    Array<{
      requirement:
        CapabilityRequirement;
      reason:
        "missing" |
        "unavailable" |
        "disabled";
    }> = [];

  for (
    const required of discovered
  ) {

    const capability =
      registry.get(
        required.id
      );

    if (!capability) {

      gaps.push({
        requirement:
          required,
        reason:
          "missing"
      });

      continue;
    }

    if (
      capability.status !==
      "available"
    ) {

      gaps.push({
        requirement:
          required,
        reason:
          capability.status ===
          "disabled"
            ? "disabled"
            : "unavailable"
      });

      continue;
    }

    available.push(
      capability
    );
  }

  return {
    requirements:
      discovered,

    available,

    gaps
  };
}

