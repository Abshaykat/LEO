import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AIProvider, AIRequest, AIResponse } from "../ai/ai-provider.ts";
import { LeoBrain } from "../orchestrator/leo-brain.ts";
import { LeoRuntime } from "./leo-runtime.ts";
import { TEST_OWNER_AUTH_TOKEN, createTestOwnerAuthenticator } from "../identity/owner-auth.test-support.ts";

class FixedTextProvider implements AIProvider {
  readonly name = "fixed-text-provider";
  constructor(private readonly content: string) {}
  async generate(_request: AIRequest): Promise<AIResponse> {
    return { content: this.content, provider: this.name, model: "test-model" };
  }
}

const CREATE_MEMORY_PLAN = JSON.stringify({
  type: "action",
  action: {
    toolName: "memory.create",
    parameters: { content: "Owner's favorite color is teal.", category: "preference", tags: ["color"] },
    reason: "The owner asked L.E.O. to remember this."
  }
});

async function main() {
  console.log("=== L.E.O. MEMORY TOOL END-TO-END TEST ===");

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "leo-memory-tool-e2e-test-"));
  process.env.LEO_HOME = tempRoot;
  process.env.LEO_BACKUP_KEY = "memory-tool-e2e-test-key";

  const authenticator = createTestOwnerAuthenticator(); // ownerId = "test-owner"

  // 1. Ask L.E.O. (through the real conversational path) to remember something.
  //    No approval needed — memory.create is a low-friction, everyday tool.
  let createdMemoryId = "";
  {
    const runtime = new LeoRuntime(new LeoBrain(new FixedTextProvider(CREATE_MEMORY_PLAN)), authenticator);
    const result = await runtime.process({
      userMessage: "please create a memory note: my favorite color is teal",
      source: "text",
      ownerAuthToken: TEST_OWNER_AUTH_TOKEN
    });
    if (result.type !== "execution") throw new Error(`Expected direct execution, got: ${JSON.stringify(result)}`);
    createdMemoryId = (result.result as { id: string }).id;
    if (!createdMemoryId) throw new Error("Expected the created memory to have an id.");
    console.log("PASS: memory.create executes directly (no approval friction) through the real conversational path.");
  }

  // 2. THE CRITICAL CHECK: the memory is actually recallable via
  //    retrieveMemories using the SAME ownerId the runtime auto-injected —
  //    proving this isn't just "saved somewhere," it's saved under the
  //    exact identity that future conversational context-building reads
  //    from (runtime/leo-runtime.ts calls retrieveMemories with
  //    ownerAuth.ownerId — the same value memory.create was given).
  {
    const { retrieveMemories } = await import("../memory/memory-retriever.ts");
    const results = await retrieveMemories({
      ownerId: "test-owner", // matches createTestOwnerAuthenticator()'s default ownerId
      query: "favorite color",
      ownerAuthenticated: true
    });
    const found = results.some(r => r.memory.id === createdMemoryId);
    if (!found) {
      throw new Error("SAFETY/CORRECTNESS FAILURE: the memory created via the tool is not recallable by the real memory-context path.");
    }
    console.log("PASS: the memory created via the tool is genuinely recallable by the same context-building path future turns use.");
  }

  // 3. Update it through the real dispatcher too, and confirm versioning kicks in.
  {
    const { execute } = await import("../execution/execution-engine.ts");
    const result = await execute({
      toolName: "memory.update",
      parameters: { id: createdMemoryId, ownerId: "test-owner", content: "Owner's favorite color is actually green." },
      reason: "Correcting a previously saved memory.",
      context: { source: "text", ownerAuthenticated: true }
    });
    if (result.decision !== "allow") throw new Error(`Expected allow, got: ${JSON.stringify(result)}`);
    const updated = result.result as { version: number; history: unknown[] };
    if (updated.version !== 2 || updated.history.length !== 1) {
      throw new Error(`Expected version 2 with 1 history entry, got: ${JSON.stringify(updated)}`);
    }
    console.log("PASS: memory.update works through the real dispatcher and correctly versions the change.");
  }

  // 4. Deleting a memory DOES require owner approval (unlike create/update).
  {
    const { execute } = await import("../execution/execution-engine.ts");
    const { approveRequest } = await import("../approvals/approval-engine.ts");

    const pending = await execute({
      toolName: "memory.delete",
      parameters: { id: createdMemoryId, ownerId: "test-owner" },
      reason: "Owner asked to forget this.",
      context: { source: "text", ownerAuthenticated: true }
    });
    if (pending.decision !== "require_approval" || !pending.approvalId) {
      throw new Error(`Expected require_approval for memory.delete, got: ${JSON.stringify(pending)}`);
    }
    await approveRequest(pending.approvalId);

    const result = await execute({
      toolName: "memory.delete",
      parameters: { id: createdMemoryId, ownerId: "test-owner" },
      reason: "Owner asked to forget this.",
      context: { source: "text", ownerAuthenticated: true },
      approvalId: pending.approvalId
    });
    if (result.decision !== "allow" || !(result.result as { deleted: boolean }).deleted) {
      throw new Error(`Expected the deletion to succeed after approval, got: ${JSON.stringify(result)}`);
    }
    console.log("PASS: memory.delete requires real owner approval, unlike create/update/list/search.");
  }

  await rm(tempRoot, { recursive: true, force: true });
  console.log("\n=== MEMORY TOOL END-TO-END TEST PASSED ===");
}

main().catch(error => {
  console.error("\n=== TEST FAILED ===");
  console.error(error);
  process.exit(1);
});
