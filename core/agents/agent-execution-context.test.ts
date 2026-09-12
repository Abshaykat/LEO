import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
  console.log("=== L.E.O. AGENT-EXECUTION-CONTEXT TEST ===");

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "leo-agent-context-test-"));
  process.env.LEO_HOME = tempRoot;

  const { createAgent } = await import("./agent-store.ts");
  const { transitionAgentLifecycle } = await import("./agent-store.ts");
  const { authorizeAgentForTool, agentCoversTool } = await import("./agent-execution-context.ts");

  const agent = await createAgent({
    name: "test-knowledge-agent",
    purpose: "Manage the local knowledge store.",
    instructions: "Add and search knowledge documents as directed.",
    permissions: ["knowledge_management", "read_files", "write_files"]
  });

  // 1. A draft (not yet active) agent is never authorized, even with the right permissions.
  {
    const result = await authorizeAgentForTool(agent.id, "knowledge.search");
    if (result.authorized) throw new Error("Expected a draft agent to be unauthorized.");
    if (!result.reason?.includes("not active")) throw new Error(`Expected a lifecycle-status reason, got: ${result.reason}`);
    console.log("PASS: a draft agent is denied regardless of its declared permissions.");
  }

  const activeAgent = await transitionAgentLifecycle(agent.id, "active");

  // 2. Once active, a covered tool is authorized.
  {
    const result = await authorizeAgentForTool(agent.id, "knowledge.search");
    if (!result.authorized) throw new Error(`Expected authorization, got denial: ${result.reason}`);
    console.log("PASS: an active agent with matching permissions is authorized.");
  }

  // 3. A tool requiring permissions the agent never declared is denied, listing what's missing.
  {
    const result = await authorizeAgentForTool(agent.id, "pc.install_software");
    if (result.authorized) throw new Error("SAFETY FAILURE: agent was authorized for a tool outside its declared permissions.");
    if (!result.missingPermissions || result.missingPermissions.length === 0) {
      throw new Error("Expected missingPermissions to list the gap.");
    }
    console.log(`PASS: a tool outside the agent's declared permissions is denied (missing: ${result.missingPermissions.join(", ")}).`);
  }

  // 4. Unknown agent id.
  {
    const result = await authorizeAgentForTool("00000000-0000-0000-0000-000000000000", "knowledge.search");
    if (result.authorized || !result.reason?.includes("Unknown agent")) {
      throw new Error("Expected an unknown-agent denial.");
    }
    console.log("PASS: an unknown agent id is denied with a clear reason.");
  }

  // 5. Unknown tool name.
  {
    const result = await authorizeAgentForTool(agent.id, "not.a.real.tool");
    if (result.authorized || !result.reason?.includes("Unknown tool")) {
      throw new Error("Expected an unknown-tool denial.");
    }
    console.log("PASS: an unknown tool name is denied with a clear reason.");
  }

  // 6. agentCoversTool (synchronous, pre-loaded agent) matches authorizeAgentForTool.
  {
    if (!agentCoversTool(activeAgent, "knowledge.search")) throw new Error("Expected agentCoversTool to agree with authorizeAgentForTool (covered case).");
    if (agentCoversTool(activeAgent, "pc.install_software")) throw new Error("Expected agentCoversTool to agree with authorizeAgentForTool (uncovered case).");
    console.log("PASS: agentCoversTool agrees with authorizeAgentForTool for both covered and uncovered tools.");
  }

  // 7. A tool that affects external systems requires the agent's security policy to allow it,
  //    even if the base permissions match — but factory/store-created agents can never have
  //    that flag set, so this should always deny for a normally-created agent.
  {
    // No shipped tool both requires only knowledge_management/read_files/write_files AND
    // sets affectsExternalSystems, so we assert the invariant directly instead.
    if (activeAgent.securityPolicy.allowExternalSystemActions) {
      throw new Error("SAFETY FAILURE: a normally created agent must never have allowExternalSystemActions set.");
    }
    console.log("PASS: normally created agents never start with external-system authority (verified invariant).");
  }

  await rm(tempRoot, { recursive: true, force: true });
  console.log("\n=== AGENT-EXECUTION-CONTEXT TEST PASSED ===");
}

main().catch(error => {
  console.error("\n=== TEST FAILED ===");
  console.error(error);
  process.exit(1);
});
