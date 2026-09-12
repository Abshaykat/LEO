import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
  console.log("=== L.E.O. SUPERVISOR TEST ===");

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "leo-supervisor-test-"));
  process.env.LEO_HOME = tempRoot;
  process.env.LEO_BACKUP_KEY = "supervisor-test-key";

  const { createAgent, transitionAgentLifecycle } = await import("./agent-store.ts");
  const { assignTask, assignToBestAgent, describeRoster } = await import("./supervisor.ts");
  const { approveRequest } = await import("../approvals/approval-engine.ts");

  const context = { source: "system" as const, ownerAuthenticated: true };

  // Agent A: a knowledge-capable agent, active.
  const draftA = await createAgent({
    name: "leo-knowledge-agent",
    purpose: "Manage the local knowledge store.",
    instructions: "Search and add knowledge documents as directed by the owner.",
    permissions: ["knowledge_management", "read_files", "write_files"]
  });
  const agentA = await transitionAgentLifecycle(draftA.id, "active");

  // Agent B: active, but with NO permissions granted — should authorize nothing.
  const draftB = await createAgent({
    name: "leo-empty-agent",
    purpose: "Placeholder agent with no granted scope.",
    instructions: "Intentionally has no permissions for this test."
  });
  const agentB = await transitionAgentLifecycle(draftB.id, "active");

  // 1. assignTask to agent A for a no-approval-needed tool succeeds directly.
  {
    const result = await assignTask({
      agentId: agentA.id,
      toolName: "knowledge.search",
      parameters: { query: "anything" },
      reason: "Supervisor test: direct search.",
      context
    });
    if (result.decision !== "allow") throw new Error(`Expected allow, got: ${JSON.stringify(result)}`);
    console.log("PASS: assignTask delegates a covered, no-approval tool straight through to execution.");
  }

  // 2. assignTask to agent B (no permissions) is denied by the Supervisor's
  //    own guard, WITHOUT ever reaching the owner permission/approval gate.
  {
    const result = await assignTask({
      agentId: agentB.id,
      toolName: "knowledge.search",
      parameters: { query: "anything" },
      reason: "Supervisor test: should be denied.",
      context
    });
    if (result.decision !== "deny") throw new Error(`Expected deny for an unauthorized agent, got: ${JSON.stringify(result)}`);
    console.log("PASS: assignTask denies a task for an agent lacking the required permissions.");
  }

  // 3. assignTask requiring owner approval still goes through the two-phase
  //    approval flow — the Supervisor does not auto-approve on the agent's behalf.
  let addedDocId = "";
  {
    const pending = await assignTask({
      agentId: agentA.id,
      toolName: "knowledge.add_document",
      parameters: {
        title: "Supervisor test doc",
        content: "Proves agent-delegated approval-required tools still require owner approval.",
        source: "supervisor-test"
      },
      reason: "Supervisor test: approval-required delegation.",
      context
    });
    if (pending.decision !== "require_approval" || !pending.approvalId) {
      throw new Error(`Expected require_approval, got: ${JSON.stringify(pending)}`);
    }

    await approveRequest(pending.approvalId);

    const result = await assignTask({
      agentId: agentA.id,
      toolName: "knowledge.add_document",
      parameters: {
        title: "Supervisor test doc",
        content: "Proves agent-delegated approval-required tools still require owner approval.",
        source: "supervisor-test"
      },
      reason: "Supervisor test: approval-required delegation.",
      context,
      approvalId: pending.approvalId
    });
    if (result.decision !== "allow") throw new Error(`Expected allow after approval, got: ${JSON.stringify(result)}`);
    addedDocId = (result.result as any).id;
    console.log("PASS: an approval-required tool delegated via the Supervisor still requires real owner approval.");
  }

  // 4. assignToBestAgent picks the one agent (A) that actually covers the tool,
  //    ignoring the uncovered agent (B), out of a roster containing both.
  {
    const { agent, result } = await assignToBestAgent({
      toolName: "knowledge.search",
      parameters: { query: "supervisor test doc" },
      reason: "Supervisor test: best-agent selection.",
      context
    });
    if (agent.id !== agentA.id) throw new Error(`Expected agent A to be selected, got: ${agent.name}`);
    if (result.decision !== "allow") throw new Error(`Expected allow, got: ${JSON.stringify(result)}`);
    const found = (result.result as any[]).some(r => r.document.id === addedDocId);
    if (!found) throw new Error("Expected the search to find the document added in step 3.");
    console.log("PASS: assignToBestAgent selects the one agent in the roster actually authorized for the tool.");
  }

  // 5. assignToBestAgent throws a clear error when NO agent in the roster covers the tool.
  {
    let threw = false;
    try {
      await assignToBestAgent({
        toolName: "system.apply_update",
        parameters: { id: "Git.Git" },
        reason: "Supervisor test: nobody should cover this.",
        context
      });
    } catch (error) {
      threw = true;
      if (!(error instanceof Error) || !error.message.includes("No active agent is authorized")) {
        throw new Error(`Expected a clear no-agent-authorized error, got: ${error}`);
      }
    }
    if (!threw) throw new Error("Expected assignToBestAgent to throw when no agent covers the tool.");
    console.log("PASS: assignToBestAgent refuses to silently pick an unauthorized agent when none qualify.");
  }

  // 6. describeRoster reports each active agent's authorized subset correctly.
  {
    const roster = await describeRoster(["knowledge.search", "knowledge.add_document", "pc.install_software"]);
    const entryA = roster.find(r => r.agent.id === agentA.id);
    const entryB = roster.find(r => r.agent.id === agentB.id);
    if (!entryA || !entryA.authorizedTools.includes("knowledge.search") || !entryA.authorizedTools.includes("knowledge.add_document")) {
      throw new Error(`Expected agent A's roster entry to include both knowledge tools: ${JSON.stringify(entryA)}`);
    }
    if (entryA.authorizedTools.includes("pc.install_software")) {
      throw new Error("SAFETY FAILURE: agent A was reported as authorized for a tool it has no permissions for.");
    }
    if (!entryB || entryB.authorizedTools.length !== 0) {
      throw new Error(`Expected agent B's roster entry to be empty: ${JSON.stringify(entryB)}`);
    }
    console.log("PASS: describeRoster accurately reports each agent's real authorized-tool subset.");
  }

  // 7. Agent-delegated actions are traceable in the audit log via agentId.
  {
    const { getAuditFilePath } = await import("../audit/audit-log.ts");
    const fs = await import("node:fs/promises");
    const lines = (await fs.readFile(getAuditFilePath(), "utf8")).split("\n").filter(Boolean);
    const events = lines.map(line => JSON.parse(line));
    const taggedForA = events.filter(e => e.agentId === agentA.id);
    if (taggedForA.length === 0) throw new Error("Expected at least one audit event tagged with agent A's id.");
    const hasExecutionStarted = taggedForA.some(e => e.type === "execution_started");
    if (!hasExecutionStarted) throw new Error("Expected an execution_started audit event tagged with agent A's id.");
    console.log(`PASS: agent-delegated actions leave a traceable, agentId-tagged audit trail (${taggedForA.length} events for agent A).`);
  }

  await rm(tempRoot, { recursive: true, force: true });
  console.log("\n=== SUPERVISOR TEST PASSED ===");
}

main().catch(error => {
  console.error("\n=== TEST FAILED ===");
  console.error(error);
  process.exit(1);
});
