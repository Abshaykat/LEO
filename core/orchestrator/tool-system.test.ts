import { listTools } from "../permissions/tool-registry.ts";

import {
  authorizeTool
} from "./tool-gate.ts";

import {
  approveRequest
} from "../approvals/approval-engine.ts";

async function main(): Promise<void> {
  console.log("=== L.E.O. TOOL REGISTRY ===");

  for (const tool of listTools()) {
    console.log(
      `${tool.name} | risk=${tool.risk} | approval=${tool.requiresApproval}`
    );
  }

  console.log("\n=== TEST 1: Browser search ===");

  const search = await authorizeTool({
    toolName: "browser.search",
    parameters: {
      query: "current market information"
    },
    reason: "Research current market information."
  });

  console.log(search);

  console.log("\n=== TEST 2: Run PowerShell command ===");

  const command = await authorizeTool({
    toolName: "pc.run_command",
    parameters: {
      command: "npm test",
      workingDirectory: "D:\\LEO"
    },
    reason: "Run a development command."
  });

  console.log(command);

  console.log("\n=== TEST 3: Create AI agent ===");

  const agent = await authorizeTool({
    toolName: "agent.create",
    parameters: {
      name: "SEO Employee",
      purpose: "SEO research and optimization"
    },
    reason: "Create a dedicated SEO employee."
  });

  console.log(agent);

  console.log("\n=== PENDING APPROVALS ===");

  if (agent.approvalId) {
    const approved = await approveRequest(agent.approvalId);

    console.log("\n=== OWNER APPROVED AGENT CREATION ===");
    console.log(approved);
  }
}

main().catch((error: unknown) => {
  console.error("\n=== TEST FAILED ===");
  console.error(error);
  process.exitCode = 1;
});
