import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import {
  COMMAND_TIMEOUT_MS,
  COMMAND_WORKING_DIRECTORY,
  LEO_ROOT,
  MAX_COMMAND_OUTPUT_BYTES,
  MAX_FILE_READ_BYTES,
  MAX_FILE_WRITE_BYTES,
  WORKSPACE_ROOT,
  assertInside,
  resolveLeoPath
} from "../config/leo-config.ts";
import { registerToolExecutor } from "../execution/tool-executor-registry.ts";

function objectParams(parameters: unknown): Record<string, unknown> {
  if (typeof parameters !== "object" || parameters === null || Array.isArray(parameters)) {
    throw new Error("Tool parameters must be an object.");
  }
  return parameters as Record<string, unknown>;
}

function normalizeExternalPath(value: string): string {
  const normalized = value.trim();
  const windowsRootPattern = /^[A-Za-z]:\\LEO(?:\\|$)/i;
  if (process.platform !== "win32" && windowsRootPattern.test(normalized)) {
    const relative = normalized.replace(/^[A-Za-z]:\\LEO\\?/i, "");
    return path.join(LEO_ROOT, relative.replace(/\\/g, path.sep));
  }
  return normalized;
}

function authorizedReadPath(value: unknown): string {
  const p = objectParams({ path: value }).path;
  if (typeof p !== "string") throw new Error("A valid file path is required.");
  return resolveLeoPath(normalizeExternalPath(p), LEO_ROOT);
}

function authorizedWritePath(value: unknown): string {
  const p = objectParams({ path: value }).path;
  if (typeof p !== "string") throw new Error("A valid file path is required.");
  return assertInside(WORKSPACE_ROOT, path.isAbsolute(p) ? p : path.join(WORKSPACE_ROOT, p));
}

export async function executeReadFile(parameters: unknown): Promise<unknown> {
  const p = objectParams(parameters);
  const filePath = authorizedReadPath(p.path);
  const data = await readFile(filePath);
  if (data.byteLength > MAX_FILE_READ_BYTES) throw new Error("File exceeds the configured read limit.");
  return { path: filePath, content: data.toString("utf8") };
}

export async function executeWriteFile(parameters: unknown): Promise<unknown> {
  const p = objectParams(parameters);
  if (typeof p.path !== "string" || typeof p.content !== "string") {
    throw new Error("pc.write_file requires path and string content.");
  }
  if (Buffer.byteLength(p.content, "utf8") > MAX_FILE_WRITE_BYTES) {
    throw new Error("File content exceeds the configured write limit.");
  }
  const filePath = authorizedWritePath(normalizeExternalPath(p.path));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, p.content, "utf8");
  return { path: filePath, bytesWritten: Buffer.byteLength(p.content, "utf8") };
}

export async function executeListDirectory(parameters: unknown): Promise<unknown> {
  const p = objectParams(parameters);
  const requested = typeof p.path === "string" ? p.path : ".";
  const dir = resolveLeoPath(requested, LEO_ROOT);
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.map(entry => ({
    name: entry.name,
    type: entry.isDirectory() ? "directory" : "file"
  }));
}

function validateCommand(command: unknown): string {
  if (typeof command !== "string" || !command.trim()) {
    throw new Error("pc.run_command requires a non-empty command.");
  }
  const normalized = command.trim();
  if (Buffer.byteLength(normalized, "utf8") > 16 * 1024) {
    throw new Error("Command exceeds the maximum allowed size.");
  }

  const blockedPatterns = [
    /[;&|]/,
    /(?:^|[\s])(?:>>|>)/,
    /(?:^|[\s])(?:rm|del|erase|rmdir|format)\b/i,
    /(?:^|[\s])(?:shutdown|restart-computer|stop-computer)\b/i,
    /(?:invoke-expression|iex)\b/i,
    /-encodedcommand\b/i,
    /-enc\b/i,
    /(?:start-process|start-job|start-threadjob)\b/i,
    /(?:invoke-webrequest|iwr|invoke-restmethod|irm)\b/i,
    /(?:set-executionpolicy|add-mppreference)\b/i,
    /(?:reg\s+(?:add|delete))\b/i,
    /(?:net\s+(?:user|localgroup|share|use))\b/i
  ];

  if (blockedPatterns.some(pattern => pattern.test(normalized))) {
    throw new Error("Command rejected by the L.E.O. command execution policy.");
  }
  return normalized;
}

export async function executeShell(parameters: unknown, shell: "powershell" | "cmd"): Promise<unknown> {
  const p = objectParams(parameters);
  const command = validateCommand(p.command);
  const cwd =
    typeof p.workingDirectory === "string"
      ? assertInside(LEO_ROOT, path.resolve(normalizeExternalPath(p.workingDirectory)))
      : COMMAND_WORKING_DIRECTORY;

  const executable =
    process.platform === "win32" ? (process.env.LEO_POWERSHELL_EXECUTABLE ?? "powershell.exe") : "/bin/sh";

  const portableCommand =
    process.platform === "win32"
      ? command
      : command.replace(/^Write-Output\s+(.+)$/i, "printf '%s\\n' $1");

  const args =
    process.platform === "win32"
      ? ["-NoProfile", "-NonInteractive", "-NoLogo", "-Command", portableCommand]
      : ["-lc", portableCommand];

  void shell;

  return new Promise((resolve, reject) => {
    execFile(
      executable,
      args,
      { cwd, windowsHide: true, timeout: COMMAND_TIMEOUT_MS, maxBuffer: MAX_COMMAND_OUTPUT_BYTES },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message));
          return;
        }
        resolve({ stdout, stderr, exitCode: 0 });
      }
    );
  });
}

registerToolExecutor("pc.read_file", executeReadFile);
registerToolExecutor("pc.write_file", executeWriteFile);
registerToolExecutor("pc.list_directory", executeListDirectory);
registerToolExecutor("pc.run_command", parameters => executeShell(parameters, "powershell"));
registerToolExecutor("pc.run_powershell", parameters => executeShell(parameters, "powershell"));
registerToolExecutor("pc.run_cmd", parameters => executeShell(parameters, "cmd"));
