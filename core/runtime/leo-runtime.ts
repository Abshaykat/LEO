import type {
  LeoBrain,
  LeoBrainResponse
} from "../orchestrator/leo-brain.ts";

import {
  ActionPlanner
} from "../actions/action-planner.ts";

import {
  getTool
} from "../permissions/tool-registry.ts";

import {
  listAiTools
} from "../permissions/tool-registry.ts";

import {
  COMMAND_WORKING_DIRECTORY
} from "../config/leo-config.ts";

import {
  retrieveMemories
} from "../memory/memory-retriever.ts";

import {
  execute as executeTool
} from "../execution/execution-engine.ts";

import type {
  ExecutionDecision
} from "../execution/execution-gate.ts";

import type {
  ActionPlan,
  WorkflowPlan
} from "../actions/action-plan.ts";

import {
  workflowPlanToDefinition
} from "../workflow/workflow-plan-adapter.ts";

import {
  runWorkflow,
  resumeWorkflow
} from "../workflow/workflow-runner.ts";

import {
  findPausedWorkflowByApprovalId,
  deletePersistedWorkflow
} from "../workflow/workflow-store.ts";

import {
  createTraceId,
  recordDecisionTrace
} from "../audit/decision-trace.ts";

import type {
  OwnerAuthenticator
} from "../identity/owner-auth.ts";

import {
  getApprovalRequest
} from "../approvals/approval-engine.ts";

import {
  requestAsFamilyMember
} from "../identity/family-gate.ts";

export interface LeoRuntimeRequest {
  userMessage: string;
  source?: "text" | "voice" | "system";
  ownerAuthenticated?: boolean;
  ownerAuthToken?: string;

  ownerId?: string;
  /**
   * Set when this conversation is happening on behalf of a specific
   * household member (never the owner) — see identity/family-gate.ts.
   * Single-action requests are routed through that member's granted scope;
   * multi-step workflow plans are NOT yet supported for family members and
   * are denied with a clear message rather than silently running as the
   * owner (see the "workflow" branch below).
   */
  familyMemberId?: string;
  approvalId?: string;
  traceId?: string;
  conversation?: Parameters<
    LeoBrain["respond"]
  >[0]["conversation"];
}

/*
 * Runtime intent gate.
 *
 * Ordinary conversation must stay conversational even when the local model
 * hallucinates a workflow/action JSON object. Only requests containing a
 * clear executable intent are allowed into the structured action planner.
 * This is a safety/usability gate, not an authorization mechanism.
 */
function looksLikeExecutableRequest(
  input: string
): boolean {
  const text =
    input.trim().toLowerCase();

  if (!text) {
    return false;
  }

  const executableIntent =
    /\b(?:open|close|run|execute|create|make|write|read|edit|delete|remove|move|copy|rename|install|uninstall|start|stop|restart|shutdown|sleep|test|check|fix|repair|update|build|deploy|clone|commit|push|pull|checkout|browse|visit|click|download|upload|launch|kill|terminate|automate|schedule|action|workflow|run|powershell|power\s*shell|cmd|command|notepad|github|git|docker|browser|file|folder|workflow|script|terminal)\b/i;

  const banglaExecutableIntent =
    /(খুলো|খুলে|চালাও|রান|এক্সিকিউট|করো|করে দাও|তৈরি করো|বানাও|লিখো|পড়ো|পড়ো|এডিট|ডিলিট|মুছে|সরাও|কপি|নাম বদল|ইনস্টল|আনইনস্টল|শুরু করো|বন্ধ করো|রিস্টার্ট|শাটডাউন|ঘুম|টেস্ট করো|চেক করো|ফিক্স করো|ঠিক করো|আপডেট করো|বিল্ড করো|ডিপ্লয়|ক্লোন|কমিট|পুশ|পুল|ব্রাউজার|ফাইল|ফোল্ডার|ওয়ার্কফ্লো|ওয়ার্কফ্লো|স্ক্রিপ্ট|কমান্ড|পাওয়ারশেল|পাওয়ারশেল|সিএমডি|নোটপ্যাড|গিটহাব|গিট|ডকার)/i;

  return (
    executableIntent.test(text) ||
    banglaExecutableIntent.test(text)
  );
}

