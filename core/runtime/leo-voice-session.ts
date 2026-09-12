import { LeoRuntime, type LeoRuntimeRequest, type LeoRuntimeResult } from "./leo-runtime.ts";
import { transcribeAudio, speakText } from "../tools/voice-tools.ts";

export interface VoiceSessionRequest {
  audioBase64: string;
  filename?: string;
  ownerAuthToken?: string;
  familyMemberId?: string;
  approvalId?: string;
  traceId?: string;
  conversation?: LeoRuntimeRequest["conversation"];
  /** Set to false to skip synthesizing a spoken reply (text-only round trip). */
  speak?: boolean;
}

export interface VoiceSessionResult {
  transcribedText: string;
  transcriptionLanguage: string | null;
  runtimeResult: LeoRuntimeResult;
  /** Present when speech synthesis succeeded. */
  spokenReplyAudioBase64?: string;
  /**
   * Present when speech synthesis was requested but failed (e.g. Piper not
   * installed yet) — the text reply in runtimeResult.response is still
   * returned; a voice-output failure never hides the actual answer.
   */
  spokenReplyError?: string;
}

/**
 * A thin session wrapper — it adds no new authorization logic of its own.
 * Transcription and synthesis are both low-risk, no-approval tools (see
 * tool-registry.ts); everything else (planning, permission, approval,
 * execution, family scoping) is exactly LeoRuntime.process()'s existing
 * behavior, unchanged.
 */
export class LeoVoiceSession {
  constructor(private readonly runtime: LeoRuntime) {}

  async process(request: VoiceSessionRequest): Promise<VoiceSessionResult> {
    const transcription = await transcribeAudio({
      audioBase64: request.audioBase64,
      filename: request.filename
    });

    const runtimeResult = await this.runtime.process({
      userMessage: transcription.text,
      source: "voice",
      ownerAuthToken: request.ownerAuthToken,
      familyMemberId: request.familyMemberId,
      approvalId: request.approvalId,
      traceId: request.traceId,
      conversation: request.conversation
    });

    const result: VoiceSessionResult = {
      transcribedText: transcription.text,
      transcriptionLanguage: transcription.language,
      runtimeResult
    };

    if (request.speak === false) return result;

    try {
      const speech = await speakText({ text: runtimeResult.response });
      result.spokenReplyAudioBase64 = speech.audioBase64;
    } catch (error) {
      result.spokenReplyError = error instanceof Error ? error.message : String(error);
    }

    return result;
  }
}
