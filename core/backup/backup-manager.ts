import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  stat,
  unlink,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import {
  BACKUP_ROOT,
  LEO_ROOT
} from "../config/leo-config.ts";

const FORMAT_VERSION = 1;

interface BackupEntry {
  relativePath: string;
  size: number;
  sha256: string;
}

export interface BackupManifest {
  formatVersion: number;
  createdAt: string;
  sourceRoot: string;
  entries: BackupEntry[];
  payloadSha256: string;
}

function getBackupKey(): Buffer {
  const raw = process.env.LEO_BACKUP_KEY;
  if (!raw) {
    throw new Error(
      "LEO_BACKUP_KEY must be configured for encrypted backups."
    );
  }
  return createHash("sha256").update(raw, "utf8").digest();
}

async function collectFiles(root: string, current: string, entries: BackupEntry[]): Promise<void> {
  const items = await readdir(current, { withFileTypes: true });
  for (const item of items) {
    if (item.name === "node_modules" || item.name === ".git" || item.name === "backups") continue;
    const full = path.join(current, item.name);
    if (item.isDirectory()) {
      await collectFiles(root, full, entries);
      continue;
    }
    if (!item.isFile()) continue;
    const data = await readFile(full);
    entries.push({
      relativePath: path.relative(root, full),
      size: data.length,
      sha256: createHash("sha256").update(data).digest("hex")
    });
  }
}

export async function createEncryptedBackup(): Promise<{ path: string; manifest: BackupManifest }> {
  const key = getBackupKey();
  await mkdir(BACKUP_ROOT, { recursive: true });

  const entries: BackupEntry[] = [];
  await collectFiles(LEO_ROOT, LEO_ROOT, entries);

  const manifest: BackupManifest = {
    formatVersion: FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    sourceRoot: LEO_ROOT,
    entries,
    payloadSha256: ""
  };

  const payloadParts: Buffer[] = [];
  for (const entry of entries) {
    const data = await readFile(path.join(LEO_ROOT, entry.relativePath));
    const name = Buffer.from(entry.relativePath, "utf8");
    const header = Buffer.allocUnsafe(8);
    header.writeUInt32BE(name.length, 0);
    header.writeUInt32BE(data.length, 4);
    payloadParts.push(header, name, data);
  }
  const payload = Buffer.concat(payloadParts);
  manifest.payloadSha256 = createHash("sha256").update(payload).digest("hex");

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(payload),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(BACKUP_ROOT, `LEO-${stamp}.backup`);
  const envelope = {
    formatVersion: FORMAT_VERSION,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    manifest,
    payload: ciphertext.toString("base64")
  };

  await writeFile(target, JSON.stringify(envelope), "utf8");
  return { path: target, manifest };
}

export async function verifyEncryptedBackup(backupPath: string): Promise<BackupManifest> {
  const key = getBackupKey();
  const raw = JSON.parse(await readFile(backupPath, "utf8")) as {
    formatVersion: number;
    iv: string;
    tag: string;
    manifest: BackupManifest;
    payload: string;
  };

  if (raw.formatVersion !== FORMAT_VERSION) {
    throw new Error("Unsupported backup format.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(raw.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(raw.tag, "base64"));
  const payload = Buffer.concat([
    decipher.update(Buffer.from(raw.payload, "base64")),
    decipher.final()
  ]);

  const digest = createHash("sha256").update(payload).digest("hex");
  if (digest !== raw.manifest.payloadSha256) {
    throw new Error("Backup payload integrity verification failed.");
  }

  return raw.manifest;
}

export async function listBackups(): Promise<string[]> {
  await mkdir(BACKUP_ROOT, { recursive: true });
  const entries = await readdir(BACKUP_ROOT, { withFileTypes: true });
  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith(".backup"))
    .map(entry => path.join(BACKUP_ROOT, entry.name))
    .sort()
    .reverse();
}

import { registerToolExecutor } from "../execution/tool-executor-registry.ts";

function objectParams(parameters: unknown): Record<string, unknown> {
  if (typeof parameters !== "object" || parameters === null || Array.isArray(parameters)) {
    throw new Error("Tool parameters must be an object.");
  }
  return parameters as Record<string, unknown>;
}

registerToolExecutor("backup.create", () => createEncryptedBackup());
registerToolExecutor("backup.verify", parameters =>
  verifyEncryptedBackup(String(objectParams(parameters).path ?? ""))
);
