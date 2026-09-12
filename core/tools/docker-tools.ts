import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function asString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required.`);
  }
  if (!/^[a-zA-Z0-9_.:/-]+$/.test(value)) {
    throw new Error(`${name} contains unsupported characters.`);
  }
  return value;
}

export async function dockerControl(parameters: unknown): Promise<unknown> {
  const p = (parameters ?? {}) as Record<string, unknown>;
  const operation = asString(p.operation, "operation").toLowerCase();
  const target = asString(p.target, "target");

  const allowed = new Set(["inspect", "start", "stop", "restart", "logs"]);
  if (!allowed.has(operation)) throw new Error("Unsupported Docker operation.");

  const args =
    operation === "inspect" ? ["inspect", target] :
    operation === "start" ? ["start", target] :
    operation === "stop" ? ["stop", target] :
    operation === "restart" ? ["restart", target] :
    ["logs", "--tail", "200", target];

  const result = await execFileAsync("docker", args, {
    windowsHide: true,
    maxBuffer: 512 * 1024
  });

  return {
    operation,
    target,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

import { registerToolExecutor } from "../execution/tool-executor-registry.ts";

registerToolExecutor("docker.control", dockerControl);
