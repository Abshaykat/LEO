import type { ExecutionRequest } from "../execution/execution-engine.ts";

const context = {
  source: "text" as const,
  ownerAuthenticated: true
};

export function routeCommand(input: string): ExecutionRequest | null {
  const text = input.trim();

  if (!text) return null;

  if (/^(run|execute|powershell)\s+/i.test(text)) {
    const command = text.replace(/^(run|execute|powershell)\s+/i, "").trim();

    return {
      toolName: "pc.run_command",
      parameters: { command },
      reason: `User requested command execution: ${command}`,
      context
    };
  }

  const read = text.match(/^(read|open)\s+file\s+(.+)$/i);

  if (read) {
    return {
      toolName: "pc.read_file",
      parameters: { path: read[2].trim() },
      reason: `User requested reading file: ${read[2].trim()}`,
      context
    };
  }

  return null;
}
