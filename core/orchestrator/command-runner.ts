import { routeCommand } from "./command-router.ts";
import { execute } from "../execution/execution-engine.ts";

export async function runCommand(
  input: string,
  approvalId?: string
) {
  const request = routeCommand(input);

  if (!request) {
    return {
      decision: "deny" as const,
      reason: "I could not understand that command."
    };
  }

  return execute({
    ...request,
    approvalId
  });
}
