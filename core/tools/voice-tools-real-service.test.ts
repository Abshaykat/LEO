import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveVoiceServiceDir(): string {
  return process.env.LEO_VOICE_SERVICE_DIR ?? path.resolve(__dirname, "../../voice");
}

async function waitForHealth(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Voice service never became healthy at ${url}: ${lastError}`);
}

function makeSineWav(frequencyHz: number, seconds: number, sampleRate = 16000): Buffer {
  const numSamples = Math.floor(seconds * sampleRate);
  const dataSize = numSamples * 2; // 16-bit mono
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample =
      0.6 * Math.sin(2 * Math.PI * frequencyHz * t) +
      0.3 * Math.sin(2 * Math.PI * 2 * frequencyHz * t) +
      0.1 * Math.sin(2 * Math.PI * 3 * frequencyHz * t);
    buffer.writeInt16LE(Math.round(sample * 32767 * 0.9), 44 + i * 2);
  }

  return buffer;
}

async function main() {
  console.log("=== L.E.O. VOICE-TOOLS REAL-SERVICE INTEGRATION TEST ===");

  const voiceServiceDir = resolveVoiceServiceDir();
  const port = 8766; // distinct from the mock server's default 8765
  const tempHome = await mkdtemp(path.join(os.tmpdir(), "leo-voice-real-service-"));

  process.env.LEO_VOICE_URL = `http://127.0.0.1:${port}`;

  let child: ChildProcess | undefined;
  try {
    child = spawn("python3", ["-m", "leo_voice"], {
      cwd: voiceServiceDir,
      env: { ...process.env, LEO_HOME: tempHome, LEO_VOICE_PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderrOutput = "";
    child.stderr?.on("data", chunk => {
      stderrOutput += chunk.toString();
    });

    let spawnError: Error | undefined;
    child.on("error", error => {
      spawnError = error;
    });

    try {
      await waitForHealth(`http://127.0.0.1:${port}/health`, 15_000);
    } catch (healthError) {
      const combined = `${spawnError?.message ?? ""}\n${stderrOutput}`;
      const missingDependency =
        /ModuleNotFoundError|No module named ['"]?(flask|leo_voice)['"]?|ENOENT/i.test(combined) ||
        spawnError !== undefined;

      if (missingDependency) {
        console.log(
          "SKIPPED: the real Python voice service could not start in this environment " +
            "(python3 and/or Flask are not available here). This is an optional runtime " +
            "dependency, not a code defect — see voice/README.md for setup. Details:"
        );
        console.log(combined.trim() || String(healthError));
        console.log("\n=== VOICE-TOOLS REAL-SERVICE INTEGRATION TEST SKIPPED ===");
        return;
      }

      throw healthError;
    }
    console.log("PASS: the real Python leo_voice service starts and responds to /health.");

    const { checkVoiceStatus, transcribeAudio, speakText, enrollSpeaker, identifySpeaker } = await import(
      "./voice-tools.ts"
    );

    // 1. Honest degradation: neither backend is installed in this sandbox,
    //    so status must be "degraded" with real, human-readable errors —
    //    never silently "ok", and never a crash.
    {
      const status = await checkVoiceStatus();
      if (status.status !== "degraded") {
        throw new Error(`Expected "degraded" (no faster-whisper/piper installed here), got: ${JSON.stringify(status)}`);
      }
      if (!status.sttError?.toLowerCase().includes("faster-whisper")) {
        throw new Error(`Expected a clear faster-whisper install hint, got: ${status.sttError}`);
      }
      if (!status.ttsError?.toLowerCase().includes("piper")) {
        throw new Error(`Expected a clear piper-tts install hint, got: ${status.ttsError}`);
      }
      console.log("PASS: the real service honestly reports degraded status with actionable install instructions.");
    }

    // 2. transcribeAudio against the real (model-less) service surfaces a
    //    clean 503-derived error through the TS client, not a crash.
    {
      let threw = false;
      try {
        await transcribeAudio({ audioBase64: Buffer.from("x").toString("base64"), filename: "clip.wav" });
      } catch (error) {
        threw = true;
        const message = error instanceof Error ? error.message : String(error);
        if (!message.toLowerCase().includes("faster-whisper")) {
          throw new Error(`Expected the real install-hint error to propagate through, got: ${message}`);
        }
      }
      if (!threw) throw new Error("Expected transcribeAudio to fail cleanly against a model-less real service.");
      console.log("PASS: transcribeAudio against the real service surfaces the genuine 'not installed' error, not a crash.");
    }

    // 3. Same for speakText.
    {
      let threw = false;
      try {
        await speakText({ text: "hello" });
      } catch (error) {
        threw = true;
        const message = error instanceof Error ? error.message : String(error);
        if (!message.toLowerCase().includes("piper")) {
          throw new Error(`Expected the real install-hint error to propagate through, got: ${message}`);
        }
      }
      if (!threw) throw new Error("Expected speakText to fail cleanly against a model-less real service.");
      console.log("PASS: speakText against the real service surfaces the genuine 'not installed' error, not a crash.");
    }

    // 4. Speaker identification needs no external model (unlike Whisper/
    //    Piper), so this genuinely runs the real spectral-fingerprint
    //    algorithm end to end against real, synthesized WAV audio — not a
    //    degraded/mocked path.
    {
      const status = await checkVoiceStatus();
      // checkVoiceStatus() doesn't currently surface speaker_id_ready —
      // confirm the health endpoint itself reports it directly.
      const healthResponse = await fetch(`http://127.0.0.1:${port}/health`);
      const health = (await healthResponse.json()) as { speaker_id_ready: boolean };
      if (!health.speaker_id_ready) {
        throw new Error("Expected speaker_id_ready to be true — this backend needs no external model.");
      }
      void status;
      console.log("PASS: speaker identification reports ready with no external model needed.");
    }

    {
      const voiceALowPitch = makeSineWav(120, 1.0);
      const voiceASecondTake = makeSineWav(122, 1.0); // same "voice", slightly different take
      const voiceBHighPitch = makeSineWav(220, 1.0);

      const enrollResult = await enrollSpeaker({
        audioBase64: voiceALowPitch.toString("base64"),
        memberId: "real-e2e-member-a",
        filename: "voice_a.wav"
      });
      if (!enrollResult.enrolled) throw new Error("Expected real enrollment to succeed.");

      const matchResult = await identifySpeaker({
        audioBase64: voiceASecondTake.toString("base64"),
        filename: "voice_a_take2.wav"
      });
      if (matchResult.suggestedMemberId !== "real-e2e-member-a") {
        throw new Error(
          `Expected the real algorithm to match the same synthetic voice, got: ${JSON.stringify(matchResult)}`
        );
      }
      console.log("PASS: the real speaker-ID algorithm matches the same synthetic voice across two takes.");

      const noMatchResult = await identifySpeaker({
        audioBase64: voiceBHighPitch.toString("base64"),
        filename: "voice_b.wav"
      });
      if (noMatchResult.suggestedMemberId !== null) {
        throw new Error(
          `Expected a different synthetic voice to NOT match, got: ${JSON.stringify(noMatchResult)}`
        );
      }
      console.log("PASS: the real speaker-ID algorithm correctly does not match a genuinely different voice.");
    }

    void stderrOutput; // available for debugging if needed; not asserted on
  } finally {
    child?.kill();
    delete process.env.LEO_VOICE_URL;
    await rm(tempHome, { recursive: true, force: true });
  }

  console.log("\n=== VOICE-TOOLS REAL-SERVICE INTEGRATION TEST PASSED ===");
}

main().catch(error => {
  console.error("\n=== TEST FAILED ===");
  console.error(error);
  process.exit(1);
});
