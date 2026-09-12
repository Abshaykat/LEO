import http from "node:http";

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const bodyText = Buffer.concat(chunks).toString("utf8");

  if (req.method === "GET" && req.url === "/api/tags") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ models: [{ name: "qwen3:1.7b" }] }));
    return;
  }

  if (req.method === "POST" && req.url === "/api/chat") {
    const body = bodyText ? JSON.parse(bodyText) : {};
    const lastUserMessage = [...(body.messages ?? [])].reverse().find((m) => m.role === "user");
    const requested = lastUserMessage?.content ?? "";

    // Echo back exactly what the test asked the model to reply with,
    // simulating a well-behaved local model following instructions.
    const match = requested.match(/Reply with exactly:\s*(.+)$/);
    const content = match ? match[1].trim() : "L.E.O. OLLAMA PROVIDER READY";

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      message: { content },
      model: body.model ?? "qwen3:1.7b",
      prompt_eval_count: 12,
      eval_count: 6
    }));
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(11434, "127.0.0.1", () => {
  console.log("Mock Ollama server listening on http://127.0.0.1:11434");
});