export type LeoRuntimeResult =
  | {
      type: "response";
      response: string;
      brain?: LeoBrainResponse;
    }
  | {
      type: "approval_required";
      response: string;
      approvalId: string;
      toolName: string;
      traceId: string;
    }
  | {
      type: "execution";
      response: string;
      result: unknown;
      toolName: string;
    }
  | {
      type: "denied";
      response: string;
      toolName: string;
    };

export class LeoRuntime {

  private readonly planner: ActionPlanner;

  constructor(
    private readonly brain: LeoBrain,
    private readonly ownerAuthenticator: OwnerAuthenticator
  ) {
    this.planner =
      new ActionPlanner();
  }
  private getWorkflowToolName(
    plan: WorkflowPlan,
    nodeId: string | null
  ): string {

    const step =
      plan.steps.find(
        candidate =>
          candidate.id === nodeId
      );

    return (
      step?.action.toolName ??
      "workflow"
    );
  }

  private async traceValidationFailure(
    traceId: string,
    tool: string,
    reason: string
  ): Promise<void> {

    await recordDecisionTrace({
      traceId,
      stage:
        "action_validated",
      outcome:
        "deny",
      tool,
      reason
    });
  }

  async process(
    request: LeoRuntimeRequest
  ): Promise<LeoRuntimeResult> {

    const traceId =
      request.traceId ??
      createTraceId();
    let plan: ActionPlan;
    let brainResponse:
      LeoBrainResponse | undefined;

    const ownerAuth =
      this.ownerAuthenticator.authenticate(
        request.ownerAuthToken
      );

    await recordDecisionTrace({
      traceId,
      stage:
        "authorization",
      outcome:
        ownerAuth.authenticated
          ? "allow"
          : "deny",
      details: {
        method:
          ownerAuth.method
      }
    });

    await recordDecisionTrace({
      traceId,
      stage:
        "request_received",
      outcome:
        "pending",
      details: {
        source:
          request.source ?? "text",
      }
    });

    /*
     * Approval rehydration path.
     *
     * Once an approvalId exists, the approved persisted action
     * is the source of truth. L.E.O. must NOT re-plan the
     * natural-language request with the AI.
     */
    if (request.approvalId) {

      const approvedRequest =
        await getApprovalRequest(
          request.approvalId
        );

      if (!approvedRequest) {

        await this.traceValidationFailure(
          traceId,
          "unknown",
          "Approval request was not found."
        );

        return {
          type:
            "denied",

          response:
            "The approval request was not found.",

          toolName:
            "unknown"
        };
      }

      if (approvedRequest.status !== "approved") {
        await this.traceValidationFailure(
          traceId,
          approvedRequest.tool,
          `Approval is not executable. Current status: ${approvedRequest.status}.`
        );
        return {
          type: "denied",
          response:
            `Approval is not executable. Current status: ${approvedRequest.status}.`,
          toolName: approvedRequest.tool
        };
      }

      const pausedWorkflow =
        await findPausedWorkflowByApprovalId(
          request.approvalId
        );

      if (pausedWorkflow) {

        const persistedPlan =
          pausedWorkflow.state[
            "__leoWorkflowPlan"
          ];

        if (
          typeof persistedPlan !==
            "object" ||
          persistedPlan === null
        ) {

          await this.traceValidationFailure(
            traceId,
            "workflow",
            "Paused workflow is missing its persisted WorkflowPlan."
          );

          return {
            type:
              "denied",

            response:
              "The paused workflow could not be restored safely.",

            toolName:
              "workflow"
          };
        }

        const workflowPlan =
          persistedPlan as WorkflowPlan;

        const executionContext = {
          source:
            request.source ?? "text",

          ownerAuthenticated:
            ownerAuth.authenticated
        };

        const definition =
          workflowPlanToDefinition(
            workflowPlan,
            executionContext
          );

        const resumed =
          await resumeWorkflow(
            definition,
            pausedWorkflow
          );

        if (
          resumed.status ===
          "paused"
        ) {

          return {
            type:
              "approval_required",

            response:
              "The workflow requires your approval before continuing.",

            approvalId:
              resumed.pendingApprovalId!,

            toolName:
              this.getWorkflowToolName(
                workflowPlan,
                resumed.currentNodeId
              ),

            traceId
          };
        }

        if (
          resumed.status ===
          "failed"
        ) {
          await deletePersistedWorkflow(
            resumed.workflowId
          );

          return {
            type:
              "denied",

            response:
              resumed.error ??
              "The workflow failed during execution.",

            toolName:
              this.getWorkflowToolName(
                workflowPlan,
                resumed.currentNodeId
              )
          };
        }

        await deletePersistedWorkflow(
          resumed.workflowId
        );

        return {
          type:
            "execution",

          response:
            "The approved workflow executed successfully.",

          result:
            resumed.output,

          toolName:
            this.getWorkflowToolName(
              workflowPlan,
              workflowPlan.steps[
                workflowPlan.steps.length - 1
              ]?.id ?? null
            )
        };
      }



      plan = {
        type:
          "action",

        action: {
          toolName:
            approvedRequest.tool,

          parameters:
            approvedRequest.parameters,

          reason:
            approvedRequest.reason
        }
      } as ActionPlan;



    } else {

      /*
       * Normal first-pass planning.
       *
       * Natural-language requests may use the AI brain.
       * Deterministic "run ..." commands keep their existing
       * planner path.
       */
      const deterministicPlan =
        this.planner.plan(
          request.userMessage
        );

      if (
        deterministicPlan.type ===
        "action"
      ) {

        plan =
          deterministicPlan;

      } else {

        const authenticatedOwnerId =
          ownerAuth.authenticated
            ? ownerAuth.ownerId
            : undefined;

        const memoryResults =
          authenticatedOwnerId
            ? await retrieveMemories({
                ownerId:
                  authenticatedOwnerId,

                query:
                  request.userMessage,

                ownerAuthenticated:
                  true,

                limit:
                  5
              })
            : [];

        const memoryContext =
          memoryResults.length > 0
            ? memoryResults
                .map(
                  result =>
                    `[${result.memory.category}] ${result.memory.content}`
                )
                .join("\n")
            : undefined;

        /*
         * First answer normally as a conversational assistant.
         * Only clear executable intent is allowed to trigger the
         * structured action planner. This prevents ordinary questions
         * such as "How are you?" or "Who am I?" from becoming workflows.
         */
        brainResponse =
          await this.brain.respond({
            userMessage:
              request.userMessage,

            conversation:
              request.conversation,

            memoryContext
          });

        if (
          !looksLikeExecutableRequest(
            request.userMessage
          )
        ) {
          return {
            type:
              "response",

            response:
              brainResponse.response,

            brain:
              brainResponse
          };
        }

        const actionPlan =
          brainResponse.actionPlan ??
          await this.planner.planWithAI(
            request.userMessage,
            this.brain,
            request.conversation,
            memoryContext
          );

        if (
          actionPlan.type ===
          "action" ||
          actionPlan.type ===
          "workflow"
        ) {
          plan =
            actionPlan;

        } else {
          /*
           * If the action planner cannot construct a governed action,
           * preserve the conversational answer instead of exposing an
           * internal planner fallback to the owner.
           */
          return {
            type:
              "response",

            response:
              brainResponse.response,

            brain:
              brainResponse
          };
        }
      }
    }

    if (plan.type === "response") {

      if (
        typeof plan.response !==
        "string" ||
        plan.response.trim().length === 0
      ) {
        return {
          type:
            "denied",

          response:
            "L.E.O. received an invalid response plan.",

          toolName:
            "unknown"
        };
      }

      return {
        type:
          "response",

        response:
          plan.response
      };
    }

        if (
      plan.type ===
      "workflow"
    ) {

      if (
        !plan.workflow
      ) {

        await this.traceValidationFailure(
          traceId,
          "workflow",
          "Workflow plan is missing its workflow definition."
        );

        return {
          type:
            "denied",

          response:
            "L.E.O. received an invalid workflow plan.",

          toolName:
            "workflow"
        };
      }

      if (
        !ownerAuth.authenticated
      ) {

        await this.traceValidationFailure(
          traceId,
          "workflow",
          "Owner authentication is required before workflow execution."
        );

        return {
          type:
            "denied",

          response:
            "Owner authentication is required before workflow execution.",

          toolName:
            "workflow"
        };
      }

      if (
        request.familyMemberId
      ) {

        await this.traceValidationFailure(
          traceId,
          "workflow",
          "Multi-step workflow plans are not yet supported for family member requests."
        );

        return {
          type:
            "denied",

          response:
            "This request needs several steps, which isn't yet supported for family member accounts — please ask the owner directly.",

          toolName:
            "workflow"
        };
      }

      const workflowPlan =
        plan.workflow;

      const initialState = {
        __leoWorkflowPlan:
          workflowPlan
      };

      const executionContext = {
        source:
          request.source ?? "text",

        ownerAuthenticated:
          ownerAuth.authenticated
      };

      const definition =
        workflowPlanToDefinition(
          workflowPlan,
          executionContext
        );

      const workflowResult =
        await runWorkflow(
          definition,
          initialState
        );

      if (
        workflowResult.status ===
        "paused"
      ) {

        return {
          type:
            "approval_required",

          response:
            "The workflow is prepared and requires your approval before execution.",

          approvalId:
            workflowResult.pendingApprovalId!,

          toolName:
            this.getWorkflowToolName(
              workflowPlan,
              workflowResult.currentNodeId
            ),

          traceId
        };
      }

      if (
        workflowResult.status ===
        "failed"
      ) {
        await deletePersistedWorkflow(
          workflowResult.workflowId
        );

        return {
          type:
            "denied",

          response:
            workflowResult.error ??
            "The workflow failed during execution.",

          toolName:
            this.getWorkflowToolName(
              workflowPlan,
              workflowResult.currentNodeId
            )
        };
      }

      await deletePersistedWorkflow(
        workflowResult.workflowId
      );

      return {
        type:
          "execution",

        response:
          "The workflow executed successfully.",

        result:
          workflowResult.output,

        toolName:
          this.getWorkflowToolName(
            workflowPlan,
            workflowPlan.steps[
              workflowPlan.steps.length - 1
            ]?.id ?? null
          )
      };
    }
if (!plan.action) {

      return {
        type:
          "denied",

        response:
          "L.E.O. could not construct a valid executable action.",

        toolName:
          "unknown"
      };
    }


    const action =
      plan.action;

    await recordDecisionTrace({
      traceId,
      stage: "action_planned",
      outcome: "pending",
      tool: action.toolName,
      reason: action.reason
    });

    /*
     * Runtime defense-in-depth validation.
     *
     * AI-generated actions must never bypass the
     * runtime execution boundary, even if an invalid
     * ActionPlan reaches this point.
     *
     * Only the explicitly enabled AI tool subset may
     * enter the execution pipeline.
     */
    const aiToolNames =
      new Set(
        listAiTools().map(tool => tool.name)
      );

    if (
      !aiToolNames.has(
        action.toolName
      )
    ) {
      await this.traceValidationFailure(
        traceId,
        action.toolName,
        "Unsupported action tool."
      );

      return {
        type:
          "denied",

        response:
          "L.E.O. rejected an unsupported action tool.",

        toolName:
          action.toolName
      };
    }

    if (
      typeof action.parameters !==
      "object" ||
      action.parameters === null
    ) {
      await this.traceValidationFailure(
        traceId,
        action.toolName,
        "Invalid action parameters."
      );

      return {
        type:
          "denied",

        response:
          "L.E.O. rejected invalid action parameters.",

        toolName:
          action.toolName
      };
    }

    const parameters =
      action.parameters as Record<string, unknown>;

    if (
      action.toolName ===
      "pc.run_command"
    ) {

      if (
        typeof parameters.command !==
          "string" ||
        parameters.command.trim().length === 0
      ) {
        await this.traceValidationFailure(
          traceId,
          action.toolName,
          "Empty or invalid command."
        );

        return {
          type:
            "denied",

          response:
            "L.E.O. rejected an empty or invalid command.",

          toolName:
            action.toolName
        };
      }

      if (
        typeof parameters.workingDirectory === "string" &&
        !(
          parameters.workingDirectory === COMMAND_WORKING_DIRECTORY ||
          (
            process.platform !== "win32" &&
            /^D:\\LEO(?:\\|$)/i.test(
              parameters.workingDirectory
            )
          )
        )
      ) {
        await this.traceValidationFailure(
          traceId,
          action.toolName,
          "Uncontrolled working directory."
        );

        return {
          type: "denied",
          response:
            "L.E.O. rejected an uncontrolled working directory.",
          toolName: action.toolName
        };
      }
    }

    if (
      action.toolName ===
      "pc.read_file"
    ) {

      if (
        typeof parameters.path !==
          "string" ||
        parameters.path.trim().length === 0
      ) {
        await this.traceValidationFailure(
          traceId,
          action.toolName,
          "Missing or invalid file path."
        );

        return {
          type:
            "denied",

          response:
            "L.E.O. rejected an empty or invalid file path.",

          toolName:
            action.toolName
        };
      }
    }

    if (
      action.toolName ===
      "pc.write_file"
    ) {

      if (
        typeof parameters.path !==
          "string" ||
        parameters.path.trim().length === 0
      ) {
        await this.traceValidationFailure(
          traceId,
          action.toolName,
          "Missing or invalid file path."
        );

        return {
          type:
            "denied",

          response:
            "L.E.O. rejected an empty or invalid file path.",

          toolName:
            action.toolName
        };
      }

      if (
        typeof parameters.content !==
        "string"
      ) {
        await this.traceValidationFailure(
          traceId,
          action.toolName,
          "Missing or invalid file content."
        );

        return {
          type:
            "denied",

          response:
            "L.E.O. rejected invalid file content.",

          toolName:
            action.toolName
        };
      }
    }

    if (
      typeof action.reason !==
        "string" ||
      action.reason.trim().length === 0
    ) {
      await this.traceValidationFailure(
        traceId,
        action.toolName,
        "Missing or invalid action reason."
      );

      return {
        type:
          "denied",

        response:
          "L.E.O. rejected an action without a valid reason.",

        toolName:
          action.toolName
      };
    }

    if (!ownerAuth.authenticated) {

      await this.traceValidationFailure(
        traceId,
        plan.action.toolName,
        "Owner authentication is required before executable actions."
      );

      return {
        type:
          "denied",

        response:
          "Owner authentication is required before executable actions.",

        toolName:
          plan.action.toolName
      };
    }
    await recordDecisionTrace({
      traceId,
      stage:
        "action_validated",
      outcome:
        "allow",
      tool:
        action.toolName,
      reason:
        action.reason,
      details: {
        parametersValidated:
          true,
        workingDirectoryControlled:
          true
      }
    });

    const tool =
      getTool(
        action.toolName
      );

    if (!tool) {

      return {
        type:
          "denied",

        response:
          `The requested tool is not registered: ${action.toolName}`,

        toolName:
          action.toolName
      };
    }

    /*
     * memory.* tools need to know WHICH owner's store to read/write, but
     * the AI planner has no reliable way to know that id — and using the
     * wrong one would silently break memory recall (retrieveMemories
     * filters by exact ownerId match). The authenticated session already
     * knows it, so inject it here rather than trusting the plan's guess.
     * An explicit ownerId already present in the plan's parameters (e.g.
     * a family member's own request, once that's supported) is preserved.
     */
    if (
      tool.name.startsWith("memory.") &&
      ownerAuth.authenticated &&
      (action.parameters as Record<string, unknown>).ownerId === undefined
    ) {
      (action.parameters as Record<string, unknown>).ownerId = ownerAuth.ownerId;
    }

    const decision:
      ExecutionDecision =
      request.familyMemberId
        ? await requestAsFamilyMember({
            userId:
              request.familyMemberId,

            toolName:
              tool.name,

            parameters:
              action.parameters,

            reason:
              action.reason,

            context: {
              source:
                request.source ?? "text",

              ownerAuthenticated:
                ownerAuth.authenticated
            },

            approvalId:
              request.approvalId,

            traceId:
              traceId
          })
        : await executeTool({
            toolName:
              tool.name,

            parameters:
              action.parameters,

            reason:
              action.reason,

            context: {
              source:
                request.source ?? "text",

              ownerAuthenticated:
                ownerAuth.authenticated
            },

            approvalId:
              request.approvalId,

            traceId:
              traceId
          });

    if (
      decision.decision ===
      "require_approval"
    ) {

      return {
        type:
          "approval_required",

        response:
          "The action is prepared and requires your approval before execution.",

        approvalId:
          decision.approvalId,

        toolName:
          tool.name,

        traceId
      };
    }

    if (
      decision.decision ===
      "deny"
    ) {

      return {
        type:
          "denied",

        response:
          decision.reason,

        toolName:
          tool.name
      };
    }

    return {
      type:
        "execution",

      response:
        "The approved action was executed successfully.",

      result:
        decision.result,

      toolName:
        tool.name
    };
  }
}
