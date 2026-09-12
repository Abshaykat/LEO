import { routeCommand } from "./command-router.ts";

const tests = [
  "run Write-Output Hello",
  "read file D:\\LEO\\README.md"
];

for (const input of tests) {
  console.log("\nINPUT:", input);
  console.dir(routeCommand(input), { depth: null });
}
