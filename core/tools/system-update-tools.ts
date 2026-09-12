import { execFile } from "node:child_process";
import {
  createEncryptedBackup,
  verifyEncryptedBackup,
  type BackupManifest
} from "../backup/backup-manager.ts";

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type CommandRunner = (
  executable: string,
  args: string[],
  options?: { timeoutMs?: number }
) => Promise<CommandResult>;

export const defaultCommandRunner: CommandRunner = (executable, args, options) => {
  if (process.platform !== "win32") {
    return Promise.reject(
      new Error(
        `system-update-tools: "${executable}" is only available on Windows (winget). This host is "${process.platform}".`
      )
    );
  }

  return new Promise((resolve, reject) => {
    execFile(
      executable,
      args,
      {
        windowsHide: true,
        timeout: options?.timeoutMs ?? 5 * 60_000,
        maxBuffer: 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (error && typeof (error as NodeJS.ErrnoException).code === "string") {
          reject(error);
          return;
        }
        const exitCode = error && typeof error.code === "number" ? error.code : 0;
        resolve({ stdout: stdout ?? "", stderr: stderr ?? "", exitCode });
      }
    );
  });
};

function objectParams(parameters: unknown): Record<string, unknown> {
  if (typeof parameters !== "object" || parameters === null || Array.isArray(parameters)) {
    throw new Error("Tool parameters must be an object.");
  }
  return parameters as Record<string, unknown>;
}

export interface AvailableUpdate {
  name: string;
  id: string;
  currentVersion: string;
  availableVersion: string;
}

/**
 * Parses `winget upgrade` table output into structured rows. winget's table
 * columns are whitespace-aligned rather than delimited, so this splits on
 * runs of 2+ spaces, which holds for the standard English winget output.
 */
export function parseWingetUpgradeList(raw: string): AvailableUpdate[] {
  const lines = raw.split(/\r?\n/);
  const headerIndex = lines.findIndex(line => /^Name\s+Id\s+Version\s+Available/i.test(line.trim()));
  if (headerIndex === -1) return [];

  const updates: AvailableUpdate[] = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || /^-+$/.test(line.trim())) continue;
    if (/upgrades available/i.test(line)) continue;

    const columns = line.trim().split(/\s{2,}/);
    if (columns.length < 4) continue;
    const [name, id, currentVersion, availableVersion] = columns;
    updates.push({ name, id, currentVersion, availableVersion });
  }
  return updates;
}

export async function checkUpdates(
  _parameters: unknown,
  runner: CommandRunner = defaultCommandRunner
): Promise<{ updates: AvailableUpdate[]; raw: string }> {
  const result = await runner("winget", ["upgrade", "--include-unknown"], {});
  return { updates: parseWingetUpgradeList(result.stdout), raw: result.stdout };
}

export interface ApplyUpdateResult {
  packageId: string;
  backupPath: string;
  backupVerified: boolean;
  updateApplied: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface BackupDependencies {
  create: () => Promise<{ path: string; manifest: BackupManifest }>;
  verify: (path: string) => Promise<BackupManifest>;
}

const defaultBackupDependencies: BackupDependencies = {
  create: createEncryptedBackup,
  verify: verifyEncryptedBackup
};

const PACKAGE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/**
 * Safe Update workflow: create a fresh encrypted backup, verify it can be
 * decrypted and its integrity hash matches, and only THEN apply the
 * winget update. If backup creation or verification fails, the update is
 * never attempted.
 *
 * Known limitation (documented, not hidden): this does not automatically
 * roll back a failed update from the backup. If `winget upgrade` itself
 * fails or leaves the package in a bad state, the owner must restore
 * manually from the verified backup at `backupPath`. Automatic rollback is
 * a reasonable next step but is out of scope for this pass.
 */
export async function applyUpdate(
  parameters: unknown,
  runner: CommandRunner = defaultCommandRunner,
  backup: BackupDependencies = defaultBackupDependencies
): Promise<ApplyUpdateResult> {
  const p = objectParams(parameters);
  const packageId = typeof p.id === "string" ? p.id.trim() : "";
  if (!packageId || !PACKAGE_ID_PATTERN.test(packageId)) {
    throw new Error("system.apply_update requires a valid package id.");
  }

  const { path: backupPath } = await backup.create();

  let backupVerified = false;
  try {
    await backup.verify(backupPath);
    backupVerified = true;
  } catch (error) {
    throw new Error(
      `Safe Update aborted: the pre-update backup failed verification (${
        error instanceof Error ? error.message : String(error)
      }). No update was applied.`
    );
  }

  const result = await runner(
    "winget",
    [
      "upgrade",
      "--id",
      packageId,
      "--exact",
      "--silent",
      "--accept-package-agreements",
      "--accept-source-agreements"
    ],
    { timeoutMs: 10 * 60_000 }
  );

  return {
    packageId,
    backupPath,
    backupVerified,
    updateApplied: result.exitCode === 0,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode
  };
}

import { registerToolExecutor } from "../execution/tool-executor-registry.ts";

registerToolExecutor("system.check_updates", parameters => checkUpdates(parameters));
registerToolExecutor("system.apply_update", parameters => applyUpdate(parameters));
