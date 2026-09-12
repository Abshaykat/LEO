import { LeoBrain } from "./leo-brain.ts";
import { TestAIProvider } from "../ai/test-provider.ts";

function assert(
  condition: boolean,
  message: string
): void {
  if (!condition) {
    throw new Error(
      `AI BRAIN TEST FAILURE: ${message}`
    );
  }
}

async function main(): Promise<void> {

  console.log(
    "=== L.E.O. BRAIN TEST ==="
  );

  const brain =
    new LeoBrain(
      new TestAIProvider()
    );

  const result =
    await brain.respond({
      userMessage:
        "Hello L.E.O."
    });

  assert(
    result.provider === "test",
    "Provider was not returned."
  );

  assert(
    result.model === "test-model",
    "Model was not returned."
  );

  assert(
    result.response.includes(
      "Hello L.E.O."
    ),
    "User message did not reach provider."
  );

  console.log(
    "PASS: Provider abstraction works."
  );

  console.log(
    "PASS: L.E.O. brain received user input."
  );

  console.log(
    "PASS: Provider/model metadata returned."
  );

  console.log(
    "\n=== L.E.O. BRAIN TEST PASSED ==="
  );
}

main().catch((error) => {

  console.error(
    "\n=== L.E.O. BRAIN TEST FAILED ==="
  );

  console.error(error);

  process.exit(1);
});
