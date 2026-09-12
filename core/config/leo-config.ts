import path from "node:path";

function envPath(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? path.resolve(value) : undefined;
}

export const LEO_ROOT =
  envPath("LEO_HOME") ??
  path.resolve(process.cwd());

export const WORKSPACE_ROOT =
  envPath("LEO_WORKSPACE") ??
  path.join(LEO_ROOT, "workspace");

export const APPROVAL_ROOT =
  envPath("LEO_APPROVAL_ROOT") ??
  path.join(WORKSPACE_ROOT, "approvals");

export const WORKFLOW_ROOT =
  envPath("LEO_WORKFLOW_ROOT") ??
  path.join(WORKSPACE_ROOT, "workflows");

export const MEMORY_ROOT =
  envPath("LEO_MEMORY_ROOT") ??
  path.join(WORKSPACE_ROOT, "memory");

export const AUDIT_ROOT =
  envPath("LEO_AUDIT_ROOT") ??
  path.join(WORKSPACE_ROOT, "audit");

export const AGENT_ROOT =
  envPath("LEO_AGENT_ROOT") ??
  path.join(WORKSPACE_ROOT, "agents");

export const FAMILY_ROOT =
  envPath("LEO_FAMILY_ROOT") ??
  path.join(WORKSPACE_ROOT, "family");

export const BACKUP_ROOT =
  envPath("LEO_BACKUP_ROOT") ??
  (process.platform === "win32"
    ? "E:\\LEO-Backups"
    : path.join(LEO_ROOT, "backups"));

export const COMMAND_WORKING_DIRECTORY =
  envPath("LEO_COMMAND_WORKING_DIRECTORY") ??
  LEO_ROOT;

export const MAX_FILE_READ_BYTES = 4 * 1024 * 1024;
export const MAX_FILE_WRITE_BYTES = 4 * 1024 * 1024;
export const MAX_COMMAND_OUTPUT_BYTES = 256 * 1024;
export const COMMAND_TIMEOUT_MS = 30_000;
export const MAX_HTTP_RESPONSE_BYTES = 2 * 1024 * 1024;

export function assertInside(root: string, target: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);

  if (
    resolvedTarget !== resolvedRoot &&
    !resolvedTarget.startsWith(resolvedRoot + path.sep)
  ) {
    throw new Error(
      `Path is outside the authorized L.E.O. directory: ${resolvedTarget}`
    );
  }

  return resolvedTarget;
}

export function resolveLeoPath(
  requested: string,
  root: string = LEO_ROOT
): string {
  if (!requested.trim()) {
    throw new Error("A non-empty path is required.");
  }

  const candidate =
    path.isAbsolute(requested)
      ? requested
      : path.join(root, requested);

  return assertInside(root, candidate);
}

export function getConfigSummary(): Record<string, string> {
  return {
    leoRoot: LEO_ROOT,
    workspaceRoot: WORKSPACE_ROOT,
    approvalRoot: APPROVAL_ROOT,
    workflowRoot: WORKFLOW_ROOT,
    memoryRoot: MEMORY_ROOT,
    auditRoot: AUDIT_ROOT,
    agentRoot: AGENT_ROOT,
    backupRoot: BACKUP_ROOT,
    commandWorkingDirectory: COMMAND_WORKING_DIRECTORY
  };
}
