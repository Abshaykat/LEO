import { runCommand } from "./command-runner.ts";

async function main() {
  console.log("=== L.E.O. COMMAND RUNNER TEST ===");

  const result = await runCommand(
    'run Write-Output "Hello from L.E.O. Router"'
  );

  console.dir(result, { depth: null });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
