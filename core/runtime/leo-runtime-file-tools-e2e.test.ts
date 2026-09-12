import {
  TEST_OWNER_AUTH_TOKEN,
  createTestOwnerAuthenticator
} from "../identity/owner-auth.test-support.ts";

import type {
  AIProvider,
  AIRequest,
  AIResponse
} from "../ai/ai-provider.ts";

import {
  LeoBrain
} from "../orchestrator/leo-brain.ts";

import {
  LeoRuntime
} from "./leo-runtime.ts";

import {
  approveRequest
} from "../approvals/approval-engine.ts";

import {
  readFile,
  writeFile,
  unlink
} from "node:fs/promises";

import path from "node:path";
import { WORKSPACE_ROOT } from "../config/leo-config.ts";

function assert(
  condition: boolean,
  message: string
): void {
  if (!condition) {
    throw new Error(
      `AI FILE-TOOL E2E FAILURE: ${message}`
    );
  }
}

const testFile =
  path.join(WORKSPACE_ROOT, "ai-file-tool-e2e-test.txt");

const testContent =
  "L.E.O. AI file tool E2E verification.";

class AIFileToolProvider
  implements AIProvider {

  readonly name =
    "ai-file-tool-e2e-provider";

  lastRequest?: AIRequest;

  async generate(
    request: AIRequest
  ): Promise<AIResponse> {

    this.lastRequest =
      request;

    const userMessage =
      request.messages.at(-1)?.content ?? "";

    const isWriteRequest =
      userMessage.includes(
        "write the AI file-tool verification content"
      );

    const isReadRequest =
      userMessage.includes(
        "read the AI file-tool verification file"
      );

    if (isWriteRequest) {
      return {
        content:
          JSON.stringify({
            type:
              "action",
            action: {
              toolName:
                "pc.write_file",
              parameters: {
                path:
                  testFile,
                content:
                  testContent
              },
              reason:
                "Write the controlled L.E.O. AI file-tool verification content."
            }
          }),
        provider:
          this.name,
        model:
          "ai-file-tool-e2e-model"
      };
    }

    if (isReadRequest) {
      return {
        content:
          JSON.stringify({
            type:
              "action",
            action: {
              toolName:
                "pc.read_file",
              parameters: {
                path:
                  testFile
              },
              reason:
                "Read the controlled L.E.O. AI file-tool verification file."
            }
          }),
        provider:
          this.name,
        model:
          "ai-file-tool-e2e-model"
      };
    }

    return {
      content:
        JSON.stringify({
          type:
            "response",
          response:
            "Unsupported test request."
        }),
      provider:
        this.name,
      model:
        "ai-file-tool-e2e-model"
    };
  }
}

