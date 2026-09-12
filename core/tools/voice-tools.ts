import { registerToolExecutor } from "../execution/tool-executor-registry.ts";

function objectParams(parameters: unknown): Record<string, unknown> {
  if (typeof parameters !== "object" || parameters === null || Array.isArray(parameters)) {
    throw new Error("Tool parameters must be an object.");
  }
  return parameters as Record<string, unknown>;
}

function voiceBaseUrl(): string {
  return process.env.LEO_VOICE_URL ?? `http://127.0.0.1:${process.env.LEO_VOICE_PORT ?? "8765"}`;
}

async function voiceFetch(pathName: string, init: RequestInit, timeoutMs = 30_000): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${voiceBaseUrl()}${pathName}`, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`L.E.O. voice service did not respond within ${timeoutMs}ms at ${voiceBaseUrl()}.`);
    }
    throw new Error(
      `Could not reach the L.E.O. voice service at ${voiceBaseUrl()}. ` +
        `Is it running? Start it with: python -m leo_voice (original error: ${
          error instanceof Error ? error.message : String(error)
        })`
    );
  } finally {
    clearTimeout(timer);
  }
}

async function readJsonError(response: globalThis.Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

export interface VoiceStatus {
  status: "ok" | "degraded" | "unreachable";
  sttReady: boolean;
  ttsReady: boolean;
  sttError: string | null;
  ttsError: string | null;
}

export async function checkVoiceStatus(): Promise<VoiceStatus> {
  try {
    const response = await voiceFetch("/health", { method: "GET" }, 5_000);
    const body = (await response.json()) as {
      status: "ok" | "degraded";
      stt_ready: boolean;
      tts_ready: boolean;
      stt_error: string | null;
      tts_error: string | null;
    };
    return {
      status: body.status,
      sttReady: body.stt_ready,
      ttsReady: body.tts_ready,
      sttError: body.stt_error,
      ttsError: body.tts_error
    };
  } catch (error) {
    return {
      status: "unreachable",
      sttReady: false,
      ttsReady: false,
      sttError: error instanceof Error ? error.message : String(error),
      ttsError: error instanceof Error ? error.message : String(error)
    };
  }
}

export interface TranscribeResult {
  text: string;
  language: string | null;
  durationSeconds: number | null;
}

/**
 * parameters: { audioBase64: string, filename?: string }
 * The audio itself never leaves the machine — this only ever talks to the
 * local leo_voice service on 127.0.0.1.
 */
export async function transcribeAudio(parameters: unknown): Promise<TranscribeResult> {
  const p = objectParams(parameters);
  const audioBase64 = typeof p.audioBase64 === "string" ? p.audioBase64 : "";
  if (!audioBase64) throw new Error("voice.transcribe requires audioBase64.");

  const bytes = Buffer.from(audioBase64, "base64");
  const form = new FormData();
  form.append("audio", new Blob([bytes]), typeof p.filename === "string" ? p.filename : "audio.wav");

  const response = await voiceFetch("/transcribe", { method: "POST", body: form }, 60_000);
  if (!response.ok) throw new Error(`Transcription failed: ${await readJsonError(response)}`);

  const body = (await response.json()) as { text: string; language: string | null; duration_seconds: number | null };
  return { text: body.text, language: body.language, durationSeconds: body.duration_seconds };
}

export interface SpeakResult {
  audioBase64: string;
  mimeType: string;
}

/** parameters: { text: string } */
export async function speakText(parameters: unknown): Promise<SpeakResult> {
  const p = objectParams(parameters);
  const text = typeof p.text === "string" ? p.text : "";
  if (!text.trim()) throw new Error("voice.speak requires non-empty text.");

  const response = await voiceFetch(
    "/speak",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    },
    30_000
  );
  if (!response.ok) throw new Error(`Speech synthesis failed: ${await readJsonError(response)}`);

  const arrayBuffer = await response.arrayBuffer();
  return {
    audioBase64: Buffer.from(arrayBuffer).toString("base64"),
    mimeType: response.headers.get("content-type") ?? "audio/wav"
  };
}

registerToolExecutor("voice.check_status", () => checkVoiceStatus());
registerToolExecutor("voice.transcribe", parameters => transcribeAudio(parameters));
registerToolExecutor("voice.speak", parameters => speakText(parameters));

/**
 * parameters: { audioBase64: string, memberId: string, filename?: string }
 * Enrolls a voice sample against a family member id that MUST already
 * exist in identity/family-store.ts. This never grants that member any
 * permission by itself — enrollment only feeds voice.identify_speaker's
 * personalization suggestions.
 */
export async function enrollSpeaker(parameters: unknown): Promise<{ enrolled: boolean; memberId: string }> {
  const p = objectParams(parameters);
  const audioBase64 = typeof p.audioBase64 === "string" ? p.audioBase64 : "";
  const memberId = typeof p.memberId === "string" ? p.memberId.trim() : "";
  if (!audioBase64) throw new Error("voice.enroll_speaker requires audioBase64.");
  if (!memberId) throw new Error("voice.enroll_speaker requires memberId.");

  const bytes = Buffer.from(audioBase64, "base64");
  const form = new FormData();
  form.append("member_id", memberId);
  form.append("audio", new Blob([bytes]), typeof p.filename === "string" ? p.filename : "enroll.wav");

  const response = await voiceFetch("/voice/enroll", { method: "POST", body: form }, 30_000);
  if (!response.ok) throw new Error(`Speaker enrollment failed: ${await readJsonError(response)}`);

  const body = (await response.json()) as { enrolled: boolean; member_id: string };
  return { enrolled: body.enrolled, memberId: body.member_id };
}

export interface SpeakerIdentificationResult {
  /**
   * ADVISORY ONLY. This is a best-guess suggestion for personalization
   * (e.g. "greet them by name") from a lightweight, non-cryptographic
   * spectral fingerprint — see voice/leo_voice/speaker_id.py's module
   * docstring. It is NEVER sufficient proof of identity. Nothing in this
   * codebase (identity/family-gate.ts, agents/supervisor.ts, or
   * execution-engine.ts) accepts this value as an authorization input —
   * every actual permission/approval decision still requires an explicit
   * userId the owner has configured through the normal family-management
   * tools, never a voice match.
   */
  suggestedMemberId: string | null;
  confidence: number | null;
}

/** parameters: { audioBase64: string, filename?: string } */
export async function identifySpeaker(parameters: unknown): Promise<SpeakerIdentificationResult> {
  const p = objectParams(parameters);
  const audioBase64 = typeof p.audioBase64 === "string" ? p.audioBase64 : "";
  if (!audioBase64) throw new Error("voice.identify_speaker requires audioBase64.");

  const bytes = Buffer.from(audioBase64, "base64");
  const form = new FormData();
  form.append("audio", new Blob([bytes]), typeof p.filename === "string" ? p.filename : "identify.wav");

  const response = await voiceFetch("/voice/identify", { method: "POST", body: form }, 30_000);
  if (!response.ok) throw new Error(`Speaker identification failed: ${await readJsonError(response)}`);

  const body = (await response.json()) as { member_id: string | null; confidence: number | null };
  return { suggestedMemberId: body.member_id, confidence: body.confidence };
}

registerToolExecutor("voice.enroll_speaker", parameters => enrollSpeaker(parameters));
registerToolExecutor("voice.identify_speaker", parameters => identifySpeaker(parameters));
