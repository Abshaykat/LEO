export type ToolRisk = "low" | "medium" | "high" | "critical";

export type ToolPermission =
  | "read_files"
  | "write_files"
  | "execute_commands"
  | "internet_access"
  | "browser_control"
  | "git_control"
  | "docker_control"
  | "agent_management"
  | "permission_management"
  | "backup_management"
  | "software_management"
  | "system_configuration"
  | "software_engineering"
  | "system_update"
  | "knowledge_management"
  | "diagnostics_management"
  | "voice_interface"
  | "family_management"
  | "memory_management";

export interface ToolDefinition {
  name: string;
  description: string;
  consequence: string;
  risk: ToolRisk;
  permissions: ToolPermission[];
  requiresApproval: boolean;
  affectsExternalSystems: boolean;
  destructive: boolean;
  aiEnabled: boolean;
}

const tools: ToolDefinition[] = [
  {
    name: "pc.read_file",
    description: "Read an authorized local file.",
    consequence: "The specified local file will be read by L.E.O.",
    risk: "low",
    permissions: ["read_files"],
    requiresApproval: true,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "pc.write_file",
    description: "Create or modify an authorized workspace file.",
    consequence: "The specified authorized workspace file will be created or modified.",
    risk: "medium",
    permissions: ["write_files"],
    requiresApproval: true,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "pc.list_directory",
    description: "List an authorized local directory.",
    consequence: "Directory metadata will be read from the owner's computer.",
    risk: "low",
    permissions: ["read_files"],
    requiresApproval: false,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "pc.run_powershell",
    description: "Execute an owner-approved PowerShell script or command on Windows.",
    consequence: "The supplied PowerShell code will execute on the owner's computer.",
    risk: "high",
    permissions: ["execute_commands"],
    requiresApproval: true,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "pc.run_cmd",
    description: "Execute an owner-approved Windows Command Prompt command.",
    consequence: "The supplied CMD command will execute on the owner's computer.",
    risk: "high",
    permissions: ["execute_commands"],
    requiresApproval: true,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "pc.run_command",
    description: "Execute a policy-checked command on the owner's computer.",
    consequence: "The command will execute on the owner's computer.",
    risk: "high",
    permissions: ["execute_commands"],
    requiresApproval: true,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "browser.open",
    description: "Open a public website in the owner's default browser.",
    consequence: "A public URL will be opened in the owner's browser.",
    risk: "low",
    permissions: ["browser_control", "internet_access"],
    requiresApproval: false,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "browser.search",
    description: "Search the public web using a configured search engine URL.",
    consequence: "A public web search will be opened in the owner's browser.",
    risk: "low",
    permissions: ["browser_control", "internet_access"],
    requiresApproval: false,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "web.fetch",
    description: "Fetch a public HTTP(S) page for research.",
    consequence: "L.E.O. will make a read-only public web request.",
    risk: "medium",
    permissions: ["internet_access"],
    requiresApproval: false,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "git.status",
    description: "Inspect Git status in the authorized repository.",
    consequence: "Git metadata will be read from the authorized repository.",
    risk: "low",
    permissions: ["git_control"],
    requiresApproval: false,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "git.diff",
    description: "Inspect the Git diff in the authorized repository.",
    consequence: "Git changes will be read from the authorized repository.",
    risk: "low",
    permissions: ["git_control"],
    requiresApproval: false,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "git.commit",
    description: "Create a Git commit in the authorized repository.",
    consequence: "A new Git commit will be created in the authorized repository.",
    risk: "medium",
    permissions: ["git_control"],
    requiresApproval: true,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "docker.control",
    description: "Inspect or control an authorized Docker resource.",
    consequence: "The selected Docker resource may be inspected or changed.",
    risk: "high",
    permissions: ["docker_control"],
    requiresApproval: true,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "agent.list",
    description: "List locally configured L.E.O. agents.",
    consequence: "Local agent metadata will be read.",
    risk: "low",
    permissions: ["agent_management"],
    requiresApproval: false,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "agent.create",
    description: "Create a local L.E.O. agent definition.",
    consequence: "A new local agent definition will be created.",
    risk: "critical",
    permissions: ["agent_management"],
    requiresApproval: true,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "agent.update",
    description: "Update approved mutable fields of a local L.E.O. agent definition.",
    consequence: "The selected local agent's approved name, purpose, or instructions will be changed.",
    risk: "critical",
    permissions: ["agent_management"],
    requiresApproval: true,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "agent.activate",
    description: "Activate a local L.E.O. agent definition.",
    consequence: "The selected local draft agent will transition to active state.",
    risk: "critical",
    permissions: ["agent_management"],
    requiresApproval: true,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "agent.disable",
    description: "Disable a local L.E.O. agent definition.",
    consequence: "The selected local active agent will transition to disabled state.",
    risk: "critical",
    permissions: ["agent_management"],
    requiresApproval: true,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "agent.archive",
    description: "Archive a local L.E.O. agent definition.",
    consequence: "The selected local agent will transition to archived state.",
    risk: "critical",
    permissions: ["agent_management"],
    requiresApproval: true,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "agent.delete",
    description: "Delete a local L.E.O. agent definition.",
    consequence: "The selected local agent definition will be deleted.",
    risk: "critical",
    permissions: ["agent_management"],
    requiresApproval: true,
    affectsExternalSystems: false,
    destructive: true,
    aiEnabled: true
  },
  {
    name: "permissions.modify",
    description: "Modify an L.E.O. permission policy entry.",
    consequence: "A local L.E.O. permission policy will be changed.",
    risk: "critical",
    permissions: ["permission_management"],
    requiresApproval: true,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "backup.create",
    description: "Create an encrypted L.E.O. backup.",
    consequence: "An encrypted backup archive will be written to the configured backup root.",
    risk: "medium",
    permissions: ["backup_management", "read_files", "write_files"],
    requiresApproval: true,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "backup.verify",
    description: "Verify an L.E.O. backup manifest and hashes.",
    consequence: "Backup integrity metadata will be read and verified.",
    risk: "low",
    permissions: ["backup_management", "read_files"],
    requiresApproval: false,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },

  /*
   * ---- Layer 2: PC Setup / Configuration ----
   */
  {
    name: "pc.check_software",
    description: "Check whether a named package is installed via winget.",
    consequence: "Installed-software metadata will be read from the owner's computer.",
    risk: "low",
    permissions: ["software_management"],
    requiresApproval: false,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "pc.install_software",
    description: "Install a named package via winget (Windows Package Manager).",
    consequence: "The named software package will be downloaded and installed on the owner's computer.",
    risk: "high",
    permissions: ["software_management", "internet_access", "execute_commands"],
    requiresApproval: true,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "pc.set_environment_variable",
    description: "Set a non-protected user or machine environment variable.",
    consequence: "The named environment variable will be created or changed on the owner's computer.",
    risk: "high",
    permissions: ["system_configuration"],
    requiresApproval: true,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },

  /*
   * ---- Layer 2: Software-Engineering tool ----
   */
  {
    name: "swe.run_tests",
    description: "Run an allow-listed test command (npm/yarn/pnpm test, jest, pytest) and analyze failures.",
    consequence: "The project's test suite will execute inside the authorized workspace.",
    risk: "medium",
    permissions: ["software_engineering", "execute_commands"],
    requiresApproval: true,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "swe.run_build",
    description: "Run an allow-listed build command (npm/yarn/pnpm build, tsc) and report the outcome.",
    consequence: "The project's build command will execute inside the authorized workspace.",
    risk: "medium",
    permissions: ["software_engineering", "execute_commands"],
    requiresApproval: true,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },

  /*
   * ---- Layer 2: Safe Update workflow ----
   */
  {
    name: "system.check_updates",
    description: "List available software updates via winget upgrade.",
    consequence: "Available-update metadata will be read from the owner's computer.",
    risk: "low",
    permissions: ["system_update", "internet_access"],
    requiresApproval: false,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "system.apply_update",
    description: "Create and verify an encrypted backup, then apply a named software update via winget.",
    consequence: "An encrypted backup will be created and verified, then the named software will be updated on the owner's computer.",
    risk: "critical",
    permissions: ["system_update", "backup_management", "internet_access", "execute_commands"],
    requiresApproval: true,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },

  /*
   * ---- Layer 2: Continuous Knowledge Update ----
   */
  {
    name: "knowledge.add_document",
    description: "Add a document to the local knowledge store with a source and reliability rating.",
    consequence: "A new document will be written to the local knowledge store.",
    risk: "medium",
    permissions: ["knowledge_management", "write_files"],
    requiresApproval: true,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "knowledge.search",
    description: "Search the local knowledge store, ranked by topical similarity and source reliability.",
    consequence: "The local knowledge store will be read and ranked.",
    risk: "low",
    permissions: ["knowledge_management", "read_files"],
    requiresApproval: false,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "knowledge.find_outdated",
    description: "Find stale or superseded documents in the local knowledge store.",
    consequence: "The local knowledge store will be read to identify outdated documents.",
    risk: "low",
    permissions: ["knowledge_management", "read_files"],
    requiresApproval: false,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "knowledge.find_conflicts",
    description: "Find pairs of documents in the local knowledge store that appear to conflict.",
    consequence: "The local knowledge store will be read to identify conflicting documents.",
    risk: "low",
    permissions: ["knowledge_management", "read_files"],
    requiresApproval: false,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },

  /*
   * ---- Layer 2: Diagnostics & Repair ----
   */
  {
    name: "diagnostics.run_health_check",
    description: "Run a read-only health check across L.E.O.'s own configured directories and stores.",
    consequence: "L.E.O.'s own workspace files and directories will be read.",
    risk: "low",
    permissions: ["diagnostics_management", "read_files"],
    requiresApproval: false,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "diagnostics.plan_repairs",
    description: "Turn a health-check report into a repair plan, separating auto-fixable issues from owner-action items.",
    consequence: "A repair plan will be produced from the latest health-check report; nothing is changed yet.",
    risk: "low",
    permissions: ["diagnostics_management", "read_files"],
    requiresApproval: false,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "diagnostics.execute_repairs",
    description: "Execute the auto-fixable repair actions from a repair plan, strictly confined to LEO_ROOT.",
    consequence: "Low-risk internal L.E.O. files/directories confined to LEO_ROOT will be created or removed.",
    risk: "medium",
    permissions: ["diagnostics_management", "write_files"],
    requiresApproval: true,
    affectsExternalSystems: false,
    destructive: true,
    aiEnabled: true
  },

  /*
   * ---- Layer 2: Voice Interface (local Whisper STT + Piper TTS) ----
   * Voice is an input/output MODALITY, not a consequential action — using
   * your voice to talk to L.E.O. requires no more approval than typing
   * does. Nothing here ever leaves the machine; the tools only talk to the
   * local leo_voice service on 127.0.0.1.
   */
  {
    name: "voice.check_status",
    description: "Check whether the local voice service and its STT/TTS backends are ready.",
    consequence: "The local voice service's health endpoint will be queried.",
    risk: "low",
    permissions: ["voice_interface"],
    requiresApproval: false,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "voice.transcribe",
    description: "Transcribe locally-recorded owner audio to text via the local Whisper backend.",
    consequence: "Owner-provided audio will be transcribed locally; nothing leaves the machine.",
    risk: "low",
    permissions: ["voice_interface"],
    requiresApproval: false,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "voice.speak",
    description: "Synthesize L.E.O.'s spoken reply via the local Piper backend.",
    consequence: "Text will be synthesized to audio locally; nothing leaves the machine.",
    risk: "low",
    permissions: ["voice_interface"],
    requiresApproval: false,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },

  /*
   * ---- Layer 4: Voice/Biometric recognition ----
   * IMPORTANT: voice.identify_speaker's result is ADVISORY ONLY — a
   * best-guess personalization suggestion from a lightweight, non-secure
   * spectral fingerprint (see voice/leo_voice/speaker_id.py). It is NEVER
   * treated as authorization proof anywhere in this codebase — every real
   * permission decision still goes through identity/family-gate.ts with an
   * explicit, owner-configured userId.
   */
  {
    name: "voice.enroll_speaker",
    description: "Enroll a voice sample for a family member, for later personalization suggestions only.",
    consequence: "A voice sample will be linked to an existing family member id for future greeting/personalization hints.",
    risk: "medium",
    permissions: ["voice_interface", "family_management"],
    requiresApproval: true,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "voice.identify_speaker",
    description: "Suggest which enrolled family member a voice sample sounds most like (advisory only, not authorization).",
    consequence: "A voice sample will be compared against enrolled profiles locally; nothing leaves the machine.",
    risk: "low",
    permissions: ["voice_interface"],
    requiresApproval: false,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },

  /*
   * ---- Memory (Layer 0), with versioning ----
   * Remembering something the owner says ("mone rakho...") is core,
   * everyday conversational behavior — it should not require friction on
   * every use. Deleting a memory entirely (losing its version history for
   * good) is the one memory operation that does.
   */
  {
    name: "memory.create",
    description: "Save a new memory (fact, preference, or note) to L.E.O.'s memory store.",
    consequence: "A new memory will be saved for future recall.",
    risk: "low",
    permissions: ["memory_management", "write_files"],
    requiresApproval: false,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "memory.search",
    description: "Search L.E.O.'s memory store for relevant, previously-saved memories.",
    consequence: "The memory store will be read and ranked against the query.",
    risk: "low",
    permissions: ["memory_management", "read_files"],
    requiresApproval: false,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "memory.list",
    description: "List all memories currently saved for the owner.",
    consequence: "The memory store will be read in full.",
    risk: "low",
    permissions: ["memory_management", "read_files"],
    requiresApproval: false,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "memory.update",
    description: "Update an existing memory's content, category, or tags. The prior content is kept as version history, never silently lost.",
    consequence: "An existing memory will be updated; its previous content is preserved as a version history entry.",
    risk: "low",
    permissions: ["memory_management", "write_files"],
    requiresApproval: false,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "memory.get_history",
    description: "Retrieve the version history of a specific memory.",
    consequence: "A memory's prior versions will be read.",
    risk: "low",
    permissions: ["memory_management", "read_files"],
    requiresApproval: false,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "memory.delete",
    description: "Permanently delete a memory, including its full version history.",
    consequence: "A memory and its entire version history will be permanently removed.",
    risk: "medium",
    permissions: ["memory_management", "write_files"],
    requiresApproval: true,
    affectsExternalSystems: false,
    destructive: true,
    aiEnabled: true
  },

  /*
   * ---- Layer 4: Multi-user / Family identity ----
   * Managing WHO has WHAT scope is exactly as sensitive as managing an
   * agent's permissions or L.E.O.'s own permission policy — every one of
   * these requires explicit owner approval, unconditionally.
   */
  {
    name: "user.list",
    description: "List the family members L.E.O. currently recognizes and their granted scope.",
    consequence: "The list of household member identities and their permission grants will be read.",
    risk: "low",
    permissions: ["family_management"],
    requiresApproval: false,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "user.create",
    description: "Create a new family member identity with an explicit, limited permission grant.",
    consequence: "A new household member identity will be created with the exact permissions specified.",
    risk: "critical",
    permissions: ["family_management"],
    requiresApproval: true,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "user.update_permissions",
    description: "Change a family member's granted permission scope.",
    consequence: "A household member's permitted tool scope will change.",
    risk: "critical",
    permissions: ["family_management"],
    requiresApproval: true,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "user.disable",
    description: "Disable a family member identity, immediately revoking their ability to act.",
    consequence: "A household member will no longer be able to have any tool executed on their behalf.",
    risk: "medium",
    permissions: ["family_management"],
    requiresApproval: true,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "user.enable",
    description: "Re-enable a previously disabled family member identity.",
    consequence: "A household member will regain their previously granted permission scope.",
    risk: "high",
    permissions: ["family_management"],
    requiresApproval: true,
    affectsExternalSystems: false,
    destructive: false,
    aiEnabled: true
  },
  {
    name: "user.delete",
    description: "Permanently delete a family member identity.",
    consequence: "A household member's identity record will be permanently removed.",
    risk: "critical",
    permissions: ["family_management"],
    requiresApproval: true,
    affectsExternalSystems: false,
    destructive: true,
    aiEnabled: true
  }
];

export function getTool(name: string): ToolDefinition | undefined {
  return tools.find(tool => tool.name === name);
}

export function listTools(): ToolDefinition[] {
  return tools.map(tool => ({ ...tool, permissions: [...tool.permissions] }));
}

export function listAiTools(): ToolDefinition[] {
  return listTools().filter(tool => tool.aiEnabled);
}
