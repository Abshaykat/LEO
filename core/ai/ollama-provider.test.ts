import {
  OllamaAIProvider
} from "./ollama-provider.ts";

function assert(
  condition: boolean,
  message: string
): void {
  if (!condition) {
    throw new Error(
      `OLLAMA PROVIDER TEST FAILURE: ${message}`
    );
  }
}

async function main(): Promise<void> {

  console.log(
    "=== L.E.O. OLLAMA PROVIDER TEST ==="
  );

  const provider =
    new OllamaAIProvider({
      model: "qwen3:1.7b"
    });

  const result =
    await provider.generate({
      messages: [
        {
          role: "system",
          content:
            "You are L.E.O., a private owner-controlled personal AI assistant."
        },
        {
          role: "user",
          content:
            "Reply with exactly: L.E.O. OLLAMA PROVIDER READY"
        }
      ]
    });

  console.log(
    "\nProvider:",
    result.provider
  );

  console.log(
    "Model:",
    result.model
  );

  console.log(
    "Response:",
    result.content
  );

  assert(
    result.provider === "ollama",
    "Incorrect provider name."
  );

  assert(
    result.model === "qwen3:1.7b",
    "Incorrect model name."
  );

  assert(
    result.content.includes(
      "L.E.O. OLLAMA PROVIDER READY"
    ),
    "Local model response was not returned correctly."
  );

  console.log(
    "\nPASS: Ollama provider reached the local model."
  );

  console.log(
    "PASS: AIProvider response contract is preserved."
  );

  console.log(
    "\n=== L.E.O. OLLAMA PROVIDER TEST PASSED ==="
  );
}

main().catch((error) => {

  console.error(
    "\n=== L.E.O. OLLAMA PROVIDER TEST FAILED ==="
  );

  console.error(error);

  process.exit(1);
});
