import { mkdir, unlink } from "node:fs/promises";
import { LEO_ROOT, assertInside } from "../config/leo-config.ts";
import type { AutoFixAction, RepairPlan } from "./repair-planner.ts";

export interface RepairExecutionResult {
  checkId: string;
  action: string;
  targetPath: string;
  succeeded: boolean;
  error?: string;
}

async function executeAction(action: AutoFixAction): Promise<RepairExecutionResult> {
  try {
    // Every action is re-validated against LEO_ROOT here, independently of
    // whatever produced the plan. This function will never touch a path
    // outside LEO_ROOT, no matter what the plan says.
    const target = assertInside(LEO_ROOT, action.targetPath);

    switch (action.action) {
      case "create_directory":
        await mkdir(target, { recursive: true });
        break;
      case "delete_temp_file":
        await unlink(target);
        break;
      default:
        throw new Error(`Unsupported repair action: ${action.action}`);
    }

    return {
      checkId: action.checkId,
      action: action.action,
      targetPath: target,
      succeeded: true
    };
  } catch (error) {
    return {
      checkId: action.checkId,
      action: action.action,
      targetPath: action.targetPath,
      succeeded: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Executes every auto-fixable action in the plan, strictly confined to
 * LEO_ROOT. Owner-action items are never touched here — they are surfaced
 * to the owner, not executed automatically, by design.
 */
export async function executeRepairs(plan: RepairPlan): Promise<RepairExecutionResult[]> {
  const results: RepairExecutionResult[] = [];
  for (const action of plan.autoFixable) {
    results.push(await executeAction(action));
  }
  return results;
}
