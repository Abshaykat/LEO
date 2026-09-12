import { execute, type ExecutionResult } from "../execution/execution-engine.ts";
import type { ExecutionContext } from "../execution/execution-gate.ts";
import { authorizeAgentForTool, agentCoversTool } from "./agent-execution-context.ts";
import { listAgents, type LeoAgent } from "./agent-store.ts";
import { writeAuditEvent } from "../audit/audit-log.ts";

export interface AssignTaskInput {
  agentId: string;
  toolName: string;
  parameters: unknown;
  reason: string;
  context: ExecutionContext;
  traceId?: string;
  approvalId?: string;
}

/**
 * Assigns a task to a specific, named agent. The agent must be active and
 * must already declare every permission the tool requires — the Supervisor
 * never grants a permission on the fly. If the agent is authorized, the
 * call proceeds through the SAME plan→permission→approval→execute→audit
 * gate as any owner-issued call; the Supervisor adds a check, it does not
 * remove one.
 */
export async function assignTask(input: AssignTaskInput): Promise<ExecutionResult> {
  const authorization = await authorizeAgentForTool(input.agentId, input.toolName);

  if (!authorization.authorized) {
    await writeAuditEvent({
      type: "execution_denied",
      tool: input.toolName,
      traceId: input.traceId,
      agentId: input.agentId,
      decision: "deny",
      reason: authorization.reason,
      details: { stage: "supervisor_agent_authorization" }
    });
    return { decision: "deny", reason: authorization.reason ?? "Agent is not authorized for this tool." };
  }

  return execute({
    toolName: input.toolName,
    parameters: input.parameters,
    reason: input.reason,
    context: input.context,
    traceId: input.traceId,
    approvalId: input.approvalId,
    agentId: input.agentId
  });
}

export interface AssignToBestAgentInput {
  toolName: string;
  parameters: unknown;
  reason: string;
  context: ExecutionContext;
  traceId?: string;
  /** Optional: restrict candidate selection to specific agent ids. */
  candidateAgentIds?: string[];
}

export interface AssignToBestAgentResult {
  agent: LeoAgent;
  result: ExecutionResult;
}

/**
 * Picks the first active agent whose declared permissions and security
 * policy already cover the requested tool, and delegates to it. Selection
 * is deterministic (agents are returned name-sorted by the store) rather
 * than random, so the same request always routes the same way absent
 * changes to the agent roster.
 */
export async function assignToBestAgent(
  input: AssignToBestAgentInput
): Promise<AssignToBestAgentResult> {
  const agents = await listAgents();
  const candidates = input.candidateAgentIds
    ? agents.filter(agent => input.candidateAgentIds!.includes(agent.id))
    : agents;

  const authorizedAgent = candidates.find(agent => agentCoversTool(agent, input.toolName));

  if (!authorizedAgent) {
    await writeAuditEvent({
      type: "execution_denied",
      tool: input.toolName,
      traceId: input.traceId,
      decision: "deny",
      reason: `No active agent is authorized for tool: ${input.toolName}`,
      details: { stage: "supervisor_agent_selection", candidateCount: candidates.length }
    });
    throw new Error(`No active agent is authorized to run tool: ${input.toolName}`);
  }

  const result = await assignTask({
    agentId: authorizedAgent.id,
    toolName: input.toolName,
    parameters: input.parameters,
    reason: input.reason,
    context: input.context,
    traceId: input.traceId
  });

  return { agent: authorizedAgent, result };
}

export interface AgentRosterEntry {
  agent: LeoAgent;
  authorizedTools: string[];
}

/**
 * Read-only view of which active agents cover which tools, drawn from the
 * currently registered tool set. Useful for the owner to see the current
 * workforce's actual authorized scope before delegating anything.
 */
export async function describeRoster(toolNames: string[]): Promise<AgentRosterEntry[]> {
  const agents = (await listAgents()).filter(agent => agent.status === "active");
  return agents.map(agent => ({
    agent,
    authorizedTools: toolNames.filter(toolName => agentCoversTool(agent, toolName))
  }));
}
