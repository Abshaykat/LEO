import {
  rm
} from "node:fs/promises";

import {
  createMemory,
  deleteMemory,
  getMemoryStorePath
} from "./memory-store.ts";

import {
  retrieveMemories
} from "./memory-retriever.ts";

function assert(
  condition: boolean,
  message: string
): void {
  if (!condition) {
    throw new Error(
      `LEO MEMORY TEST FAILURE: ${message}`
    );
  }
}

async function main(): Promise<void> {
  console.log(
    "=== L.E.O. MEMORY TEST ==="
  );

  const storePath =
    await getMemoryStorePath();

  await rm(
    storePath,
    {
      force: true
    }
  );

  const ownerId =
    "memory-test-owner";

  const standard =
    await createMemory({
      ownerId,
      category:
        "preference",
      content:
        "Owner prefers Bangla-English mixed communication.",
      source:
        "owner",
      tags: [
        "language",
        "banglish"
      ]
    });

  assert(
    standard.id.length > 0,
    "Memory ID was not generated."
  );

  const restricted =
    await createMemory({
      ownerId,
      category:
        "security",
      access:
        "restricted",
      content:
        "Restricted security context.",
      source:
        "owner",
      tags: [
        "security"
      ]
    });

  const standardResults =
    await retrieveMemories({
      ownerId,
      query:
        "Banglish language",
      ownerAuthenticated:
        false
    });

  assert(
    standardResults.length === 1,
    "Standard memory was not retrieved."
  );

  assert(
    standardResults[0].memory.id ===
      standard.id,
    "Incorrect standard memory retrieved."
  );

  const restrictedDenied =
    await retrieveMemories({
      ownerId,
      query:
        "security context",
      ownerAuthenticated:
        false
    });

  assert(
    restrictedDenied.length === 0,
    "Restricted memory was exposed without authentication."
  );

  const restrictedAllowed =
    await retrieveMemories({
      ownerId,
      query:
        "security context",
      ownerAuthenticated:
        true
    });

  assert(
    restrictedAllowed.length === 1,
    "Authenticated owner could not retrieve restricted memory."
  );

  const deleted =
    await deleteMemory(
      ownerId,
      standard.id
    );

  assert(
    deleted,
    "Memory deletion failed."
  );

  console.log(
    "PASS: Persistent memory can be created."
  );

  console.log(
    "PASS: Relevant memory can be retrieved."
  );

  console.log(
    "PASS: Restricted memory is denied without owner authentication."
  );

  console.log(
    "PASS: Restricted memory is available to authenticated owner."
  );

  console.log(
    "PASS: Memory deletion works."
  );

  console.log(
    "\n=== L.E.O. MEMORY TEST PASSED ==="
  );
}

main().catch(
  error => {
    console.error(error);
    process.exit(1);
  }
);
