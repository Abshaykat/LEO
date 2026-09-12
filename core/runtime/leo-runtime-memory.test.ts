import {
  TEST_OWNER_AUTH_TOKEN,
  createTestOwnerAuthenticator
} from "../identity/owner-auth.test-support.ts";
import type {
  LeoBrain,
  LeoBrainResponse
} from "../orchestrator/leo-brain.ts";

import type {
  ActionPlan
} from "../actions/action-plan.ts";

import {
  createMemory,
  deleteMemory
} from "../memory/memory-store.ts";

import {
  LeoRuntime
} from "./leo-runtime.ts";

async function main(): Promise<void> {
  console.log("=== L.E.O. RUNTIME MEMORY CONTEXT TEST ===");

  const ownerId =
    "runtime-memory-test-owner";

  const memoryContent =
    "Owner prefers Bangla-English mixed communication.";

  const createdMemory =
    await createMemory({
      ownerId,
      category:
        "preference",
      access:
        "standard",
      content:
        memoryContent,
      source:
        "owner",
      tags: [
        "language",
        "preference"
      ]
    });

  let capturedMemoryContext:
    string | undefined;

  const responsePlan:
    ActionPlan = {
      type:
        "response",
      response:
        "Memory context received."
    };

  const fakeBrain = {
    async respond(
      request: {
        userMessage: string;
        conversation?: unknown;
        memoryContext?: string;
      }
    ): Promise<LeoBrainResponse> {
      capturedMemoryContext =
        request.memoryContext;

      return {
        response:
          "Memory context received.",
        provider:
          "test",
        model:
          "test",
        actionPlan:
          responsePlan
      };
    }
  } as unknown as LeoBrain;

  const runtime =
    new LeoRuntime(
      fakeBrain,
      createTestOwnerAuthenticator(ownerId)
    );

  try {
    console.log("");
    console.log("[1] Authenticated owner memory request...");

    const authenticatedResult =
      await runtime.process({
        userMessage:
          "What language preference do I have?",
        ownerAuthToken:
          TEST_OWNER_AUTH_TOKEN,
        ownerId
      });

    if (
      authenticatedResult.type !==
      "response"
    ) {
      throw new Error(
        "Authenticated memory request did not return a response."
      );
    }

    if (
      !capturedMemoryContext ||
      !capturedMemoryContext.includes(
        memoryContent
      )
    ) {
      throw new Error(
        "Authenticated owner memory did not reach LeoBrain."
      );
    }

    console.log(
      "PASS: Authenticated owner memory reached LeoBrain."
    );

    console.log("");
    console.log("[2] Unauthenticated memory request...");

    capturedMemoryContext =
      undefined;

    const unauthenticatedResult =
      await runtime.process({
        userMessage:
          "What language preference do I have?",
        ownerId
      });

    if (
      unauthenticatedResult.type !==
      "response"
    ) {
      throw new Error(
        "Unauthenticated memory request did not return a response."
      );
    }

    if (
      capturedMemoryContext !==
      undefined
    ) {
      throw new Error(
        "Memory was exposed to an unauthenticated request."
      );
    }

    console.log(
      "PASS: Unauthenticated request received no persistent memory."
    );

    console.log("");
    console.log("[3] Missing ownerId with authentication flag...");

    capturedMemoryContext =
      undefined;

    const missingOwnerIdResult =
      await runtime.process({
        userMessage:
          "What language preference do I have?",
        ownerAuthToken:
          TEST_OWNER_AUTH_TOKEN
      });

    if (
      missingOwnerIdResult.type !==
      "response"
    ) {
      throw new Error(
        "Missing-ownerId request did not return a response."
      );
    }

    const authenticatedMemoryContext =
      capturedMemoryContext as string | undefined;

    if (
      typeof authenticatedMemoryContext !==
        "string" ||
      !authenticatedMemoryContext.includes(
        memoryContent
      )
    ) {
      throw new Error(
        "Authenticated owner memory was not retrieved from authenticated owner identity."
      );
    }

    console.log(
      "PASS: Authenticated request without request ownerId used authenticated owner identity for memory."
    );

    console.log("");
    console.log(
      "=== L.E.O. RUNTIME MEMORY CONTEXT TEST PASSED ==="
    );
  }
  finally {
    await deleteMemory(
      ownerId,
      createdMemory.id
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
