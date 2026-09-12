import type { DiagnosticCheck, DiagnosticReport } from "./diagnostic-engine.ts";

export type RepairActionType = "create_directory" | "delete_temp_file";

export interface AutoFixAction {
  checkId: string;
  action: RepairActionType;
  targetPath: string;
  description: string;
}

export interface OwnerActionItem {
  checkId: string;
  severity: DiagnosticCheck["severity"];
  recommendation: string;
}

export interface RepairPlan {
  generatedAt: string;
  sourceReportGeneratedAt: string;
  autoFixable: AutoFixAction[];
  ownerActionRequired: OwnerActionItem[];
}

/**
 * Only a fixed, narrow set of check ids may ever be auto-fixed, and only
 * with actions that recreate LEO's own scaffolding or remove its own
 * temp files — never anything that touches owner data, credentials, or
 * anything outside LEO_ROOT. Everything else becomes an owner-action item.
 */
function planCheck(check: DiagnosticCheck): { autoFix?: AutoFixAction; ownerAction?: OwnerActionItem } {
  if (check.status === "ok") return {};

  if (check.id.startsWith("directory:") && typeof check.data?.targetPath === "string") {
    return {
      autoFix: {
        checkId: check.id,
        action: "create_directory",
        targetPath: check.data.targetPath,
        description: `Recreate the missing directory: ${check.data.targetPath}`
      }
    };
  }

  if (check.id === "workspace:orphaned_temp_files" && Array.isArray(check.data?.orphanedFiles)) {
    // Represented as one owner-action-free auto-fix per orphaned file so
    // execution can report on each individually.
    const files = check.data.orphanedFiles as string[];
    if (files.length === 0) return {};
    // Only the first is returned here; planRepairs() expands the full list.
    return {
      autoFix: {
        checkId: check.id,
        action: "delete_temp_file",
        targetPath: files[0],
        description: `Delete orphaned temp file: ${files[0]}`
      }
    };
  }

  return {
    ownerAction: {
      checkId: check.id,
      severity: check.severity,
      recommendation: check.details ?? `Review and resolve: ${check.description}`
    }
  };
}

export function planRepairs(report: DiagnosticReport): RepairPlan {
  const autoFixable: AutoFixAction[] = [];
  const ownerActionRequired: OwnerActionItem[] = [];

  for (const check of report.checks) {
    if (check.status === "ok") continue;

    if (check.id === "workspace:orphaned_temp_files" && Array.isArray(check.data?.orphanedFiles)) {
      const files = check.data.orphanedFiles as string[];
      for (const file of files) {
        autoFixable.push({
          checkId: check.id,
          action: "delete_temp_file",
          targetPath: file,
          description: `Delete orphaned temp file: ${file}`
        });
      }
      continue;
    }

    const { autoFix, ownerAction } = planCheck(check);
    if (autoFix) autoFixable.push(autoFix);
    if (ownerAction) ownerActionRequired.push(ownerAction);
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceReportGeneratedAt: report.generatedAt,
    autoFixable,
    ownerActionRequired
  };
}
