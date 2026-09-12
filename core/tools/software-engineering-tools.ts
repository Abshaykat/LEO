import { execFile } from "node:child_process";
import { LEO_ROOT, assertInside } from "../config/leo-config.ts";

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type CommandRunner = (
  executable: string,
  args: string[],
  options?: { cwd?: string; timeoutMs?: number }
) => Promise<CommandResult>;

export const defaultCommandRunner: CommandRunner = (executable, args, options) => {
  return new Promise((resolve, reject) => {
    execFile(
      executable,
      args,
      {
        cwd: options?.cwd,
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

/**
 * Only these (executable, first-arg) pairs may run. This is deliberately
 * narrower than "any npm script" — arbitrary script names can be aliased to
 * anything in package.json, so we allow-list the well-known test/build
 * entry points instead of trusting the script name alone.
 */
const ALLOWED_TEST_COMMANDS: ReadonlyArray<{ executable: string; args: string[] }> = [
  { executable: "npm", args: ["test"] },
  { executable: "npm", args: ["run", "test"] },
  { executable: "npx", args: ["jest"] },
  { executable: "yarn", args: ["test"] },
  { executable: "pnpm", args: ["test"] },
  { executable: "pytest", args: [] },
  { executable: "python", args: ["-m", "pytest"] },
  { executable: "python3", args: ["-m", "pytest"] }
];

const ALLOWED_BUILD_COMMANDS: ReadonlyArray<{ executable: string; args: string[] }> = [
  { executable: "npm", args: ["run", "build"] },
  { executable: "yarn", args: ["build"] },
  { executable: "pnpm", args: ["build"] },
  { executable: "npx", args: ["tsc", "--noEmit"] },
  { executable: "tsc", args: ["--noEmit"] }
];

function matchAllowedCommand(
  allowList: ReadonlyArray<{ executable: string; args: string[] }>,
  executable: string,
  extraArgs: string[]
): { executable: string; args: string[] } {
  const match = allowList.find(entry => entry.executable === executable);
  if (!match) {
    throw new Error(
      `"${executable}" is not on the allow-list for this operation. Allowed executables: ${[
        ...new Set(allowList.map(entry => entry.executable))
      ].join(", ")}.`
    );
  }
  // Extra args (e.g. a specific test file path) are appended but never
  // allowed to smuggle in shell metacharacters — execFile passes args as
  // an argv array with no shell, so this is a defense-in-depth check only.
  for (const arg of extraArgs) {
    if (/[;&|`$<>]/.test(arg)) {
      throw new Error("Extra arguments may not contain shell metacharacters.");
    }
  }
  return { executable: match.executable, args: [...match.args, ...extraArgs] };
}

function resolveCwd(parameters: Record<string, unknown>): string {
  if (typeof parameters.cwd !== "string" || !parameters.cwd.trim()) return LEO_ROOT;
  return assertInside(LEO_ROOT, parameters.cwd);
}

export interface TestFailure {
  test: string;
  message?: string;
}

export interface TestFailureSummary {
  framework: "jest" | "pytest" | "unknown";
  passed: number;
  failed: number;
  total: number;
  failures: TestFailure[];
}

function parseJestSummary(output: string): TestFailureSummary {
  const summaryMatch = output.match(
    /Tests:\s+(?:(\d+)\s+failed,\s*)?(?:(\d+)\s+skipped,\s*)?(?:(\d+)\s+passed,\s*)?(\d+)\s+total/
  );
  const failed = summaryMatch?.[1] ? Number(summaryMatch[1]) : 0;
  const passed = summaryMatch?.[3] ? Number(summaryMatch[3]) : 0;
  const total = summaryMatch?.[4] ? Number(summaryMatch[4]) : passed + failed;

  const failures: TestFailure[] = [];
  const failureBlockPattern = /●\s+(.+)\n/g;
  let match: RegExpExecArray | null;
  while ((match = failureBlockPattern.exec(output)) !== null) {
    failures.push({ test: match[1].trim() });
  }

  return { framework: "jest", passed, failed, total, failures };
}

function parsePytestSummary(output: string): TestFailureSummary {
  const summaryMatch = output.match(
    /(\d+)\s+failed(?:,\s*(\d+)\s+passed)?|(\d+)\s+passed(?:,\s*(\d+)\s+failed)?/
  );

  let failed = 0;
  let passed = 0;
  if (summaryMatch) {
    if (summaryMatch[1] !== undefined) {
      failed = Number(summaryMatch[1]);
      passed = summaryMatch[2] ? Number(summaryMatch[2]) : 0;
    } else if (summaryMatch[3] !== undefined) {
      passed = Number(summaryMatch[3]);
      failed = summaryMatch[4] ? Number(summaryMatch[4]) : 0;
    }
  }

  const failures: TestFailure[] = [];
  const failedLinePattern = /^FAILED\s+(\S+)(?:\s+-\s+(.*))?$/gm;
  let match: RegExpExecArray | null;
  while ((match = failedLinePattern.exec(output)) !== null) {
    failures.push({ test: match[1], message: match[2]?.trim() });
  }

  return { framework: "pytest", passed, failed, total: passed + failed, failures };
}

/**
 * Detects the test framework from combined stdout/stderr and extracts a
 * structured pass/fail summary plus per-test failure messages. Falls back
 * to "unknown" with zeroed counts when neither Jest nor pytest's output
 * shape is recognized, rather than guessing.
 */
export function analyzeFailure(stdout: string, stderr: string): TestFailureSummary {
  const output = `${stdout}\n${stderr}`;
  if (/Test Suites:/.test(output) && /Tests:/.test(output)) {
    return parseJestSummary(output);
  }
  if (/=+\s*(?:short test summary|FAILURES|ERRORS)\s*=+/.test(output) || /^FAILED\s+\S+/m.test(output) || /\d+\s+(?:passed|failed)/.test(output)) {
    return parsePytestSummary(output);
  }
  return { framework: "unknown", passed: 0, failed: 0, total: 0, failures: [] };
}

export interface RunCommandOutcome {
  executable: string;
  args: string[];
  cwd: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  succeeded: boolean;
}

export async function runTests(
  parameters: unknown,
  runner: CommandRunner = defaultCommandRunner
): Promise<RunCommandOutcome & { analysis: TestFailureSummary }> {
  const p = objectParams(parameters);
  const executable = typeof p.executable === "string" ? p.executable : "npm";
  const extraArgs = Array.isArray(p.args) ? p.args.map(String) : [];
  const { executable: exe, args } = matchAllowedCommand(ALLOWED_TEST_COMMANDS, executable, extraArgs);
  const cwd = resolveCwd(p);

  const result = await runner(exe, args, { cwd });
  return {
    executable: exe,
    args,
    cwd,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    succeeded: result.exitCode === 0,
    analysis: analyzeFailure(result.stdout, result.stderr)
  };
}

export async function runBuild(
  parameters: unknown,
  runner: CommandRunner = defaultCommandRunner
): Promise<RunCommandOutcome> {
  const p = objectParams(parameters);
  const executable = typeof p.executable === "string" ? p.executable : "npm";
  const extraArgs = Array.isArray(p.args) ? p.args.map(String) : [];
  const { executable: exe, args } = matchAllowedCommand(ALLOWED_BUILD_COMMANDS, executable, extraArgs);
  const cwd = resolveCwd(p);

  const result = await runner(exe, args, { cwd });
  return {
    executable: exe,
    args,
    cwd,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    succeeded: result.exitCode === 0
  };
}

import { registerToolExecutor } from "../execution/tool-executor-registry.ts";

registerToolExecutor("swe.run_tests", parameters => runTests(parameters));
registerToolExecutor("swe.run_build", parameters => runBuild(parameters));
