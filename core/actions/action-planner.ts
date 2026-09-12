import type {
  ActionPlan,
  PlannedAction
} from "./action-plan.ts";

import type {
  LeoBrain
} from "../orchestrator/leo-brain.ts";

import type {
  AIMessage
} from "../ai/ai-provider.ts";

import {
  planCapabilities
} from "../capabilities/capability-planner.ts";

import {
  COMMAND_WORKING_DIRECTORY
} from "../config/leo-config.ts";

export class ActionPlanner {

  plan(
    input: string
  ): ActionPlan {

    const trimmed =
      input.trim();

    if (!trimmed) {
      return {
        type: "response",
        response:
          "I need a command or request to continue."
      };
    }

    const looksLikeNaturalLanguageWorkflow =
      /\b(workflow|prepared|plan|steps?|please execute|please run)\b/i.test(trimmed);

    const runCommandMatch =
      !looksLikeNaturalLanguageWorkflow
        ? trimmed.match(/^run\s+(.+)$/i)
        : null;

    if (runCommandMatch) {

      const command =
        runCommandMatch[1].trim();

      const action: PlannedAction = {
        toolName:
          "pc.run_command",

        parameters: {
          command,
          workingDirectory:
            COMMAND_WORKING_DIRECTORY
        },

        reason:
          "Execute the command requested by the owner."
      };

      return {
        type: "action",
        action
      };
    }

    return {
      type: "response",
      response:
        `I understand the request, but I do not have a registered action for it yet: ${trimmed}`
    };
  }


  async planWithAI(
    input: string,
    brain: LeoBrain,
    conversation?: AIMessage[],
    memoryContext?: string
  ): Promise<ActionPlan> {

    const capabilityPlan =
      planCapabilities(input);

    if (
      capabilityPlan.nextAction ===
      "create_capability"
    ) {
      const missing =
        capabilityPlan.missing.join(", ");

      return {
        type: "response",
        response:
          `The requested task requires capabilities that are not currently available: ${missing}. ` +
          `L.E.O. will not execute the task until the required capability is available.`
      };
    }

    const aiResult =
      await brain.planAction({
        userMessage:
          input,
        conversation,
        memoryContext
      });

    if (aiResult.actionPlan) {

      const plan =
        aiResult.actionPlan;

      const singleCommandMatch =
        input.trim().match(
          /^run\s+(?:the\s+)?(?:powershell\s+)?command\s+(.+)$/i
        );

      if (
        singleCommandMatch &&
        plan.type === "workflow" &&
        plan.workflow?.steps.length === 1
      ) {

        const step =
          plan.workflow.steps[0];

        if (
          step?.action.toolName ===
          "pc.run_command"
        ) {

          const parameters =
            step.action.parameters;

          if (
            typeof parameters === "object" &&
            parameters !== null &&
            "command" in parameters
          ) {

            return {
              type:
                "action",

              action: {
                toolName:
                  "pc.run_command",

                parameters: {
                  ...(parameters as Record<string, unknown>),
                  workingDirectory:
                    COMMAND_WORKING_DIRECTORY
                },

                reason:
                  step.action.reason
              }
            };
          }
        }
      }

      return plan;
    }

    const explicitCommandMatch =
      input.trim().match(
        /^run\s+(?:the\s+)?(?:powershell\s+)?command\s+(.+)$/i
      );

    if (explicitCommandMatch) {

      const command =
        explicitCommandMatch[1].trim();

      if (command.length > 0) {

        return {
          type:
            "action",

          action: {
            toolName:
              "pc.run_command",

            parameters: {
              command,
              workingDirectory:
                COMMAND_WORKING_DIRECTORY
            },

            reason:
              "Execute the PowerShell command explicitly requested by the owner."
          }
        };
      }
    }

    return {
      type: "response",
      response:
        aiResult.response
    };
  }
}
