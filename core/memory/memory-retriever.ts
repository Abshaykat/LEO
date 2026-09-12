import {
  writeAuditEvent
} from "../audit/audit-log.ts";

import {
  listMemories
} from "./memory-store.ts";

import type {
  LeoMemory,
  MemoryQuery,
  MemorySearchResult
} from "./memory-types.ts";

function tokenize(
  value: string
): string[] {
  return [
    ...new Set(
      value
        .toLowerCase()
        .split(/[\s,.;:!?()[\]{}"'`]+/)
        .map(
          token => token.trim()
        )
        .filter(
          token => token.length >= 2
        )
    )
  ];
}

function scoreMemory(
  memory: LeoMemory,
  queryTokens: string[]
): number {
  const searchable =
    [
      memory.content,
      memory.category,
      ...memory.tags
    ]
      .join(" ")
      .toLowerCase();

  let score = 0;

  for (
    const token of queryTokens
  ) {
    if (
      searchable.includes(token)
    ) {
      score += 1;
    }

    if (
      memory.tags.some(
        tag => tag === token
      )
    ) {
      score += 2;
    }
  }

  return score;
}

export async function retrieveMemories(
  request: MemoryQuery
): Promise<MemorySearchResult[]> {
  const query =
    request.query.trim();

  if (query.length === 0) {
    return [];
  }

  const allMemories =
    await listMemories(
      request.ownerId
    );

  const queryTokens =
    tokenize(query);

  const accessible =
    allMemories.filter(
      memory => {
        if (
          memory.access !==
          "restricted"
        ) {
          return true;
        }

        return (
          request.ownerAuthenticated ===
          true
        );
      }
    );

  const filtered =
    request.categories?.length
      ? accessible.filter(
          memory =>
            request.categories!.includes(
              memory.category
            )
        )
      : accessible;

  const results =
    filtered
      .map(
        memory => ({
          memory,
          score:
            scoreMemory(
              memory,
              queryTokens
            )
        })
      )
      .filter(
        result =>
          result.score > 0
      )
      .sort(
        (a, b) =>
          b.score - a.score
      )
      .slice(
        0,
        request.limit ?? 5
      );

  await writeAuditEvent({
    type:
      "memory_retrieved",
    details: {
      ownerId:
        request.ownerId,
      query,
      resultCount:
        results.length,
      restrictedAccessGranted:
        request.ownerAuthenticated ===
        true
    }
  });

  return results;
}
