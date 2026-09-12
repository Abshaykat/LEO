import {
  configureLeoAI,
  getConfiguredAIProvider
} from "./leo-ai.ts";

import {
  LeoBrain
} from "../orchestrator/leo-brain.ts";

function assert(
  condition: boolean,
  message: string
): void {
  if (!condition) {
    throw new Error(
      `LEO AI INTEGRATION TEST FAILURE: ${message}`
    );
  }
}

async function main(): Promise<void> {

  console.log(
    "=== L.E.O. LOCAL AI BRAIN INTEGRATION TEST ==="
  );

  configureLeoAI({
    provider: "ollama",
    model: "qwen3:1.7b"
  });

  const provider =
    getConfiguredAIProvider(
      "ollama"
    );

  assert(
    provider.name === "ollama",
    "Ollama provider was not configured."
  );

  const brain =
    new LeoBrain(
      provider
    );

  const result =
    await brain.respond({
      userMessage:
        "Reply with exactly: L.E.O. BRAIN LOCAL AI READY"
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
    result.response
  );

  assert(
    result.provider === "ollama",
    "L.E.O. Brain did not use Ollama."
  );

  assert(
    result.model === "qwen3:1.7b",
    "L.E.O. Brain used the wrong model."
  );

  assert(
    result.response.includes(
      "L.E.O. BRAIN LOCAL AI READY"
    ),
    "Local AI response did not reach L.E.O. Brain."
  );

  console.log(
    "\nPASS: Provider registry configured Ollama."
  );

  console.log(
    "PASS: L.E.O. Brain used the local Ollama provider."
  );

  console.log(
    "PASS: Local model response reached L.E.O. Brain."
  );

  console.log(
    "\n=== L.E.O. LOCAL AI BRAIN INTEGRATION TEST PASSED ==="
  );
}

main().catch((error) => {

  console.error(
    "\n=== L.E.O. LOCAL AI BRAIN INTEGRATION TEST FAILED ==="
  );

  console.error(error);

  process.exit(1);
});
