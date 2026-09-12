import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { MEMORY_ROOT } from "../config/leo-config.ts";

const KNOWLEDGE_FILE = path.join(MEMORY_ROOT, "knowledge.json");

/** A dependency-free term-frequency vector, keyed by lowercase token. */
export type TermVector = Record<string, number>;

export interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  source: string;
  /** 0 (untrusted) to 1 (fully trusted). Defaults to 0.5 when not supplied. */
  reliability: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  /** id of an older document this one replaces, if any. */
  supersedes?: string;
  termVector: TermVector;
}

export interface AddDocumentInput {
  title: string;
  content: string;
  source: string;
  reliability?: number;
  tags?: string[];
  supersedes?: string;
}

async function ensureStore(): Promise<void> {
  await mkdir(MEMORY_ROOT, { recursive: true });
}

async function readDocuments(): Promise<KnowledgeDocument[]> {
  await ensureStore();
  try {
    const content = await readFile(KNOWLEDGE_FILE, "utf8");
    const parsed: unknown = JSON.parse(content);
    if (!Array.isArray(parsed)) throw new Error("Knowledge store must contain an array.");
    return parsed as KnowledgeDocument[];
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeDocuments(documents: KnowledgeDocument[]): Promise<void> {
  await ensureStore();
  const tmp = `${KNOWLEDGE_FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(documents, null, 2) + "\n", "utf8");
  await rename(tmp, KNOWLEDGE_FILE);
}

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "and", "or", "but", "of", "to", "in", "on", "for", "with", "as",
  "at", "by", "from", "it", "this", "that", "these", "those"
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9\u0980-\u09ff]+/i)
    .filter(token => token.length > 1 && !STOPWORDS.has(token));
}

/** Builds a term-frequency vector, used both for storage and for queries. */
export function buildTermVector(text: string): TermVector {
  const vector: TermVector = {};
  for (const token of tokenize(text)) {
    vector[token] = (vector[token] ?? 0) + 1;
  }
  return vector;
}

/** Cosine similarity between two sparse term-frequency vectors, in [0, 1]. */
export function cosineSimilarity(a: TermVector, b: TermVector): number {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length === 0 || keysB.length === 0) return 0;

  let dot = 0;
  for (const key of keysA) {
    if (key in b) dot += a[key] * b[key];
  }

  const normA = Math.sqrt(keysA.reduce((sum, key) => sum + a[key] * a[key], 0));
  const normB = Math.sqrt(keysB.reduce((sum, key) => sum + b[key] * b[key], 0));
  if (normA === 0 || normB === 0) return 0;

  return dot / (normA * normB);
}

/** Token-set Dice coefficient, used to spot near-duplicate documents. */
function diceCoefficient(a: TermVector, b: TermVector): number {
  const keysA = new Set(Object.keys(a));
  const keysB = new Set(Object.keys(b));
  if (keysA.size === 0 && keysB.size === 0) return 1;
  let shared = 0;
  for (const key of keysA) {
    if (keysB.has(key)) shared++;
  }
  return (2 * shared) / (keysA.size + keysB.size || 1);
}

function normalizeTags(tags: string[] | undefined): string[] {
  return [...new Set((tags ?? []).map(tag => tag.trim().toLowerCase()).filter(Boolean))];
}

export async function addDocument(input: AddDocumentInput): Promise<KnowledgeDocument> {
  if (!input.title.trim()) throw new Error("Knowledge document title is required.");
  if (!input.content.trim()) throw new Error("Knowledge document content cannot be empty.");
  if (!input.source.trim()) throw new Error("Knowledge document source is required.");

  const reliability = input.reliability ?? 0.5;
  if (reliability < 0 || reliability > 1) {
    throw new Error("reliability must be between 0 and 1.");
  }

  const now = new Date().toISOString();
  const document: KnowledgeDocument = {
    id: randomUUID(),
    title: input.title.trim(),
    content: input.content.trim(),
    source: input.source.trim(),
    reliability,
    tags: normalizeTags(input.tags),
    createdAt: now,
    updatedAt: now,
    supersedes: input.supersedes,
    termVector: buildTermVector(`${input.title} ${input.content}`)
  };

  const documents = await readDocuments();
  if (document.supersedes && !documents.some(d => d.id === document.supersedes)) {
    throw new Error(`supersedes references an unknown document id: ${document.supersedes}`);
  }

  documents.push(document);
  await writeDocuments(documents);
  return document;
}

export async function listDocuments(): Promise<KnowledgeDocument[]> {
  return readDocuments();
}

export interface RankedDocument {
  document: KnowledgeDocument;
  similarity: number;
  combinedScore: number;
}

/**
 * Ranks documents by a blend of topical similarity to the query and the
 * source's reliability rating, so a highly relevant but low-trust source
 * doesn't automatically outrank a slightly-less-relevant, well-trusted one.
 */
export async function searchByReliability(
  query: string,
  options?: { limit?: number; similarityWeight?: number }
): Promise<RankedDocument[]> {
  const documents = await readDocuments();
  const queryVector = buildTermVector(query);
  const similarityWeight = options?.similarityWeight ?? 0.7;
  const reliabilityWeight = 1 - similarityWeight;

  const ranked = documents
    .map(document => {
      const similarity = cosineSimilarity(queryVector, document.termVector);
      const combinedScore = similarity * similarityWeight + document.reliability * reliabilityWeight;
      return { document, similarity, combinedScore };
    })
    .filter(entry => entry.similarity > 0)
    .sort((a, b) => b.combinedScore - a.combinedScore);

  return options?.limit ? ranked.slice(0, options.limit) : ranked;
}

export interface OutdatedDocument {
  document: KnowledgeDocument;
  reason: "stale" | "superseded";
  supersededBy?: string;
}

/**
 * Flags documents that are either superseded by a newer document, or
 * simply old (not updated within staleAfterDays) and not otherwise
 * confirmed current.
 */
export async function findOutdated(options?: { staleAfterDays?: number }): Promise<OutdatedDocument[]> {
  const documents = await readDocuments();
  const staleAfterMs = (options?.staleAfterDays ?? 180) * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const supersededIds = new Map<string, string>();
  for (const document of documents) {
    if (document.supersedes) supersededIds.set(document.supersedes, document.id);
  }

  const results: OutdatedDocument[] = [];
  for (const document of documents) {
    const supersededBy = supersededIds.get(document.id);
    if (supersededBy) {
      results.push({ document, reason: "superseded", supersededBy });
      continue;
    }
    const age = now - new Date(document.updatedAt).getTime();
    if (age > staleAfterMs) {
      results.push({ document, reason: "stale" });
    }
  }
  return results;
}

export interface ConflictingPair {
  a: KnowledgeDocument;
  b: KnowledgeDocument;
  similarity: number;
  reliabilityDelta: number;
}

/**
 * Heuristically flags document pairs that are about the same topic
 * (high cosine similarity) but are NOT near-duplicates and NOT linked by
 * a supersedes relationship — i.e. two unrelated sources making claims
 * about the same subject that should probably be reconciled by the owner.
 * This is a similarity heuristic, not semantic fact-checking.
 */
export async function findConflicts(options?: {
  topicalThreshold?: number;
  duplicateThreshold?: number;
}): Promise<ConflictingPair[]> {
  const documents = await readDocuments();
  const topicalThreshold = options?.topicalThreshold ?? 0.5;
  const duplicateThreshold = options?.duplicateThreshold ?? 0.9;

  const linked = new Set<string>();
  for (const document of documents) {
    if (document.supersedes) linked.add([document.id, document.supersedes].sort().join("::"));
  }

  const conflicts: ConflictingPair[] = [];
  for (let i = 0; i < documents.length; i++) {
    for (let j = i + 1; j < documents.length; j++) {
      const a = documents[i];
      const b = documents[j];
      const pairKey = [a.id, b.id].sort().join("::");
      if (linked.has(pairKey)) continue;

      const similarity = cosineSimilarity(a.termVector, b.termVector);
      if (similarity < topicalThreshold) continue;

      const duplicate = diceCoefficient(a.termVector, b.termVector) >= duplicateThreshold;
      if (duplicate) continue;

      conflicts.push({
        a,
        b,
        similarity,
        reliabilityDelta: Math.abs(a.reliability - b.reliability)
      });
    }
  }

  return conflicts.sort((x, y) => y.similarity - x.similarity);
}

export async function getKnowledgeStorePath(): Promise<string> {
  await ensureStore();
  return KNOWLEDGE_FILE;
}

import { registerToolExecutor } from "../execution/tool-executor-registry.ts";

function objectParams(parameters: unknown): Record<string, unknown> {
  if (typeof parameters !== "object" || parameters === null || Array.isArray(parameters)) {
    throw new Error("Tool parameters must be an object.");
  }
  return parameters as Record<string, unknown>;
}

registerToolExecutor("knowledge.add_document", parameters => {
  const p = objectParams(parameters);
  return addDocument({
    title: String(p.title ?? ""),
    content: String(p.content ?? ""),
    source: String(p.source ?? ""),
    reliability: typeof p.reliability === "number" ? p.reliability : undefined,
    tags: Array.isArray(p.tags) ? p.tags.map(String) : undefined,
    supersedes: typeof p.supersedes === "string" ? p.supersedes : undefined
  });
});

registerToolExecutor("knowledge.search", parameters => {
  const p = objectParams(parameters);
  return searchByReliability(String(p.query ?? ""), {
    limit: typeof p.limit === "number" ? p.limit : undefined
  });
});

registerToolExecutor("knowledge.find_outdated", parameters => {
  const p = objectParams(parameters);
  return findOutdated({
    staleAfterDays: typeof p.staleAfterDays === "number" ? p.staleAfterDays : undefined
  });
});

registerToolExecutor("knowledge.find_conflicts", () => findConflicts());
