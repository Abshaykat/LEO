import assert from "node:assert/strict";
import { AgentWorkforce } from "./agent-workforce.ts";

async function main(): Promise<void> {
  const workforce = new AgentWorkforce();

  const marketing = workforce.createRole("marketing", "Prepare and execute owner-approved campaigns.");
  assert.deepEqual(marketing.definition.permissions, []);
  assert(marketing.definition.capabilities.includes("integration.marketing.meta_ads"));
  assert(marketing.definition.capabilities.includes("integration.marketing.tiktok_ads"));
  assert(marketing.definition.capabilities.includes("integration.marketing.google_ads"));

  const trading = workforce.createRole("trading", "Perform market analysis and prepare broker actions.");
  assert(trading.definition.capabilities.includes("integration.trading.broker"));

  const ecommerce = workforce.createRole("ecommerce", "Manage approved commerce workflows.");
  for (const id of [
    "integration.business.crm",
    "integration.business.courier",
    "integration.business.payment",
    "integration.ecommerce.store"
  ]) {
    assert(ecommerce.definition.capabilities.includes(id));
  }

  assert.equal(marketing.definition.securityPolicy.allowExternalSystemActions, false);
  assert.equal(marketing.definition.securityPolicy.allowAutonomousExecution, false);
  assert.equal(workforce.canDelegateSensitiveAuthority(), false);

  console.log("PASS: governed workforce integration role mapping.");
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
