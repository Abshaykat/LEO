import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
  console.log("=== L.E.O. LOCAL-KNOWLEDGE TEST ===");

  // Point this test at its own throwaway memory root BEFORE importing the
  // module, since leo-config.ts reads LEO_MEMORY_ROOT at import time.
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "leo-knowledge-test-"));
  process.env.LEO_MEMORY_ROOT = tempRoot;

  const {
    addDocument,
    searchByReliability,
    findOutdated,
    findConflicts,
    cosineSimilarity,
    buildTermVector
  } = await import("./local-knowledge.ts");

  // 1. cosineSimilarity basics
  {
    const a = buildTermVector("the cat sat on the mat");
    const b = buildTermVector("the cat sat on the mat");
    const c = buildTermVector("completely unrelated aardvark tuba yodeling");
    const identical = cosineSimilarity(a, b);
    const unrelated = cosineSimilarity(a, c);
    if (Math.abs(identical - 1) > 1e-9) throw new Error(`Expected identical text to have similarity ~1, got ${identical}`);
    if (unrelated > 0.01) throw new Error(`Expected unrelated text to have near-zero similarity, got ${unrelated}`);
    console.log("PASS: cosineSimilarity scores identical text near 1 and unrelated text near 0.");
  }

  // 2. addDocument validates required fields
  {
    let threw = false;
    try {
      await addDocument({ title: "", content: "x", source: "test" });
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("Expected addDocument to reject an empty title.");
    console.log("PASS: addDocument rejects missing required fields.");
  }

  // 3. searchByReliability ranks a highly-relevant, low-trust doc against a
  //    less-relevant, high-trust doc using the reliability blend.
  const lowTrustRelevant = await addDocument({
    title: "Node.js memory limits",
    content: "Node.js default heap size can be increased with the max old space size flag",
    source: "random-blog",
    reliability: 0.2
  });
  const highTrustLessRelevant = await addDocument({
    title: "JavaScript engines overview",
    content: "V8 is the JavaScript engine used by Node.js and Chrome",
    source: "official-docs",
    reliability: 0.95
  });
  {
    const results = await searchByReliability("Node.js heap memory size", { limit: 5 });
    if (results.length < 2) throw new Error("Expected at least two ranked results.");
    const ids = results.map(r => r.document.id);
    if (!ids.includes(lowTrustRelevant.id) || !ids.includes(highTrustLessRelevant.id)) {
      throw new Error("Expected both documents to appear in the ranked results.");
    }
    console.log("PASS: searchByReliability returns a reliability-and-similarity blended ranking.");
  }

  // 4. findOutdated: staleness by age
  const staleDoc = await addDocument({
    title: "Old fact",
    content: "This was true a long time ago",
    source: "test",
    reliability: 0.5
  });
  {
    // Directly rewrite updatedAt into the past for this one document.
    const { listDocuments } = await import("./local-knowledge.ts");
    const fs = await import("node:fs/promises");
    const filePath = path.join(tempRoot, "knowledge.json");
    const raw = JSON.parse(await fs.readFile(filePath, "utf8"));
    const target = raw.find((d: any) => d.id === staleDoc.id);
    target.updatedAt = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
    await fs.writeFile(filePath, JSON.stringify(raw, null, 2) + "\n", "utf8");

    const outdated = await findOutdated({ staleAfterDays: 180 });
    const flagged = outdated.find(o => o.document.id === staleDoc.id);
    if (!flagged || flagged.reason !== "stale") {
      throw new Error(`Expected the old document to be flagged stale: ${JSON.stringify(outdated)}`);
    }
    console.log("PASS: findOutdated flags documents older than the staleness threshold.");
  }

  // 5. findOutdated: supersession
  const originalDoc = await addDocument({
    title: "Deployment process v1",
    content: "Deploy by uploading a zip file manually",
    source: "wiki",
    reliability: 0.6
  });
  await addDocument({
    title: "Deployment process v2",
    content: "Deploy automatically via the CI pipeline",
    source: "wiki",
    reliability: 0.6,
    supersedes: originalDoc.id
  });
  {
    const outdated = await findOutdated({ staleAfterDays: 100000 });
    const flagged = outdated.find(o => o.document.id === originalDoc.id);
    if (!flagged || flagged.reason !== "superseded") {
      throw new Error("Expected the original document to be flagged as superseded.");
    }
    console.log("PASS: findOutdated flags a document that has been superseded by a newer one.");
  }

  // 6. addDocument rejects an unknown supersedes id
  {
    let threw = false;
    try {
      await addDocument({ title: "x", content: "y", source: "z", supersedes: "not-a-real-id" });
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("Expected addDocument to reject an unknown supersedes id.");
    console.log("PASS: addDocument validates that supersedes references an existing document.");
  }

  // 7. findConflicts: same topic, different unlinked sources -> flagged
  await addDocument({
    title: "Company vacation policy",
    content: "Employees get fifteen days of paid vacation per year",
    source: "hr-handbook-2023",
    reliability: 0.9
  });
  await addDocument({
    title: "Vacation days policy",
    content: "Employees get twenty days of paid vacation per year",
    source: "old-slack-message",
    reliability: 0.3
  });
  {
    const conflicts = await findConflicts({ topicalThreshold: 0.3 });
    const found = conflicts.some(
      c =>
        (c.a.source === "hr-handbook-2023" && c.b.source === "old-slack-message") ||
        (c.b.source === "hr-handbook-2023" && c.a.source === "old-slack-message")
    );
    if (!found) throw new Error(`Expected the two vacation-policy documents to be flagged as conflicting: ${JSON.stringify(conflicts)}`);
    console.log("PASS: findConflicts flags same-topic documents from different, unlinked sources.");
  }

  // 8. findConflicts: a supersession pair is NOT flagged as a conflict
  {
    const conflicts = await findConflicts({ topicalThreshold: 0.3 });
    const falsePositive = conflicts.some(
      c =>
        (c.a.id === originalDoc.id && c.b.title === "Deployment process v2") ||
        (c.b.id === originalDoc.id && c.a.title === "Deployment process v2")
    );
    if (falsePositive) throw new Error("SAFETY FAILURE: a supersession pair was incorrectly flagged as a conflict.");
    console.log("PASS: findConflicts does not flag a linked supersession pair as a conflict.");
  }

  await rm(tempRoot, { recursive: true, force: true });
  console.log("\n=== LOCAL-KNOWLEDGE TEST PASSED ===");
}

main().catch(error => {
  console.error("\n=== TEST FAILED ===");
  console.error(error);
  process.exit(1);
});
