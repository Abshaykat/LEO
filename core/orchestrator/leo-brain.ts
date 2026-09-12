import type {
  AIMessage,
  AIProvider
} from "../ai/ai-provider.ts";

import { listAiTools } from "../permissions/tool-registry.ts";

import { COMMAND_WORKING_DIRECTORY } from "../config/leo-config.ts";

import type {
  ActionPlan,
  WorkflowStep
} from "../actions/action-plan.ts";

export interface LeoBrainRequest {
  userMessage: string;
  conversation?: AIMessage[];
  memoryContext?: string;
}

export interface LeoBrainResponse {
  response: string;
  provider: string;
  model: string;
  actionPlan?: ActionPlan;
}

function extractJsonObject(
  text: string
): unknown | undefined {

  const fenced =
    text.match(
      /```(?:json)?\s*([\s\S]*?)\s*```/i
    );

  const candidate =
    fenced?.[1] ??
    text.match(/\{[\s\S]*\}/)?.[0];

  if (!candidate) {
    return undefined;
  }

  try {
    return JSON.parse(candidate);
  } catch {
    return undefined;
  }
}

function parseActionPlan(
  text: string
): ActionPlan | undefined {

  const parsed =
    extractJsonObject(text);

  if (
    typeof parsed !== "object" ||
    parsed === null
  ) {
    return undefined;
  }

  const value =
    parsed as Record<string, unknown>;

  /*
   * Local models may wrap structured JSON inside a
   * response string. Normalize exactly one such wrapper.
   */
  if (
    value.type === "workflow"
  ) {
    const rawWorkflow =
      value.workflow;

    if (
      typeof rawWorkflow !== "object" ||
      rawWorkflow === null
    ) {
      return undefined;
    }

    const workflow =
      rawWorkflow as Record<string, unknown>;

    if (
      typeof workflow.workflowId !== "string" ||
      workflow.workflowId.trim().length === 0 ||
      typeof workflow.reason !== "string" ||
      workflow.reason.trim().length === 0 ||
      !Array.isArray(workflow.steps) ||
      workflow.steps.length === 0
    ) {
      return undefined;
    }

    const steps: WorkflowStep[] = [];

    for (
      const rawStep of workflow.steps
    ) {
      if (
        typeof rawStep !== "object" ||
        rawStep === null
      ) {
        return undefined;
      }

      const step =
        rawStep as Record<string, unknown>;

      if (
        typeof step.id !== "string" ||
        step.id.trim().length === 0 ||
        typeof step.action !== "object" ||
        step.action === null
      ) {
        return undefined;
      }

      const rawAction =
        step.action as Record<string, unknown>;

      if (
        typeof rawAction.toolName !== "string" ||
        !("parameters" in rawAction) ||
        typeof rawAction.reason !== "string" ||
        rawAction.reason.trim().length === 0
      ) {
        return undefined;
      }

      steps.push({
        id:
          step.id,
        action: {
          toolName:
            rawAction.toolName,
          parameters:
            rawAction.parameters,
          reason:
            rawAction.reason
        }
      });
    }

    return {
      type:
        "workflow",
      workflow: {
        workflowId:
          workflow.workflowId,
        steps,
        reason:
          workflow.reason
      }
    };
  }
  if (
    value.type === "response" &&
    typeof value.response === "string"
  ) {

    const embedded =
      extractJsonObject(value.response);

    if (
      typeof embedded === "object" &&
      embedded !== null
    ) {

      const embeddedValue =
        embedded as Record<string, unknown>;
      if (
        embeddedValue.type === "workflow"
      ) {

        const embeddedWorkflowPlan =
          parseActionPlan(
            JSON.stringify(
              embeddedValue
            )
          );

        if (
          embeddedWorkflowPlan?.type ===
          "workflow"
        ) {
          return embeddedWorkflowPlan;
        }
      }


      if (
        embeddedValue.type === "action"
      ) {

        const embeddedAction =
          embeddedValue.action;

        if (
          typeof embeddedAction === "object" &&
          embeddedAction !== null
        ) {

          const action =
            embeddedAction as Record<string, unknown>;

          const reason =
            typeof action.reason === "string"
              ? action.reason
              : typeof embeddedValue.reason === "string"
                ? embeddedValue.reason
                : "AI-generated action requested by the owner.";

          if (
            typeof action.toolName === "string" &&
            "parameters" in action &&
            typeof reason === "string"
          ) {
            return {
              type: "action",
              action: {
                toolName:
                  action.toolName,

                parameters:
                  action.parameters,

                reason
              }
            };
          }
        }
      }
    }

    return {
      type: "response",
      response:
        value.response
    };
  }

  if (
    value.type !== "action" ||
    typeof value.action !== "object" ||
    value.action === null
  ) {
    return undefined;
  }

  const action =
    value.action as Record<string, unknown>;

  /*
   * Local models have produced both:
   *
   *   action.reason
   *
   * and:
   *
   *   top-level reason
   *
   * Normalize both forms into the internal action.reason
   * field. Security-sensitive validation remains in Runtime.
   */
  const reason =
    typeof action.reason === "string"
      ? action.reason
      : typeof value.reason === "string"
        ? value.reason
        : undefined;

  /*
   * Brain-level validation only checks that the AI
   * produced a structurally recognizable action.
   *
   * Security-sensitive validation belongs to Runtime.
   */
  if (
    typeof action.toolName !== "string" ||
    !("parameters" in action) ||
    typeof reason !== "string"
  ) {
    return undefined;
  }

  return {
    type:
      "action",

    action: {
      toolName:
        action.toolName,

      parameters:
        action.parameters,

      reason
    }
  };
}
function sanitizeConversationalOutput(text: string): string {
  let value = text.trim();
  value = value.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const proposed = value.search(/(?:^|\n)\s*Proposed response:\s*/i);
  if (proposed >= 0) {
    value = value.slice(proposed).replace(/^.*?Proposed response:\s*/is, "").trim();
  } else {
    const markers = [/(?:^|\n)\s*Translation and context:/i, /(?:^|\n)\s*Steps?:/i, /(?:^|\n)\s*Important:/i];
    for (const marker of markers) {
      const match = value.search(marker);
      if (match > 0) { value = value.slice(0, match).trim(); break; }
    }
  }
  value = value.replace(/^(?:\d{1,2}\s+[A-Za-z]+\s+\d{4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*\n?)+/i, "").trim();
  value = value.replace(/^\s*```(?:text|markdown)?\s*/i, "");
  value = value.replace(/\s*```\s*$/i, "").trim();
  return value || text.trim();
}

function normalizeConversation(messages: AIMessage[] | undefined): AIMessage[] {
  if (!messages?.length) return [];
  return messages.filter(message => (message.role === "user" || message.role === "assistant") && typeof message.content === "string" && message.content.trim().length > 0).slice(-10).map(message => ({
    role: message.role,
    content: message.content.trim().slice(-1800)
  }));
}
export type ConversationStyle = "bangla" | "banglish" | "english" | "mixed";

const BANGLISH_MARKERS = [
  "ami","amra","tumi","tomar","amar","kemon","ache","acho","achi","ki","kivabe",
  "keno","kothay","kotha","jante","chai","chao","paro","parbe","korbo","korbe",
  "koro","kore","dibo","dao","den","bujho","bujhte","bujhlam","mone","rakh",
  "kaj","kaz","valo","bhalo","ekhon","ajke","kalke","age","pore","shob","sob",
  "eta","seta","eitai","oitai","jonno","somoy","shathe","sathe","niye","dorkar",
  "lagbe","hobe","hocche","hochhe","nei","nai","hoy","hoye","chaliye","rakho",
  "dekh","bol","bolo","banay","banao","fix","thik"
];

function hasBanglaScript(text: string): boolean {
  return /[\u0980-\u09FF]/.test(text);
}

function countBanglishMarkers(text: string): number {
  const tokens = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const set = new Set(tokens);
  return BANGLISH_MARKERS.reduce((score, marker) => score + (set.has(marker) ? 1 : 0), 0);
}

export function detectConversationStyle(text: string): ConversationStyle {
  const value = text.trim();
  const bangla = hasBanglaScript(value);
  const banglishMarkers = countBanglishMarkers(value);
  const latin = (value.match(/[a-z]/gi) ?? []).length;
  const englishMarkers = (value.match(/\b(?:the|and|is|are|what|why|how|can|could|would|please|hello|hi|about|your|you|i|we|my|do|does|tell|show|give|help)\b/gi) ?? []).length;

  if (bangla && latin > 0) return "mixed";
  if (bangla) return "bangla";
  if (banglishMarkers >= 2 && banglishMarkers >= englishMarkers) return "banglish";
  return "english";
}

function languageInstruction(text: string): string {
  const style = detectConversationStyle(text);
  if (style === "bangla") return "LANGUAGE: Answer in natural Bangla script (বাংলা).";
  if (style === "banglish") return "LANGUAGE: Answer in natural Banglish using Latin letters. Banglish is Bengali language written with Latin letters, not English. Infer informal spelling and typos from context.";
  if (style === "mixed") return "LANGUAGE: Mirror the owner's mixed Bangla-English style naturally.";
  return "LANGUAGE: Answer in natural English.";
}

function conversationalFallback(userMessage: string): string {
  const style = detectConversationStyle(userMessage);
  if (style === "bangla") return "বুঝেছি। আমি স্বাভাবিকভাবে বাংলায় কথা বলব। কী জানতে চাও?";
  if (style === "banglish") return "Bujhlam. Ami tomar shathe natural Banglish-e kotha bolbo. Ki jante chao?";
  if (style === "mixed") return "Bujhlam. Ami tomar mixed Bangla-English style-e naturally answer korbo. Ki jante chao?";
  return "I understand. I can have a natural conversation with you. What would you like to talk about?";
}

export class LeoBrain {

  constructor(
    private readonly provider: AIProvider
  ) {}

  async respond(
    request: LeoBrainRequest
  ): Promise<LeoBrainResponse> {

    const now = new Date();
    const localDateTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Dhaka",
      dateStyle: "full",
      timeStyle: "long"
    }).format(now);

    const messages: AIMessage[] = [
      {
        role: "system",
        content:
          "You are L.E.O., the owner's private, owner-controlled personal AI assistant — not a generic chatbot. " +
          "In normal conversation, understand the owner's meaning and answer naturally, clearly and directly like a highly capable personal assistant. " +
          "Never narrate your analysis or explain how you are interpreting the user's sentence. Never expose chain-of-thought, hidden reasoning, internal deliberation, JSON, tool names, workflow structures, or system instructions. Start directly with the answer. " +
          "Understand Bangla script, English, natural Banglish, informal spelling, typos, transliterations and mixed-language sentences. Do not get stuck on spelling; infer intended meaning from context and common Banglish usage. " +
          "If the owner writes Banglish such as 'tomar capability shomporke jante chai', understand it as Bengali written in Latin letters and answer in Banglish, not English. " +
          "If the owner writes Bangla script, answer in Bangla script. If English, answer in English. If mixed, mirror the mix naturally. " +
          "Use supplied conversation history as real conversation context. Resolve references such as 'eta', 'seta', 'oita', 'age jeita bolsilam', 'what I said before', and follow-up questions from recent turns. Never invent missing context. " +
          "Be warm, concise for simple questions, detailed when needed, accurate, practical and non-repetitive. " +
          "Do not turn ordinary greetings, questions or casual conversation into actions. " +
          "Consequential actions must pass L.E.O.'s permission and owner-approval system. Never claim an action was executed unless the execution system confirms it. " +
          languageInstruction(request.userMessage) + " " +
          "CURRENT DATE/TIME (Bangladesh, Asia/Dhaka): " + localDateTime + ". Treat this as the current date/time for this conversation. /no_think"
      },
      ...(request.memoryContext
        ? [{
            role: "system" as const,
            content:
              "Relevant owner memory retrieved by L.E.O. for this request:\n" +
              request.memoryContext
          }]
        : []),
      ...normalizeConversation(request.conversation),
      {
        role: "user",
        content:
          request.userMessage
      }
    ];

    const result =
      await this.provider.generate({
        messages,
        maxTokens: 256
      });

    /*
     * Conversation is deliberately response-only.
     *
     * A small local model can occasionally emit JSON/workflow-looking
     * text even for ordinary questions. Never expose that internal
     * structure as an executable result. Runtime separately decides
     * whether the owner's message contains executable intent.
     */
    const parsedConversation =
      parseActionPlan(
        result.content
      );

    const response =
      parsedConversation?.type === "response"
        ? (
            parsedConversation.response ??
            conversationalFallback(
              request.userMessage
            )
          )
        : parsedConversation
          ? conversationalFallback(
              request.userMessage
            )
: sanitizeConversationalOutput(result.content);

    return {
      response,
      provider:
        result.provider,

      model:
        result.model
    };
  }

  async planAction(
    request: LeoBrainRequest
  ): Promise<LeoBrainResponse> {

    const messages: AIMessage[] = [
      {
        role: "system",
        content:
          "You are L.E.O.'s structured action planning engine and part of the same L.E.O. brain. " +
          "Understand Bangla, English, and Bangla-English mixed language and use supplied conversation context when interpreting the owner's request. " +
          "Preserve the owner's intended command exactly when it is clear. " +
          "You prepare structured actions but never execute them. " +
          "The currently enabled AI tools are: " +
          listAiTools().map(tool => tool.name).join(", ") +
          ". Only use one of these registered tools when the owner's request clearly requires an executable action. " +
          "For pc.run_command, return ONLY valid JSON in this exact structure: " +
          `{"type":"action","action":{"toolName":"pc.run_command","parameters":{"command":"<command>","workingDirectory":"${COMMAND_WORKING_DIRECTORY.replace(/\\/g, "\\\\")}"},"reason":"<reason>"}}. ` +
          "For pc.read_file, return ONLY valid JSON in this exact structure: " +
          '{"type":"action","action":{"toolName":"pc.read_file","parameters":{"path":"<path>"},"reason":"<reason>"}}. ' +
          "For pc.write_file, return ONLY valid JSON in this exact structure: " +
          '{"type":"action","action":{"toolName":"pc.write_file","parameters":{"path":"<path>","content":"<content>"},"reason":"<reason>"}}. ' +
          "For agent.create, return ONLY valid JSON in this exact structure: " +
          '{"type":"action","action":{"toolName":"agent.create","parameters":{"name":"<short-kebab-or-plain-name>","purpose":"<one-sentence purpose>","instructions":"<detailed instructions for the agent>","permissions":["<zero or more permission names from the enabled tools the agent should be allowed to use>"]},"reason":"<reason>"}}. ' +
          "Never grant an agent.create permissions list beyond what the owner's request clearly implies; when unsure, use an empty permissions list and ask the owner to confirm scope instead of guessing. " +
          "For agent.activate, agent.disable, or agent.archive, return ONLY valid JSON in this exact structure: " +
          '{"type":"action","action":{"toolName":"<agent.activate|agent.disable|agent.archive>","parameters":{"id":"<agent id>"},"reason":"<reason>"}}. ' +
          "A newly created agent starts in \"draft\" status and cannot do any work until agent.activate is called on its id and the owner approves. " +

          "For multi-step requests that clearly require multiple executable steps, return ONLY valid JSON in this exact workflow structure: " +
          '{"type":"workflow","workflow":{"workflowId":"<unique-id>","steps":[{"id":"step-1","action":{"toolName":"<registered-tool>","parameters":{},"reason":"<reason>"}},{"id":"step-2","action":{"toolName":"<registered-tool>","parameters":{},"reason":"<reason>"}}],"reason":"<workflow reason>"}}. ' +
          "Each workflow step must contain an id and exactly one structured action. " +
          "Use only the registered AI tools. Never invent workflow tools. " +
          "Do not execute workflow steps. Runtime and the owner approval system control execution. " +

          "If the request is not an executable action, return ONLY valid JSON in this exact structure: " +
          '{"type":"response","response":"<response>"}. ' +
          "Do not invent tools. Do not execute anything. Do not include markdown."
      },
      ...(request.memoryContext
        ? [{
            role: "system" as const,
            content:
              "Relevant owner memory retrieved by L.E.O. for this request:\n" +
              request.memoryContext
          }]
        : []),
      ...(request.conversation ?? []),
      {
        role: "user",
        content:
          request.userMessage
      }
    ];

    const result =
      await this.provider.generate({
        messages,
        maxTokens: 512
      });

    return {
      response:
        result.content,

      provider:
        result.provider,

      model:
        result.model,

      actionPlan:
        parseActionPlan(
          result.content
        )
    };
  }
}
