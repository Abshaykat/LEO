export interface PlannedAction {
  toolName: string;
  parameters: unknown;
  reason: string;
}

export interface WorkflowStep {
  id: string;
  action: PlannedAction;
}

export interface WorkflowPlan {
  workflowId: string;
  steps: WorkflowStep[];
  reason: string;
}

export interface ActionPlan {
  type: "response" | "action" | "workflow";
  response?: string;
  action?: PlannedAction;
  workflow?: WorkflowPlan;
}
