import { registerToolExecutor } from "../execution/tool-executor-registry.ts";
import { deleteAgent, listAgents, transitionAgentLifecycle, updateAgent } from "./agent-store.ts";
import { executeAgentCreate } from "../execution/execute-agent-create.ts";

function objectParams(parameters: unknown): Record<string, unknown> {
  if (typeof parameters !== "object" || parameters === null || Array.isArray(parameters)) {
    throw new Error("Tool parameters must be an object.");
  }
  return parameters as Record<string, unknown>;
}

registerToolExecutor("agent.list", () => listAgents());

registerToolExecutor("agent.create", parameters => executeAgentCreate(parameters));

registerToolExecutor("agent.activate", parameters => {
  const p = objectParams(parameters);
  return transitionAgentLifecycle(String(p.id ?? p.agentId ?? ""), "active");
});

registerToolExecutor("agent.disable", parameters => {
  const p = objectParams(parameters);
  return transitionAgentLifecycle(String(p.id ?? p.agentId ?? ""), "disabled");
});

registerToolExecutor("agent.archive", parameters => {
  const p = objectParams(parameters);
  return transitionAgentLifecycle(String(p.id ?? p.agentId ?? ""), "archived");
});

registerToolExecutor("agent.update", parameters => {
  const p = objectParams(parameters);
  const id = String(p.id ?? p.agentId ?? "");
  const fields = objectParams(p.fields ?? p);
  const allowed: Record<string, string> = {};
  for (const key of ["name", "purpose", "instructions"] as const) {
    if (typeof fields[key] === "string") allowed[key] = fields[key] as string;
  }
  return updateAgent(id, allowed);
});

registerToolExecutor("agent.delete", async parameters => {
  const p = objectParams(parameters);
  const id = String(p.id ?? "");
  await deleteAgent(id);
  return { deleted: true, id };
});
