import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
  console.log("=== L.E.O. MEMORY VERSIONING TEST ===");

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "leo-memory-versioning-test-"));
  process.env.LEO_HOME = tempRoot;

  const { createMemory, updateMemory, getMemoryHistory, getMemory } = await import("./memory-store.ts");

  const ownerId = "versioning-test-owner";

  // 1. A new memory starts at version 1 with empty history.
  const memory = await createMemory({
    ownerId,
    category: "preference",
    content: "Owner prefers dark mode.",
    source: "owner"
  });
  if (memory.version !== 1 || memory.history.length !== 0) {
    throw new Error(`Expected a fresh memory at version 1 with no history, got: ${JSON.stringify(memory)}`);
  }
  console.log("PASS: a new memory starts at version 1 with empty history.");

  // 2. Updating the content bumps the version and preserves the old content in history.
  const updated = await updateMemory(ownerId, memory.id, { content: "Owner prefers light mode now." });
  if (updated.version !== 2) throw new Error(`Expected version 2, got ${updated.version}`);
  if (updated.history.length !== 1 || updated.history[0].content !== "Owner prefers dark mode.") {
    throw new Error(`Expected the original content preserved in history, got: ${JSON.stringify(updated.history)}`);
  }
  console.log("PASS: updating content bumps the version and preserves the prior content in history.");

  // 3. A second content update appends another history entry (nothing is ever overwritten/lost).
  const updatedAgain = await updateMemory(ownerId, memory.id, { content: "Owner prefers dark mode, actually." });
  if (updatedAgain.version !== 3 || updatedAgain.history.length !== 2) {
    throw new Error(`Expected version 3 with 2 history entries, got: ${JSON.stringify(updatedAgain)}`);
  }
  if (updatedAgain.history[1].content !== "Owner prefers light mode now.") {
    throw new Error("Expected history entries to be in chronological order.");
  }
  console.log("PASS: multiple updates accumulate a full, ordered version history.");

  // 4. Updating ONLY tags (not content) does NOT bump the version or add history —
  //    versioning tracks meaningful content changes, not metadata tweaks.
  const tagOnlyUpdate = await updateMemory(ownerId, memory.id, { tags: ["ui", "preference"] });
  if (tagOnlyUpdate.version !== 3 || tagOnlyUpdate.history.length !== 2) {
    throw new Error("Expected a tags-only update to leave version/history unchanged.");
  }
  if (!tagOnlyUpdate.tags.includes("ui")) throw new Error("Expected the new tags to actually be applied.");
  console.log("PASS: a metadata-only update (tags) does not create a spurious version entry.");

  // 5. getMemoryHistory returns exactly the accumulated trail.
  const history = await getMemoryHistory(ownerId, memory.id);
  if (history.length !== 2) throw new Error(`Expected 2 history entries, got ${history.length}`);
  console.log("PASS: getMemoryHistory returns the full accumulated trail.");

  // 6. Updating with identical content (no real change) also does not bump version.
  const noChange = await updateMemory(ownerId, memory.id, { content: tagOnlyUpdate.content });
  if (noChange.version !== 3) throw new Error("Expected re-saving identical content not to bump the version.");
  console.log("PASS: re-saving identical content does not create a redundant version.");

  // 7. Updating a nonexistent memory throws clearly.
  {
    let threw = false;
    try {
      await updateMemory(ownerId, "00000000-0000-0000-0000-000000000000", { content: "x" });
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("Expected updating an unknown memory id to throw.");
  }
  console.log("PASS: updating a nonexistent memory id throws clearly.");

  // 8. Rejects emptying out a memory's content via update.
  {
    let threw = false;
    try {
      await updateMemory(ownerId, memory.id, { content: "   " });
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("Expected an empty-content update to be rejected.");
  }
  console.log("PASS: updateMemory rejects being emptied out to blank content.");

  const finalState = await getMemory(ownerId, memory.id);
  if (finalState?.version !== 3) throw new Error("Expected the final stored state to reflect all real changes.");

  await rm(tempRoot, { recursive: true, force: true });
  console.log("\n=== MEMORY VERSIONING TEST PASSED ===");
}

main().catch(error => {
  console.error("\n=== TEST FAILED ===");
  console.error(error);
  process.exit(1);
});
