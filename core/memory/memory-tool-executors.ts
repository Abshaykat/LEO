import { registerToolExecutor } from "../execution/tool-executor-registry.ts";
import { createMemory, deleteMemory, getMemoryHistory, listMemories, updateMemory } from "./memory-store.ts";
import { retrieveMemories } from "./memory-retriever.ts";
import type { MemoryCategory } from "./memory-types.ts";

function objectParams(parameters: unknown): Record<string, unknown> {
  if (typeof parameters !== "object" || parameters === null || Array.isArray(parameters)) {
    throw new Error("Tool parameters must be an object.");
  }
  return parameters as Record<string, unknown>;
}

function requireOwnerId(p: Record<string, unknown>): string {
  const ownerId = typeof p.ownerId === "string" ? p.ownerId : "";
  if (!ownerId) {
    throw new Error(
      "A memory ownerId is required. (When called through LeoRuntime this is injected automatically from the authenticated session.)"
    );
  }
  return ownerId;
}

registerToolExecutor("memory.create", parameters => {
  const p = objectParams(parameters);
  return createMemory({
    ownerId: requireOwnerId(p),
    category: (p.category as MemoryCategory) ?? "conversation",
    access: p.access === "restricted" ? "restricted" : "standard",
    content: String(p.content ?? ""),
    source: p.source === "system" || p.source === "conversation" ? p.source : "owner",
    tags: Array.isArray(p.tags) ? p.tags.map(String) : undefined
  });
});

registerToolExecutor("memory.search", parameters => {
  const p = objectParams(parameters);
  return retrieveMemories({
    ownerId: requireOwnerId(p),
    query: String(p.query ?? ""),
    categories: Array.isArray(p.categories) ? (p.categories as MemoryCategory[]) : undefined,
    ownerAuthenticated: p.ownerAuthenticated === true,
    limit: typeof p.limit === "number" ? p.limit : undefined
  });
});

registerToolExecutor("memory.list", parameters => {
  const p = objectParams(parameters);
  return listMemories(requireOwnerId(p));
});

registerToolExecutor("memory.update", parameters => {
  const p = objectParams(parameters);
  const ownerId = requireOwnerId(p);
  const id = String(p.id ?? "");
  if (!id) throw new Error("memory.update requires an id.");
  return updateMemory(ownerId, id, {
    content: typeof p.content === "string" ? p.content : undefined,
    tags: Array.isArray(p.tags) ? p.tags.map(String) : undefined,
    category: p.category as MemoryCategory | undefined,
    access: p.access === "restricted" || p.access === "standard" ? p.access : undefined
  });
});

registerToolExecutor("memory.get_history", parameters => {
  const p = objectParams(parameters);
  const ownerId = requireOwnerId(p);
  const id = String(p.id ?? "");
  if (!id) throw new Error("memory.get_history requires an id.");
  return getMemoryHistory(ownerId, id);
});

registerToolExecutor("memory.delete", async parameters => {
  const p = objectParams(parameters);
  const ownerId = requireOwnerId(p);
  const id = String(p.id ?? "");
  if (!id) throw new Error("memory.delete requires an id.");
  const deleted = await deleteMemory(ownerId, id);
  return { deleted, id };
});
