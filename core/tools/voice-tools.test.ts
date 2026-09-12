async function main() {
  console.log("=== L.E.O. VOICE-TOOLS TEST ===");

  const { checkVoiceStatus, transcribeAudio, speakText, enrollSpeaker, identifySpeaker } = await import(
    "./voice-tools.ts"
  );

  // 1. checkVoiceStatus against the running mock server.
  {
    const status = await checkVoiceStatus();
    if (status.status !== "ok" || !status.sttReady || !status.ttsReady) {
      throw new Error(`Expected a healthy status from the mock server, got: ${JSON.stringify(status)}`);
    }
    console.log("PASS: checkVoiceStatus reports a healthy mock voice service.");
  }

  // 2. transcribeAudio round-trips base64 audio to the mock server and back.
  {
    const fakeAudioBase64 = Buffer.from("not-real-audio-bytes").toString("base64");
    const result = await transcribeAudio({ audioBase64: fakeAudioBase64, filename: "clip.wav" });
    if (!result.text.includes("mock transcription")) {
      throw new Error(`Expected a mock transcription, got: ${JSON.stringify(result)}`);
    }
    if (result.language !== "en") throw new Error("Expected the mock language field to pass through.");
    console.log("PASS: transcribeAudio sends audio and parses the transcription response.");
  }

  // 3. transcribeAudio rejects a missing audioBase64 before any network call.
  {
    let threw = false;
    try {
      await transcribeAudio({});
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("Expected transcribeAudio to reject missing audioBase64.");
    console.log("PASS: transcribeAudio validates its input before calling the service.");
  }

  // 4. speakText round-trips text to the mock server and gets audio bytes back.
  {
    const result = await speakText({ text: "ami bhalo achi" });
    const decoded = Buffer.from(result.audioBase64, "base64").toString("utf8");
    if (!decoded.includes("ami bhalo achi")) {
      throw new Error(`Expected the mock audio payload to reflect the input text, got: ${decoded}`);
    }
    if (!result.mimeType.includes("audio")) throw new Error("Expected an audio mime type.");
    console.log("PASS: speakText sends text and receives synthesized audio bytes back.");
  }

  // 5. speakText rejects empty text before any network call.
  {
    let threw = false;
    try {
      await speakText({ text: "   " });
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("Expected speakText to reject empty text.");
    console.log("PASS: speakText validates its input before calling the service.");
  }

  // 7. enrollSpeaker sends the memberId and audio, and the mock echoes success.
  {
    const result = await enrollSpeaker({
      audioBase64: Buffer.from("fake voice sample").toString("base64"),
      memberId: "member-123"
    });
    if (!result.enrolled || result.memberId !== "member-123") {
      throw new Error(`Expected a successful enrollment for member-123, got: ${JSON.stringify(result)}`);
    }
    console.log("PASS: enrollSpeaker sends member_id + audio and parses the enrollment response.");
  }

  // 8. enrollSpeaker validates required fields before calling the service.
  {
    let threw = false;
    try {
      await enrollSpeaker({ audioBase64: "" });
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("Expected enrollSpeaker to reject missing audioBase64/memberId.");
    console.log("PASS: enrollSpeaker validates its input before calling the service.");
  }

  // 9. identifySpeaker returns an advisory suggestion, clearly labeled as such by field name.
  {
    const result = await identifySpeaker({ audioBase64: Buffer.from("fake voice sample").toString("base64") });
    if (result.suggestedMemberId !== "mock-member-id" || result.confidence !== 0.91) {
      throw new Error(`Expected the mock identification result, got: ${JSON.stringify(result)}`);
    }
    console.log("PASS: identifySpeaker returns an advisory suggestedMemberId + confidence.");
  }

  // 10. An unreachable voice service produces a clear, actionable error
  //    rather than a raw network exception.
  {
    const originalUrl = process.env.LEO_VOICE_URL;
    process.env.LEO_VOICE_URL = "http://127.0.0.1:1"; // nothing listens here
    try {
      const status = await checkVoiceStatus();
      if (status.status !== "unreachable" || !status.sttError?.includes("voice service")) {
        throw new Error(`Expected an "unreachable" status with a clear message, got: ${JSON.stringify(status)}`);
      }
      console.log("PASS: an unreachable voice service is reported clearly, not as a raw crash.");
    } finally {
      if (originalUrl) process.env.LEO_VOICE_URL = originalUrl;
      else delete process.env.LEO_VOICE_URL;
    }
  }

  console.log("\n=== VOICE-TOOLS TEST PASSED ===");
}

main().catch(error => {
  console.error("\n=== TEST FAILED ===");
  console.error(error);
  process.exit(1);
});
