import type { AgentFactoryInput } from "./agent-policy.ts";
import { AgentFactory } from "./agent-factory.ts";
import type { ToolPermission } from "../permissions/tool-registry.ts";

export type WorkforceRole =
  | "research"
  | "browser"
  | "coding"
  | "system"
  | "office"
  | "data"
  | "ecommerce"
  | "marketing"
  | "trading";

export interface WorkforceAgent {
  role: WorkforceRole;
  definition: ReturnType<AgentFactory["createDraft"]>;
}

const ROLE_PURPOSES: Record<WorkforceRole, string> = {
  research: "Research, evidence gathering and source verification",
  browser: "Controlled browser and web research",
  coding: "Owner-approved coding assistance",
  system: "Controlled PC and system operations",
  office: "Controlled office/document automation",
  data: "Data processing, spreadsheets and reporting",
  ecommerce: "E-commerce research, store, supplier, inventory, courier and payment workflow assistance",
  marketing: "Marketing research, creative preparation and governed Meta Ads, TikTok Ads and Google Ads workflows",
  trading: "Market research, risk-aware analysis and governed broker/trading workflows"
};

const ROLE_CAPABILITIES: Record<WorkforceRole, string[]> = {
  research: ["web.search", "web.read"],
  browser: ["web.search", "web.read"],
  coding: ["local.file.read", "local.file.write", "local.command.execute", "system.software_engineering"],
  system: [
    "local.file.read",
    "local.file.write",
    "local.file.list",
    "local.command.execute",
    "system.software_management",
    "system.safe_update",
    "system.diagnostics"
  ],
  office: ["local.file.read", "local.file.write"],
  data: ["local.file.read", "local.file.write", "knowledge.continuous_update"],
  ecommerce: [
    "integration.ecommerce.store",
    "integration.business.crm",
    "integration.business.courier",
    "integration.business.payment"
  ],
  marketing: [
    "integration.marketing.meta_ads",
    "integration.marketing.tiktok_ads",
    "integration.marketing.google_ads"
  ],
  trading: ["integration.trading.broker"]
};

const ROLE_GOVERNANCE = [
  "Never self-grant permissions or create unrestricted agents.",
  "Prepare provider-specific actions through the controlled integration boundary.",
  "Require owner approval for consequential external actions.",
  "Verify provider results and record audit evidence.",
  "If an adapter or credential is unavailable, report the integration as unavailable instead of simulating success."
];

/**
 * A starting-point suggestion only. Creating an agent NEVER auto-grants
 * these — createAgent() always defaults an unspecified `permissions` list
 * to empty (least privilege). The owner reviews and explicitly passes
 * whichever of these (or others) they actually want to grant at
 * agent-creation time. This exists so the owner isn't guessing which
 * ToolPermission values a given role would plausibly need.
 */
const RECOMMENDED_PERMISSIONS: Record<WorkforceRole, ToolPermission[]> = {
  research: ["internet_access"],
  browser: ["browser_control", "internet_access"],
  coding: ["software_engineering", "execute_commands", "read_files", "write_files", "git_control"],
  system: ["execute_commands", "read_files", "write_files", "software_management", "diagnostics_management"],
  office: ["read_files", "write_files"],
  data: ["read_files", "write_files", "knowledge_management"],
  ecommerce: [],
  marketing: [],
  trading: []
};

export class AgentWorkforce {
  constructor(private readonly factory = new AgentFactory()) {}

  createRole(
    role: WorkforceRole,
    instructions: string,
    capabilities: string[] = []
  ): WorkforceAgent {
    const purpose = ROLE_PURPOSES[role];
    const mergedCapabilities = [
      ...new Set([
        ...ROLE_CAPABILITIES[role],
        ...capabilities
      ])
    ];

    const definition = this.factory.createDraft({
      name: `leo-${role}`,
      purpose,
      instructions: `${instructions.trim()}\n\nGovernance:\n${ROLE_GOVERNANCE.map(item => "- " + item).join("\n")}`,
      capabilities: mergedCapabilities,
      permissions: []
    });

    return { role, definition };
  }

  listRoleCapabilities(role: WorkforceRole): string[] {
    return [...ROLE_CAPABILITIES[role]];
  }

  /**
   * Advisory only (see RECOMMENDED_PERMISSIONS above) — the owner still
   * decides what to actually grant when calling agent-store's createAgent.
   */
  recommendedPermissions(role: WorkforceRole): ToolPermission[] {
    return [...RECOMMENDED_PERMISSIONS[role]];
  }

  canDelegateSensitiveAuthority(): false {
    return false;
  }
}
