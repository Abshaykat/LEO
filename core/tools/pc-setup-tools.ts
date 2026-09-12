import { execFile } from "node:child_process";

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * A CommandRunner executes a single external command and always resolves
 * (never rejects on a non-zero exit code) so callers can inspect exitCode
 * themselves. This makes winget's "not found" (exit 1) a normal result
 * rather than a thrown error, and lets tests inject a fake runner instead
 * of touching a real Windows package manager.
 */
export type CommandRunner = (
  executable: string,
  args: string[],
  options?: { timeoutMs?: number }
) => Promise<CommandResult>;

export const defaultCommandRunner: CommandRunner = (executable, args, options) => {
  if (process.platform !== "win32") {
    return Promise.reject(
      new Error(
        `pc-setup-tools: "${executable}" is only available on Windows (winget). This host is "${process.platform}".`
      )
    );
  }

  return new Promise((resolve, reject) => {
    execFile(
      executable,
      args,
      {
        windowsHide: true,
        timeout: options?.timeoutMs ?? 60_000,
        maxBuffer: 512 * 1024
      },
      (error, stdout, stderr) => {
        if (error && typeof (error as NodeJS.ErrnoException).code === "string") {
          // The executable itself could not be found/spawned.
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

const PACKAGE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function validatePackageId(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  const trimmed = value.trim();
  if (!PACKAGE_ID_PATTERN.test(trimmed)) {
    throw new Error(
      `${field} contains characters that are not allowed in a winget package id/name.`
    );
  }
  return trimmed;
}

export interface CheckSoftwareResult {
  query: string;
  installed: boolean;
  raw: string;
}

/**
 * Checks whether a package is installed by asking winget to list it.
 * winget exits non-zero when nothing matches — that is a normal
 * "not installed" result here, not a failure.
 */
export async function checkSoftware(
  parameters: unknown,
  runner: CommandRunner = defaultCommandRunner
): Promise<CheckSoftwareResult> {
  const p = objectParams(parameters);
  const query = validatePackageId(p.name ?? p.id, "name");

  const result = await runner("winget", ["list", "--id", query, "--exact"], {});
  if (result.exitCode === 0 && result.stdout.toLowerCase().includes(query.toLowerCase())) {
    return { query, installed: true, raw: result.stdout };
  }

  // Fall back to a name search in case the caller passed a display name
  // rather than an exact winget package id.
  const byName = await runner("winget", ["list", "--name", query], {});
  const installed = byName.exitCode === 0 && byName.stdout.toLowerCase().includes(query.toLowerCase());
  return { query, installed, raw: installed ? byName.stdout : result.stdout };
}

export interface InstallSoftwareResult {
  packageId: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  succeeded: boolean;
}

/**
 * Installs a package via winget, non-interactively. Callers are expected
 * to route this through the L.E.O. execution gate — this function performs
 * no permission/approval checks of its own.
 */
export async function installSoftware(
  parameters: unknown,
  runner: CommandRunner = defaultCommandRunner
): Promise<InstallSoftwareResult> {
  const p = objectParams(parameters);
  const packageId = validatePackageId(p.id ?? p.name, "id");

  const result = await runner(
    "winget",
    [
      "install",
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
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    succeeded: result.exitCode === 0
  };
}

/**
 * Environment variable names that L.E.O. will never allow itself to set,
 * because changing them could break the owner's shell, break Windows
 * itself, or silently redirect L.E.O.'s own execution paths. This list is
 * intentionally case-insensitive since Windows environment variable names
 * are case-insensitive.
 */
export const PROTECTED_ENVIRONMENT_VARIABLES: readonly string[] = [
  "path",
  "pathext",
  "systemroot",
  "windir",
  "comspec",
  "psmodulepath",
  "temp",
  "tmp",
  "userprofile",
  "homedrive",
  "homepath",
  "programfiles",
  "programfiles(x86)",
  "programdata",
  "allusersprofile",
  "processor_architecture",
  "number_of_processors",
  "os",
  "systemdrive",
  "leo_home",
  "leo_workspace",
  "leo_backup_key",
  "leo_backup_root"
];

function isProtectedName(name: string): boolean {
  return PROTECTED_ENVIRONMENT_VARIABLES.includes(name.trim().toLowerCase());
}

export interface SetEnvironmentVariableResult {
  name: string;
  scope: "user" | "machine";
  stdout: string;
  stderr: string;
  succeeded: boolean;
}

const ENV_VAR_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

/**
 * Sets a user- or machine-scoped environment variable via setx, after
 * rejecting any name on the protected list. Machine scope additionally
 * requires elevation on the owner's PC (setx /M) — that is left to the OS
 * to enforce; this function only enforces the name blocklist.
 */
export async function setEnvironmentVariable(
  parameters: unknown,
  runner: CommandRunner = defaultCommandRunner
): Promise<SetEnvironmentVariableResult> {
  const p = objectParams(parameters);
  const name = typeof p.name === "string" ? p.name.trim() : "";
  const value = typeof p.value === "string" ? p.value : "";
  const scope: "user" | "machine" = p.scope === "machine" ? "machine" : "user";

  if (!name) throw new Error("pc.set_environment_variable requires a non-empty name.");
  if (!ENV_VAR_NAME_PATTERN.test(name)) {
    throw new Error("Environment variable name contains unsupported characters.");
  }
  if (isProtectedName(name)) {
    throw new Error(
      `Refusing to set protected environment variable "${name}". This name is blocked to avoid breaking the OS shell or L.E.O. itself.`
    );
  }
  if (Buffer.byteLength(value, "utf8") > 32 * 1024) {
    throw new Error("Environment variable value exceeds the maximum allowed size.");
  }

  const args = scope === "machine" ? [name, value, "/M"] : [name, value];
  const result = await runner("setx", args, {});

  return {
    name,
    scope,
    stdout: result.stdout,
    stderr: result.stderr,
    succeeded: result.exitCode === 0
  };
}

import { registerToolExecutor } from "../execution/tool-executor-registry.ts";

registerToolExecutor("pc.check_software", parameters => checkSoftware(parameters));
registerToolExecutor("pc.install_software", parameters => installSoftware(parameters));
registerToolExecutor("pc.set_environment_variable", parameters => setEnvironmentVariable(parameters));
