import assert from "node:assert/strict";
import { createEncryptedBackup, verifyEncryptedBackup } from "./backup-manager.ts";
import { BACKUP_ROOT } from "../config/leo-config.ts";
import { rm, mkdir } from "node:fs/promises";
import path from "node:path";

async function main(): Promise<void> {
  if (!process.env.LEO_BACKUP_KEY) throw new Error("LEO_BACKUP_KEY required for backup test.");
  await mkdir(BACKUP_ROOT, { recursive: true });
  const result = await createEncryptedBackup();
  assert.ok(result.path.endsWith(".backup"));
  const manifest = await verifyEncryptedBackup(result.path);
  assert.equal(manifest.payloadSha256, result.manifest.payloadSha256);
  await rm(result.path, { force: true });
  console.log("Encrypted backup integrity test passed.");
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
