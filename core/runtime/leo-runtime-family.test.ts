import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AIProvider, AIRequest, AIResponse } from "../ai/ai-provider.ts";
import { LeoBrain } from "../orchestrator/leo-brain.ts";
import { LeoRuntime } from "./leo-runtime.ts";
import { TEST_OWNER_AUTH_TOKEN, createTestOwnerAuthenticator } from "../identity/owner-auth.test-support.ts";
import { approveRequest } from "../approvals/approval-engine.ts";

class FixedTextProvider implements AIProvider {
  readonly name = "fixed-text-provider";
  constructor(private readonly content: string) {}
  async generate(_request: AIRequest): Promise<AIResponse> {
    return { content: this.content, provider: this.name, model: "test-model" };
  }
}

const KNOWLEDGE_SEARCH_PLAN = JSON.stringify({
  type: "action",
  action: { toolName: "knowledge.search", parameters: { query: "test" }, reason: "Family member searches knowledge." }
});

const WORKFLOW_PLAN = JSON.stringify({
  type: "workflow",
  workflow: {
    workflowId: "test-workflow-1",
    reason: "A multi-step request.",
    steps: [
      { id: "step-1", action: { toolName: "knowledge.search", parameters: { query: "a" }, reason: "step 1" } },
      { id: "step-2", action: { toolName: "knowledge.search", parameters: { query: "b" }, reason: "step 2" } }
    ]
  }
});

async function main() {
  console.log("=== L.E.O. RUNTIME FAMILY-ROUTING TEST ===");

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "leo-runtime-family-test-"));
  process.env.LEO_HOME = tempRoot;
  process.env.LEO_BACKUP_KEY = "runtime-family-test-key";

  const { createFamilyMember } = await import("../identity/family-store.ts");
  const authenticator = createTestOwnerAuthenticator();

  const capableMember = await createFamilyMember({
    name: "Runtime Test Adult",
    role: "adult",
    permissions: ["execute_commands", "knowledge_management", "read_files"]
  });
  const limitedMember = await createFamilyMember({
    name: "Runtime Test Child",
    role: "child",
    permissions: ["knowledge_management", "read_files"]
  });

  // 1. A family member's approval-required request (deterministic "run ..."
  //    -> pc.run_command) genuinely requires the OWNER's approval, routed
  //    end-to-end through LeoRuntime.process(), not just family-gate.ts directly.
  {
    const runtime = new LeoRuntime(new LeoBrain(new FixedTextProvider("irrelevant")), authenticator);
    const pending = await runtime.process({
      userMessage: 'run Write-Output "hello from a family member"',
      source: "text",
      ownerAuthToken: TEST_OWNER_AUTH_TOKEN,
      familyMemberId: capableMember.id
    });
    if (pending.type !== "approval_required") {
      throw new Error(`Expected approval_required, got: ${JSON.stringify(pending)}`);
    }
    await approveRequest(pending.approvalId);

    const executed = await runtime.process({
      userMessage: 'run Write-Output "hello from a family member"',
      source: "text",
      ownerAuthToken: TEST_OWNER_AUTH_TOKEN,
      familyMemberId: capableMember.id,
      approvalId: pending.approvalId
    });
    if (executed.type !== "execution") throw new Error(`Expected execution, got: ${JSON.stringify(executed)}`);
    console.log("PASS: a family member's approval-required request genuinely waits for real owner approval through LeoRuntime.process().");
  }

  // 2. A family member LACKING the required permission is denied by the
  //    family gate itself, through the full runtime path.
  {
    const runtime = new LeoRuntime(new LeoBrain(new FixedTextProvider("irrelevant")), authenticator);
    const denied = await runtime.process({
      userMessage: 'run Write-Output "should be denied"',
      source: "text",
      ownerAuthToken: TEST_OWNER_AUTH_TOKEN,
      familyMemberId: limitedMember.id
    });
    if (denied.type !== "denied") throw new Error(`Expected denied, got: ${JSON.stringify(denied)}`);
    console.log("PASS: a family member without the required permission is denied through LeoRuntime.process().");
  }

  // 3. A family member requesting an in-scope, NO-approval tool (via the AI
  //    planning path) executes directly — proving the runtime doesn't force
  //    every family request through approval, only the ones that need it.
  {
    const runtime = new LeoRuntime(new LeoBrain(new FixedTextProvider(KNOWLEDGE_SEARCH_PLAN)), authenticator);
    const result = await runtime.process({
      userMessage: "please check the knowledge base for our vacation policy",
      source: "text",
      ownerAuthToken: TEST_OWNER_AUTH_TOKEN,
      familyMemberId: capableMember.id
    });
    if (result.type !== "execution") throw new Error(`Expected direct execution, got: ${JSON.stringify(result)}`);
    console.log("PASS: a family member's in-scope, no-approval request executes directly through LeoRuntime.process().");
  }

  // 4. A family-member-attributed request that resolves to a multi-step
  //    workflow plan is explicitly denied, rather than silently running
  //    with owner-level workflow authority.
  {
    const runtime = new LeoRuntime(new LeoBrain(new FixedTextProvider(WORKFLOW_PLAN)), authenticator);
    const result = await runtime.process({
      userMessage: "please run these steps: check the knowledge base then check it again",
      source: "text",
      ownerAuthToken: TEST_OWNER_AUTH_TOKEN,
      familyMemberId: capableMember.id
    });
    if (result.type !== "denied") {
      throw new Error(`SAFETY FAILURE: expected a multi-step workflow to be denied for a family member, got: ${JSON.stringify(result)}`);
    }
    console.log("PASS: a multi-step workflow plan attributed to a family member is denied, not silently run as the owner.");
  }

  // 5. The SAME requests, WITHOUT familyMemberId (i.e. the owner directly),
  //    are completely unaffected — proving this is additive, not a regression.
  {
    const runtime = new LeoRuntime(new LeoBrain(new FixedTextProvider("irrelevant")), authenticator);
    const pending = await runtime.process({
      userMessage: 'run Write-Output "owner request"',
      source: "text",
      ownerAuthToken: TEST_OWNER_AUTH_TOKEN
      // no familyMemberId — this is the owner
    });
    if (pending.type !== "approval_required") {
      throw new Error(`Expected the owner's own request to behave exactly as before, got: ${JSON.stringify(pending)}`);
    }
    console.log("PASS: owner requests (no familyMemberId) are completely unaffected by the family-routing addition.");
  }

  await rm(tempRoot, { recursive: true, force: true });
  console.log("\n=== RUNTIME FAMILY-ROUTING TEST PASSED ===");
}

main().catch(error => {
  console.error("\n=== TEST FAILED ===");
  console.error(error);
  process.exit(1);
});