async function main(): Promise<void> {

  console.log(
    "=== L.E.O. AI FILE-TOOL RUNTIME E2E TEST ==="
  );

  const provider =
    new AIFileToolProvider();

  const brain =
    new LeoBrain(
      provider
    );

  const runtime =
    new LeoRuntime(
      brain,
      createTestOwnerAuthenticator()
    );

  try {

    await writeFile(
      testFile,
      testContent,
      "utf8"
    );

    console.log(
      "\n[1] AI read-file request..."
    );

    const readFirst =
      await runtime.process({
        userMessage:
          "Please read the AI file-tool verification file.",
        source:
          "text",
        ownerAuthToken:
          TEST_OWNER_AUTH_TOKEN
      });

    console.log(readFirst);

    assert(
      provider.lastRequest !== undefined,
      "Read request never reached the AI provider."
    );

    assert(
      readFirst.type ===
        "approval_required",
      "AI read-file action did not enter owner approval."
    );

    if (
      readFirst.type !==
      "approval_required"
    ) {
      throw new Error(
        "Unexpected read-file result type."
      );
    }

    assert(
      readFirst.toolName ===
        "pc.read_file",
      "AI selected an unexpected read-file tool."
    );

    assert(
      readFirst.approvalId.length > 0,
      "Read-file approval ID was not generated."
    );

    assert(
      readFirst.traceId.length > 0,
      "Read-file trace ID was not generated."
    );

    console.log(
      "PASS: AI read-file action entered owner approval."
    );

    console.log(
      "\n[2] Approving exact AI read-file action..."
    );

    const readApproval =
      await approveRequest(
        readFirst.approvalId
      );

    assert(
      readApproval.status ===
        "approved",
      "Read-file approval was not recorded."
    );

    const readSecond =
      await runtime.process({
        userMessage:
          "Please read the AI file-tool verification file.",
        source:
          "text",
        ownerAuthToken:
          TEST_OWNER_AUTH_TOKEN,
        approvalId:
          readFirst.approvalId,
        traceId:
          readFirst.traceId
      });

    console.log(readSecond);

    assert(
      readSecond.type ===
        "execution",
      "Approved AI read-file action did not execute."
    );

    if (
      readSecond.type !==
      "execution"
    ) {
      throw new Error(
        "Unexpected read-file execution result type."
      );
    }

    assert(
      readSecond.toolName ===
        "pc.read_file",
      "Wrong tool reached read-file execution."
    );

    const readResult =
      readSecond.result as {
        path?: string;
        content?: string;
      };

    assert(
      readResult.path ===
        testFile,
      "Read-file execution returned the wrong path."
    );

    assert(
      readResult.content ===
        testContent,
      "Read-file execution returned unexpected content."
    );

    console.log(
      "PASS: Exact approved AI read-file action executed and returned correct content."
    );

    console.log(
      "\n[3] AI write-file request..."
    );

    const writeFirst =
      await runtime.process({
        userMessage:
          "Please write the AI file-tool verification content.",
        source:
          "text",
        ownerAuthToken:
          TEST_OWNER_AUTH_TOKEN
      });

    console.log(writeFirst);

    assert(
      writeFirst.type ===
        "approval_required",
      "AI write-file action did not enter owner approval."
    );

    if (
      writeFirst.type !==
      "approval_required"
    ) {
      throw new Error(
        "Unexpected write-file result type."
      );
    }

    assert(
      writeFirst.toolName ===
        "pc.write_file",
      "AI selected an unexpected write-file tool."
    );

    assert(
      writeFirst.approvalId.length > 0,
      "Write-file approval ID was not generated."
    );

    assert(
      writeFirst.traceId.length > 0,
      "Write-file trace ID was not generated."
    );

    console.log(
      "PASS: AI write-file action entered owner approval."
    );

    console.log(
      "\n[4] Approving exact AI write-file action..."
    );

    const writeApproval =
      await approveRequest(
        writeFirst.approvalId
      );

    assert(
      writeApproval.status ===
        "approved",
      "Write-file approval was not recorded."
    );

    const writeSecond =
      await runtime.process({
        userMessage:
          "Please write the AI file-tool verification content.",
        source:
          "text",
        ownerAuthToken:
          TEST_OWNER_AUTH_TOKEN,
        approvalId:
          writeFirst.approvalId,
        traceId:
          writeFirst.traceId
      });

    console.log(writeSecond);

    assert(
      writeSecond.type ===
        "execution",
      "Approved AI write-file action did not execute."
    );

    if (
      writeSecond.type !==
      "execution"
    ) {
      throw new Error(
        "Unexpected write-file execution result type."
      );
    }

    assert(
      writeSecond.toolName ===
        "pc.write_file",
      "Wrong tool reached write-file execution."
    );

    const writeResult =
      writeSecond.result as {
        path?: string;
        bytesWritten?: number;
      };

    assert(
      writeResult.path ===
        testFile,
      "Write-file execution returned the wrong path."
    );

    assert(
      typeof writeResult.bytesWritten ===
        "number" &&
        writeResult.bytesWritten > 0,
      "Write-file execution did not report written bytes."
    );

    const actualContent =
      await readFile(
        testFile,
        "utf8"
      );

    assert(
      actualContent ===
        testContent,
      "Independent file verification failed."
    );

    console.log(
      "PASS: Exact approved AI write-file action executed and content was independently verified."
    );

    console.log(
      "\n=== L.E.O. AI FILE-TOOL RUNTIME E2E TEST PASSED ==="
    );

  }
  finally {

    try {
      await unlink(
        testFile
      );
    }
    catch {
      // Test cleanup is best-effort.
    }
  }
}

main().catch(
  error => {

    console.error(
      "\n=== L.E.O. AI FILE-TOOL RUNTIME E2E TEST FAILED ==="
    );

    console.error(error);

    process.exit(1);
  }
);