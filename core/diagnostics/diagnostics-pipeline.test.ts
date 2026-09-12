import { mkdtemp, rm, writeFile, mkdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
  console.log("=== L.E.O. DIAGNOSTICS PIPELINE TEST ===");

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "leo-diagnostics-test-"));
  process.env.LEO_HOME = tempRoot;
  delete process.env.LEO_BACKUP_KEY; // deliberately unset for check #2 below

  const { runHealthCheck } = await import("./diagnostic-engine.ts");
  const { planRepairs } = await import("./repair-planner.ts");
  const { executeRepairs } = await import("./repair-execution.ts");
  const { WORKSPACE_ROOT, LEO_ROOT } = await import("../config/leo-config.ts");

  // 1. On a completely fresh LEO_HOME, required directories are missing
  //    and the backup key is unset -> both should be flagged.
  {
    const report = await runHealthCheck();
    const dirCheck = report.checks.find(c => c.id === "directory:memory_root");
    const keyCheck = report.checks.find(c => c.id === "config:backup_key");
    if (!dirCheck || dirCheck.status !== "issue") throw new Error("Expected the missing memory directory to be flagged.");
    if (!keyCheck || keyCheck.status !== "issue") throw new Error("Expected the missing backup key to be flagged.");
    console.log("PASS: runHealthCheck flags missing directories and an unconfigured backup key.");
  }

  // 2. planRepairs separates auto-fixable directory creation from the
  //    owner-action-required backup key issue.
  let plan;
  {
    const report = await runHealthCheck();
    plan = planRepairs(report);

    const dirFix = plan.autoFixable.find(a => a.checkId === "directory:memory_root");
    if (!dirFix || dirFix.action !== "create_directory") {
      throw new Error("Expected a create_directory auto-fix for the missing memory directory.");
    }

    const ownerItem = plan.ownerActionRequired.find(o => o.checkId === "config:backup_key");
    if (!ownerItem) throw new Error("Expected the backup key issue to require owner action, not be auto-fixed.");

    const keyAutoFixed = plan.autoFixable.some(a => a.checkId === "config:backup_key");
    if (keyAutoFixed) throw new Error("SAFETY FAILURE: the backup key issue must never be auto-fixed.");

    console.log("PASS: planRepairs auto-fixes missing directories and defers the backup key to the owner.");
  }

  // 3. executeRepairs actually creates the missing directories, confined to LEO_ROOT
  {
    const results = await executeRepairs(plan);
    const dirResult = results.find(r => r.checkId === "directory:memory_root");
    if (!dirResult || !dirResult.succeeded) throw new Error("Expected the memory directory repair to succeed.");

    const info = await stat(dirResult.targetPath);
    if (!info.isDirectory()) throw new Error("Expected the repaired path to now be a directory.");
    console.log("PASS: executeRepairs creates the missing directories on disk.");
  }

  // 4. A second health check after repair shows the directory issues resolved
  {
    const report = await runHealthCheck();
    const dirCheck = report.checks.find(c => c.id === "directory:memory_root");
    if (!dirCheck || dirCheck.status !== "ok") throw new Error("Expected the memory directory check to now pass.");
    console.log("PASS: a follow-up health check confirms the auto-fixed directories are now OK.");
  }

  // 5. Orphaned .tmp files under the workspace are detected and auto-fixable
  await mkdir(WORKSPACE_ROOT, { recursive: true });
  const orphanPath = path.join(WORKSPACE_ROOT, "leftover.tmp");
  await writeFile(orphanPath, "leftover data", "utf8");
  {
    const report = await runHealthCheck();
    const tempCheck = report.checks.find(c => c.id === "workspace:orphaned_temp_files");
    if (!tempCheck || tempCheck.status !== "issue") throw new Error("Expected the orphaned .tmp file to be detected.");

    const tempPlan = planRepairs(report);
    const tempFix = tempPlan.autoFixable.find(a => a.action === "delete_temp_file" && a.targetPath === orphanPath);
    if (!tempFix) throw new Error("Expected a delete_temp_file auto-fix for the orphaned file.");

    const results = await executeRepairs(tempPlan);
    const deleteResult = results.find(r => r.targetPath === orphanPath);
    if (!deleteResult || !deleteResult.succeeded) throw new Error("Expected the orphaned temp file to be deleted.");

    let stillExists = true;
    try {
      await stat(orphanPath);
    } catch {
      stillExists = false;
    }
    if (stillExists) throw new Error("SAFETY FAILURE: the orphaned temp file was not actually deleted.");
    console.log("PASS: orphaned .tmp files are detected and safely deleted by executeRepairs.");
  }

  // 6. repair-execution refuses to touch anything outside LEO_ROOT, even if
  //    a (malformed or tampered) plan tries to point it there.
  {
    const outsidePath = path.join(os.tmpdir(), "leo-outside-root-should-not-be-touched.tmp");
    await writeFile(outsidePath, "should never be deleted", "utf8");

    const maliciousPlan = {
      generatedAt: new Date().toISOString(),
      sourceReportGeneratedAt: new Date().toISOString(),
      autoFixable: [
        {
          checkId: "workspace:orphaned_temp_files",
          action: "delete_temp_file" as const,
          targetPath: outsidePath,
          description: "attempt to delete a file outside LEO_ROOT"
        }
      ],
      ownerActionRequired: []
    };

    const results = await executeRepairs(maliciousPlan);
    const result = results[0];
    if (result.succeeded) throw new Error("SAFETY FAILURE: repair-execution touched a path outside LEO_ROOT.");

    const stillThere = await stat(outsidePath).then(() => true).catch(() => false);
    if (!stillThere) throw new Error("SAFETY FAILURE: the out-of-root file was deleted despite the LEO_ROOT guard.");

    await rm(outsidePath, { force: true });
    console.log(`PASS: executeRepairs refuses to touch paths outside LEO_ROOT (${LEO_ROOT}), even from a crafted plan.`);
  }

  await rm(tempRoot, { recursive: true, force: true });
  console.log("\n=== DIAGNOSTICS PIPELINE TEST PASSED ===");
}

main().catch(error => {
  console.error("\n=== TEST FAILED ===");
  console.error(error);
  process.exit(1);
});
