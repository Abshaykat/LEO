import { getTool } from "../permissions/tool-registry.ts";
import { executeThroughGate, type ExecutionContext, type ToolExecutor, type ExecutionDecision } from "./execution-gate.ts";
import { getToolExecutor } from "./tool-executor-registry.ts";

// Side-effect-only import: populates the tool-executor registry with every
// known capability. This is the single remaining load-bearing dependency
// between the core runtime and the capability layer — execution-engine.ts
// itself contains no capability-specific logic or imports beyond this one
// bootstrap line. Adding, removing, or changing a capability never
// requires editing this file again; it only requires editing the
// capability's own module and runtime/register-tools.ts's import list.
import "../runtime/register-tools.ts";

export interface ExecutionRequest {
  toolName: string;
  parameters: unknown;
  reason: string;
  context: ExecutionContext;
  approvalId?: string;
  traceId?: string;
  /** Set when this call was delegated by the Supervisor to a specific L.E.O. agent. */
  agentId?: string;
  /** Set when this call was made on behalf of a specific family member (never the owner themselves). */
  userId?: string;
}

export type ExecutionResult = ExecutionDecision;

const executor: ToolExecutor = async (tool, parameters) => {
  const registered = getToolExecutor(tool.name);
  if (!registered) {
    throw new Error(`No executor is registered for tool: ${tool.name}`);
  }
  return registered(parameters);
};

export async function execute(request: ExecutionRequest): Promise<ExecutionResult> {
  const tool = getTool(request.toolName);
  if (!tool) return { decision: "deny", reason: `Unknown tool: ${request.toolName}` };

  return executeThroughGate(
    {
      tool,
      parameters: request.parameters,
      reason: request.reason,
      context: request.context,
      approvalId: request.approvalId,
      traceId: request.traceId,
      agentId: request.agentId,
      userId: request.userId
    },
    executor
  );
}
