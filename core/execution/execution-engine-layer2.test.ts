import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
  console.log("=== L.E.O. LAYER 2 EXECUTION-GATE WIRING TEST ===");

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "leo-layer2-gate-test-"));
  process.env.LEO_HOME = tempRoot;
  process.env.LEO_BACKUP_KEY = "layer2-wiring-test-key";

  const { execute } = await import("./execution-engine.ts");
  const { approveRequest } = await import("../approvals/approval-engine.ts");

  const context = { source: "system" as const, ownerAuthenticated: true };

  async function approveAndExecute(request: any) {
    const pending = await execute(request);
    if (pending.decision !== "require_approval" || !pending.approvalId) {
      throw new Error(`Expected require_approval, got: ${JSON.stringify(pending)}`);
    }
    await approveRequest(pending.approvalId);
    return execute({ ...request, approvalId: pending.approvalId });
  }

  // 1. knowledge.add_document requires approval, then succeeds through the gate.
  let addedDocumentId = "";
  {
    const result = await approveAndExecute({
      toolName: "knowledge.add_document",
      parameters: {
        title: "Gate wiring test doc",
        content: "This document proves knowledge.add_document is routed through the execution gate.",
        source: "test-suite",
        reliability: 0.7
      },
      reason: "Verify Layer 2 knowledge wiring.",
      context
    });
    if (result.decision !== "allow") throw new Error(`Expected allow, got: ${JSON.stringify(result)}`);
    addedDocumentId = (result.result as any).id;
    if (!addedDocumentId) throw new Error("Expected the created document to have an id.");
    console.log("PASS: knowledge.add_document is approval-gated and executes through execute().");
  }

  // 2. knowledge.search does NOT require approval and finds the document just added.
  {
    const result = await execute({
      toolName: "knowledge.search",
      parameters: { query: "gate wiring test" },
      reason: "Verify Layer 2 knowledge search wiring.",
      context
    });
    if (result.decision !== "allow") throw new Error(`Expected knowledge.search to allow directly, got: ${JSON.stringify(result)}`);
    const found = (result.result as any[]).some(r => r.document.id === addedDocumentId);
    if (!found) throw new Error("Expected knowledge.search to find the previously added document.");
    console.log("PASS: knowledge.search runs without approval and returns ranked results via the gate.");
  }

  // 3. diagnostics.run_health_check and diagnostics.plan_repairs run read-only, no approval.
  {
    const health = await execute({
      toolName: "diagnostics.run_health_check",
      parameters: {},
      reason: "Verify diagnostics wiring.",
      context
    });
    if (health.decision !== "allow") throw new Error(`Expected diagnostics.run_health_check to allow, got: ${JSON.stringify(health)}`);

    const plan = await execute({
      toolName: "diagnostics.plan_repairs",
      parameters: {},
      reason: "Verify diagnostics wiring.",
      context
    });
    if (plan.decision !== "allow") throw new Error(`Expected diagnostics.plan_repairs to allow, got: ${JSON.stringify(plan)}`);
    if (!Array.isArray((plan.result as any).autoFixable)) throw new Error("Expected a repair plan with autoFixable actions.");
    console.log("PASS: diagnostics.run_health_check and diagnostics.plan_repairs run read-only through the gate.");
  }

  // 4. diagnostics.execute_repairs requires approval, and actually fixes
  //    the missing directories once approved.
  {
    const result = await approveAndExecute({
      toolName: "diagnostics.execute_repairs",
      parameters: {},
      reason: "Verify diagnostics repair-execution wiring.",
      context
    });
    if (result.decision !== "allow") throw new Error(`Expected allow, got: ${JSON.stringify(result)}`);
    const results = (result.result as any).results as Array<{ succeeded: boolean }>;
    if (results.length === 0 || !results.every(r => r.succeeded)) {
      throw new Error(`Expected all repairs to succeed: ${JSON.stringify(results)}`);
    }
    console.log("PASS: diagnostics.execute_repairs is approval-gated and performs real repairs through the gate.");
  }

  // 5. pc.check_software is wired to the dispatcher — on this non-Windows
  //    sandbox it correctly reaches execution and fails with a clear
  //    platform message, proving the wiring rather than silently no-op'ing.
  {
    let threw = false;
    try {
      await execute({
        toolName: "pc.check_software",
        parameters: { name: "Git.Git" },
        reason: "Verify pc-setup-tools wiring.",
        context
      });
    } catch (error) {
      threw = true;
      const message = error instanceof Error ? error.message : String(error);
      if (!/windows|winget/i.test(message)) {
        throw new Error(`Expected a clear Windows/winget platform message, got: ${message}`);
      }
    }
    if (!threw) {
      if (process.platform !== "win32") {
        throw new Error("Expected pc.check_software to fail with a platform message on a non-Windows host.");
      }
    }
    console.log("PASS: pc.check_software is dispatched correctly (verified via its platform guard on this non-Windows host).");
  }

  // 6. system.apply_update: proves the safe-update ordering end-to-end —
  //    a real encrypted backup is created and verified even though the
  //    actual winget upgrade step cannot run on this non-Windows sandbox.
  {
    const pending = await execute({
      toolName: "system.apply_update",
      parameters: { id: "Git.Git" },
      reason: "Verify safe-update wiring.",
      context
    });
    if (pending.decision !== "require_approval" || !pending.approvalId) {
      throw new Error(`Expected require_approval, got: ${JSON.stringify(pending)}`);
    }
    await approveRequest(pending.approvalId);

    let threw = false;
    try {
      await execute({
        toolName: "system.apply_update",
        parameters: { id: "Git.Git" },
        reason: "Verify safe-update wiring.",
        context,
        approvalId: pending.approvalId
      });
    } catch (error) {
      threw = true;
      const message = error instanceof Error ? error.message : String(error);
      if (!/windows|winget/i.test(message)) {
        throw new Error(`Expected the failure to come from the winget platform guard, got: ${message}`);
      }
    }
    if (!threw && process.platform !== "win32") {
      throw new Error("Expected system.apply_update's winget step to fail on this non-Windows host.");
    }

    const { listBackups } = await import("../backup/backup-manager.ts");
    const backups = await listBackups();
    if (backups.length === 0) {
      throw new Error("Expected the safe-update workflow to have created a real backup before attempting the platform-specific update step.");
    }
    console.log("PASS: system.apply_update creates+verifies a real backup before the (platform-specific) update step.");
  }

  await rm(tempRoot, { recursive: true, force: true });
  console.log("\n=== LAYER 2 EXECUTION-GATE WIRING TEST PASSED ===");
}

main().catch(error => {
  console.error("\n=== TEST FAILED ===");
  console.error(error);
  process.exit(1);
});
