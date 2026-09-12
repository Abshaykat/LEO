export type CapabilityKind =
  | "tool"
  | "workflow"
  | "agent"
  | "integration";

export type CapabilityStatus =
  | "available"
  | "unavailable"
  | "disabled";

export interface CapabilityRequirement {
  id: string;
  description: string;
  kind: CapabilityKind;
}

export interface CapabilityDefinition {
  id: string;
  name: string;
  description: string;
  kind: CapabilityKind;
  status: CapabilityStatus;
  tags: string[];
  consequential?: boolean;
}

export interface CapabilityGap {
  requirement: CapabilityRequirement;
  reason: "missing" | "unavailable" | "disabled";
}

export interface CapabilityDiscoveryResult {
  requirements: CapabilityRequirement[];
  available: CapabilityDefinition[];
  gaps: CapabilityGap[];
}
