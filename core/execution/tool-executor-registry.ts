export type ToolExecutorFn = (parameters: unknown) => Promise<unknown>;

const executors = new Map<string, ToolExecutorFn>();

/**
 * Called by a capability module (Layer 2/3) to register its own executor
 * for a tool name it owns. execution-engine.ts never calls this itself —
 * it only reads from the registry via getToolExecutor(). This is what lets
 * a new capability be added without ever touching execution-engine.ts:
 * the new module just imports this file and registers itself, then gets
 * added to runtime/register-tools.ts's single import list.
 */
export function registerToolExecutor(toolName: string, executor: ToolExecutorFn): void {
  if (executors.has(toolName)) {
    throw new Error(`A tool executor is already registered for "${toolName}". Each tool name may only be registered once.`);
  }
  executors.set(toolName, executor);
}

export function getToolExecutor(toolName: string): ToolExecutorFn | undefined {
  return executors.get(toolName);
}

export function listRegisteredToolNames(): string[] {
  return [...executors.keys()].sort();
}

/**
 * Test-only escape hatch: clears the registry so a test can register a
 * fresh, isolated set of fakes without colliding with "already registered"
 * errors across repeated dynamic imports in the same process.
 */
export function __clearRegistryForTests(): void {
  executors.clear();
}
