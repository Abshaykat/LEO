import { createHash } from "node:crypto";

function stableSerialize(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Non-finite numbers are not allowed.");
    }

    return JSON.stringify(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }

  if (typeof value === "object") {
    const object = value as Record<string, unknown>;

    const keys = Object.keys(object).sort();

    return `{${keys
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableSerialize(object[key])}`
      )
      .join(",")}}`;
  }

  throw new Error(
    `Unsupported value type: ${typeof value}`
  );
}

export function canonicalize(value: unknown): string {
  return stableSerialize(value);
}

export function createActionHash(
  toolName: string,
  parameters: unknown
): string {

  const payload = stableSerialize({
    toolName,
    parameters
  });

  return createHash("sha256")
    .update(payload, "utf8")
    .digest("hex");
}
