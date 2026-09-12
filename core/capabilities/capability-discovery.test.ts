import assert from "node:assert/strict";

import {
  createDefaultCapabilityRegistry
} from "./capability-registry.ts";

import {
  discoverCapabilities
} from "./capability-discovery.ts";

import {
  planCapabilities
} from "./capability-planner.ts";

async function main():
  Promise<void> {

  console.log(
    "=== L.E.O. CAPABILITY DISCOVERY TEST ==="
  );

  const registry =
    createDefaultCapabilityRegistry();

  const command =
    discoverCapabilities(
      'Run the PowerShell command Write-Output "ready"',
      registry
    );

  assert.equal(
    command.gaps.length,
    0
  );

  assert.ok(
    command.available.some(
      (item) =>
        item.id ===
        "local.command.execute"
    )
  );

  console.log(
    "PASS: Controlled command capability discovered."
  );

  const spreadsheet =
    planCapabilities(
      "Find products online and create an Excel spreadsheet report."
    );

  assert.ok(
    spreadsheet.available.includes(
      "web.search"
    )
  );

  assert.ok(
    spreadsheet.missing.includes(
      "spreadsheet.create"
    )
  );

  assert.equal(
    spreadsheet.nextAction,
    "create_capability"
  );

  console.log(
    "PASS: Missing spreadsheet capability detected."
  );

  const browser =
    planCapabilities(
      "Open the website and click the submit button."
    );

  assert.ok(
    browser.missing.includes(
      "browser.interact"
    )
  );

  console.log(
    "PASS: Missing browser interaction capability detected."
  );

  console.log(
    "=== CAPABILITY DISCOVERY TEST PASSED ==="
  );
}

main().catch(
  (error) => {

    console.error(
      error
    );

    process.exitCode =
      1;
  }
);
