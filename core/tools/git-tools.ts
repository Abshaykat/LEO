import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { LEO_ROOT, assertInside } from "../config/leo-config.ts";

const execFileAsync = promisify(execFile);

function repoRoot(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return LEO_ROOT;
  return assertInside(LEO_ROOT, value);
}

async function git(args: string[], cwd: string): Promise<unknown> {
  const result = await execFileAsync("git", args, {
    cwd,
    windowsHide: true,
    maxBuffer: 512 * 1024
  });
  return {
    cwd,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

export async function gitStatus(parameters: unknown): Promise<unknown> {
  const p = (parameters ?? {}) as Record<string, unknown>;
  return git(["status", "--short", "--branch"], repoRoot(p.cwd));
}

export async function gitDiff(parameters: unknown): Promise<unknown> {
  const p = (parameters ?? {}) as Record<string, unknown>;
  return git(["diff", "--no-ext-diff", "--"], repoRoot(p.cwd));
}

export async function gitCommit(parameters: unknown): Promise<unknown> {
  const p = (parameters ?? {}) as Record<string, unknown>;
  const message = typeof p.message === "string" ? p.message.trim() : "";
  if (!message) throw new Error("git.commit requires a non-empty message.");
  if (message.length > 200) throw new Error("Commit message is too long.");
  return git(["add", "-A"], repoRoot(p.cwd))
    .then(async () => git(["commit", "-m", message], repoRoot(p.cwd)));
}

import { registerToolExecutor } from "../execution/tool-executor-registry.ts";

registerToolExecutor("git.status", gitStatus);
registerToolExecutor("git.diff", gitDiff);
registerToolExecutor("git.commit", gitCommit);
