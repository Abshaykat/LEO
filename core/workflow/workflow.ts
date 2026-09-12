export type WorkflowStatus =
  | "running"
  | "paused"
  | "completed"
  | "failed";

export interface WorkflowHistoryEntry {
  nodeId: string;
  attempt: number;
  status: "success" | "failure";
  error?: string;
}

export interface WorkflowState {
  [key: string]: unknown;
}

export interface WorkflowNodeResult<TState extends WorkflowState> {
  state: TState;
  output?: unknown;
}

export interface WorkflowNodeContext<TState extends WorkflowState> {
  state: TState;
  workflowId: string;
  nodeId: string;
  attempt: number;
  history: WorkflowHistoryEntry[];
  approvalId?: string;
}

export type WorkflowNodeHandler<
  TState extends WorkflowState
> = (
  context: WorkflowNodeContext<TState>
) => Promise<WorkflowNodeResult<TState>>;

export type WorkflowTransition<
  TState extends WorkflowState
> = (
  state: TState,
  output: unknown,
  error?: Error
) => string | null;

export interface WorkflowNode<
  TState extends WorkflowState
> {
  id: string;
  run: WorkflowNodeHandler<TState>;
  next?: WorkflowTransition<TState>;
  retry?: {
    maxAttempts: number;
  };
}

export interface WorkflowDefinition<
  TState extends WorkflowState
> {
  id: string;
  startNodeId: string;
  nodes: Record<string, WorkflowNode<TState>>;
  maxSteps?: number;
}

export interface WorkflowResult<
  TState extends WorkflowState
> {
  workflowId: string;
  status: WorkflowStatus;
  state: TState;
  history: WorkflowHistoryEntry[];
  currentNodeId: string | null;
  output?: unknown;
  error?: string;
  pendingApprovalId?: string;
  pendingApprovalAttempt?: number;
}

export class WorkflowPauseError extends Error {
  readonly approvalId: string;

  constructor(approvalId: string) {
    super(
      `Workflow is paused awaiting owner approval: ${approvalId}`
    );

    this.name = "WorkflowPauseError";
    this.approvalId = approvalId;
  }
}
