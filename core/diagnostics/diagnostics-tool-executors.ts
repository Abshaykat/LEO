import { registerToolExecutor } from "../execution/tool-executor-registry.ts";
import { runHealthCheck } from "./diagnostic-engine.ts";
import { planRepairs, type RepairPlan } from "./repair-planner.ts";
import { executeRepairs } from "./repair-execution.ts";

function objectParams(parameters: unknown): Record<string, unknown> {
  if (typeof parameters !== "object" || parameters === null || Array.isArray(parameters)) {
    throw new Error("Tool parameters must be an object.");
  }
  return parameters as Record<string, unknown>;
}

function isRepairPlanShape(value: unknown): value is RepairPlan {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as RepairPlan).autoFixable) &&
    Array.isArray((value as RepairPlan).ownerActionRequired)
  );
}

registerToolExecutor("diagnostics.run_health_check", () => runHealthCheck());

registerToolExecutor("diagnostics.plan_repairs", async () => planRepairs(await runHealthCheck()));

registerToolExecutor("diagnostics.execute_repairs", async parameters => {
  const p = objectParams(parameters);
  const plan = isRepairPlanShape(p.plan) ? (p.plan as RepairPlan) : planRepairs(await runHealthCheck());
  const results = await executeRepairs(plan);
  return { plan, results };
});
