import http from "node:http";

const PORT = process.env.LEO_VOICE_PORT ? Number(process.env.LEO_VOICE_PORT) : 8765;

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        stt_ready: true,
        tts_ready: true,
        speaker_id_ready: true,
        stt_error: null,
        tts_error: null
      })
    );
    return;
  }

  if (req.method === "POST" && req.url === "/voice/enroll") {
    const bodyText = body.toString("latin1");
    const memberMatch = bodyText.match(/name="member_id"\r\n\r\n([^\r\n]+)/);
    const memberId = memberMatch ? memberMatch[1] : null;
    if (!memberId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "'member_id' form field is required." }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ enrolled: true, member_id: memberId }));
    return;
  }

  if (req.method === "POST" && req.url === "/voice/identify") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ member_id: "mock-member-id", confidence: 0.91 }));
    return;
  }

  if (req.method === "POST" && req.url === "/transcribe") {
    const text = body.toString("utf8").includes("audio")
      ? "mock transcription of the uploaded audio"
      : "mock transcription";
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ text, language: "en", duration_seconds: 2.5 }));
    return;
  }

  if (req.method === "POST" && req.url === "/speak") {
    const parsed = body.length ? JSON.parse(body.toString("utf8")) : {};
    if (!parsed.text || !parsed.text.trim()) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "'text' is required and must be a non-empty string." }));
      return;
    }
    res.writeHead(200, { "Content-Type": "audio/wav" });
    res.end(Buffer.from(`FAKE_WAV_AUDIO_FOR:${parsed.text}`));
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Mock L.E.O. voice server listening on http://127.0.0.1:${PORT}`);
});
