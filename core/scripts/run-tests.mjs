#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function findTestFiles(dir, results = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "workspace" || entry === "backups") continue;
    const full = path.join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      findTestFiles(full, results);
    } else if (entry.endsWith(".test.ts")) {
      results.push(full);
    }
  }
  return results;
}

function resolveTsxBinary() {
  const local = path.join(rootDir, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
  try {
    statSync(local);
    return local;
  } catch {
    return "tsx"; // fall back to a globally installed tsx
  }
}

function startMockServer(scriptName, readyText) {
  const child = spawn(process.execPath, [path.join(rootDir, scriptName)], {
    cwd: rootDir,
    stdio: ["ignore", "pipe", "pipe"]
  });
  return new Promise((resolve, reject) => {
    let output = "";
    const onData = chunk => {
      output += chunk.toString();
      if (output.includes(readyText)) {
        child.stdout.off("data", onData);
        resolve(child);
      }
    };
    child.stdout.on("data", onData);
    child.on("error", reject);
    setTimeout(() => resolve(child), 3000); // don't hang forever if the readyText pattern ever changes
  });
}

async function main() {
  console.log("=== L.E.O. test runner ===\n");

  const tsx = resolveTsxBinary();
  const testFiles = findTestFiles(rootDir).sort();
  console.log(`Found ${testFiles.length} test file(s).\n`);

  console.log("Starting mock Ollama + mock voice servers...");
  const mockOllama = await startMockServer("mock-ollama-server.mjs", "listening");
  const mockVoice = await startMockServer("mock-voice-server.mjs", "listening");
  console.log("Mock servers started.\n");

  const env = { ...process.env };
  if (!env.LEO_HOME) env.LEO_HOME = rootDir;
  if (!env.LEO_BACKUP_KEY) env.LEO_BACKUP_KEY = "npm-test-runner-key";

  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const file of testFiles) {
    const relative = path.relative(rootDir, file);
    const result = spawnSync(tsx, [file], { cwd: rootDir, env, encoding: "utf8" });
    if (result.status === 0) {
      passed++;
      console.log(`PASS  ${relative}`);
    } else {
      failed++;
      failures.push(relative);
      console.log(`FAIL  ${relative}`);
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
      console.log(
        output
          .split("\n")
          .slice(-15)
          .map(line => `      ${line}`)
          .join("\n")
      );
    }
  }

  mockOllama.kill();
  mockVoice.kill();

  console.log(`\n=== ${passed}/${testFiles.length} passed ===`);
  if (failures.length > 0) {
    console.log("\nFailed:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
