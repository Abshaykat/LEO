import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  AGENT_ROOT,
  APPROVAL_ROOT,
  AUDIT_ROOT,
  LEO_ROOT,
  MEMORY_ROOT,
  WORKFLOW_ROOT,
  WORKSPACE_ROOT
} from "../config/leo-config.ts";
import { getAuditFilePath } from "../audit/audit-log.ts";
import { listBackups } from "../backup/backup-manager.ts";

export type CheckSeverity = "low" | "medium" | "high";
export type CheckStatus = "ok" | "issue";

export interface DiagnosticCheck {
  id: string;
  description: string;
  status: CheckStatus;
  severity: CheckSeverity;
  details?: string;
  data?: Record<string, unknown>;
}

export interface DiagnosticReport {
  generatedAt: string;
  checks: DiagnosticCheck[];
}

async function directoryExists(target: string): Promise<boolean> {
  try {
    const info = await stat(target);
    return info.isDirectory();
  } catch {
    return false;
  }
}

const REQUIRED_DIRECTORIES: ReadonlyArray<{ id: string; label: string; target: string }> = [
  { id: "workspace_root", label: "workspace root", target: WORKSPACE_ROOT },
  { id: "approval_root", label: "approval store", target: APPROVAL_ROOT },
  { id: "workflow_root", label: "workflow store", target: WORKFLOW_ROOT },
  { id: "memory_root", label: "memory store", target: MEMORY_ROOT },
  { id: "audit_root", label: "audit log", target: AUDIT_ROOT },
  { id: "agent_root", label: "agent store", target: AGENT_ROOT }
];

async function checkRequiredDirectories(): Promise<DiagnosticCheck[]> {
  const checks: DiagnosticCheck[] = [];
  for (const dir of REQUIRED_DIRECTORIES) {
    const exists = await directoryExists(dir.target);
    checks.push({
      id: `directory:${dir.id}`,
      description: `${dir.label} directory exists (${dir.target})`,
      status: exists ? "ok" : "issue",
      severity: "low",
      details: exists ? undefined : "Directory is missing and will be recreated automatically.",
      data: { targetPath: dir.target }
    });
  }
  return checks;
}

async function checkBackupKeyConfigured(): Promise<DiagnosticCheck> {
  const configured = Boolean(process.env.LEO_BACKUP_KEY?.trim());
  return {
    id: "config:backup_key",
    description: "LEO_BACKUP_KEY is configured for encrypted backups",
    status: configured ? "ok" : "issue",
    severity: "high",
    details: configured
      ? undefined
      : "No backup key is configured. Encrypted backups cannot be created or verified until the owner sets LEO_BACKUP_KEY."
  };
}

async function checkJsonFileIntegrity(id: string, label: string, filePath: string): Promise<DiagnosticCheck> {
  try {
    const content = await readFile(filePath, "utf8");
    JSON.parse(content);
    return {
      id,
      description: `${label} is valid JSON (${filePath})`,
      status: "ok",
      severity: "high"
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        id,
        description: `${label} is valid JSON (${filePath})`,
        status: "ok",
        severity: "high",
        details: "File does not exist yet; nothing to verify."
      };
    }
    return {
      id,
      description: `${label} is valid JSON (${filePath})`,
      status: "issue",
      severity: "high",
      details: `File exists but could not be parsed as JSON: ${
        error instanceof Error ? error.message : String(error)
      }. This needs manual review — do not overwrite without inspecting it first.`
    };
  }
}

async function checkAuditLogReadable(): Promise<DiagnosticCheck> {
  const auditFile = getAuditFilePath();
  try {
    const content = await readFile(auditFile, "utf8");
    const lines = content.split("\n").filter(Boolean);
    let malformed = 0;
    for (const line of lines) {
      try {
        JSON.parse(line);
      } catch {
        malformed++;
      }
    }
    return {
      id: "audit:log_readable",
      description: `Audit log is readable and well-formed (${auditFile})`,
      status: malformed === 0 ? "ok" : "issue",
      severity: "high",
      details: malformed === 0 ? undefined : `${malformed} of ${lines.length} audit lines could not be parsed.`,
      data: { totalLines: lines.length, malformedLines: malformed }
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        id: "audit:log_readable",
        description: `Audit log is readable and well-formed (${auditFile})`,
        status: "ok",
        severity: "high",
        details: "Audit log does not exist yet; nothing has been recorded."
      };
    }
    return {
      id: "audit:log_readable",
      description: `Audit log is readable and well-formed (${auditFile})`,
      status: "issue",
      severity: "high",
      details: error instanceof Error ? error.message : String(error)
    };
  }
}

async function checkRecentBackup(maxAgeDays = 30): Promise<DiagnosticCheck> {
  try {
    const backups = await listBackups();
    if (backups.length === 0) {
      return {
        id: "backup:recent",
        description: `A backup exists within the last ${maxAgeDays} days`,
        status: "issue",
        severity: "medium",
        details: "No backups found yet. Consider running backup.create."
      };
    }

    const latest = backups[0];
    const info = await stat(latest);
    const ageDays = (Date.now() - info.mtimeMs) / (24 * 60 * 60 * 1000);
    const ok = ageDays <= maxAgeDays;

    return {
      id: "backup:recent",
      description: `A backup exists within the last ${maxAgeDays} days`,
      status: ok ? "ok" : "issue",
      severity: "medium",
      details: ok ? undefined : `Latest backup is ${ageDays.toFixed(1)} days old (${latest}).`,
      data: { latestBackup: latest, ageDays: Number(ageDays.toFixed(2)) }
    };
  } catch (error) {
    return {
      id: "backup:recent",
      description: `A backup exists within the last ${maxAgeDays} days`,
      status: "issue",
      severity: "medium",
      details: error instanceof Error ? error.message : String(error)
    };
  }
}

async function findOrphanedTempFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await findOrphanedTempFiles(full)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".tmp")) {
      found.push(full);
    }
  }
  return found;
}

async function checkOrphanedTempFiles(): Promise<DiagnosticCheck> {
  const orphans = await findOrphanedTempFiles(WORKSPACE_ROOT);
  return {
    id: "workspace:orphaned_temp_files",
    description: `No orphaned .tmp files under the workspace (${WORKSPACE_ROOT})`,
    status: orphans.length === 0 ? "ok" : "issue",
    severity: "low",
    details: orphans.length === 0 ? undefined : `${orphans.length} orphaned .tmp file(s) found.`,
    data: { orphanedFiles: orphans }
  };
}

/**
 * Runs a read-only health check across L.E.O.'s own configured directories
 * and stores. Nothing here writes to disk — see repair-planner.ts and
 * repair-execution.ts for turning issues into (approved) fixes.
 */
export async function runHealthCheck(): Promise<DiagnosticReport> {
  const checks: DiagnosticCheck[] = [];

  checks.push(...(await checkRequiredDirectories()));
  checks.push(await checkBackupKeyConfigured());
  checks.push(await checkJsonFileIntegrity("memory:integrity", "Memory store", path.join(MEMORY_ROOT, "memories.json")));
  checks.push(await checkJsonFileIntegrity("knowledge:integrity", "Knowledge store", path.join(MEMORY_ROOT, "knowledge.json")));
  checks.push(await checkJsonFileIntegrity("approvals:integrity", "Approval store", path.join(APPROVAL_ROOT, "approvals.json")));
  checks.push(await checkAuditLogReadable());
  checks.push(await checkRecentBackup());
  checks.push(await checkOrphanedTempFiles());

  return { generatedAt: new Date().toISOString(), checks };
}

export function getMonitoredRoot(): string {
  return LEO_ROOT;
}
