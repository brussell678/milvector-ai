// The notice on the Decide tools (Retirement Pay Calculator, VA Rating
// Navigator, SBP Decision Advisor): shown above the inputs, in the chat views,
// and in the Word files the VA and SBP chats download. Wording approved by
// Brandon on 2026-11-23.
//
// The VA and SBP tools also ask each member to confirm it once
// (tool_acknowledgments, migration 0045). Raise the version when the wording
// changes in substance, and every member is asked again.

export type DecisionTool = "calculator" | "va" | "sbp";
export type AckTool = "va" | "sbp";

export const DECISION_NOTICE_VERSION = 1;

export const DECISION_NOTICE_TITLE = "Before you rely on this";

const BASE =
  "Educational information only. MilVector provides estimates and general information to help you prepare. It is not financial, tax, legal, or medical advice, and your decisions remain your own.";

const BY_TOOL: Record<DecisionTool, string> = {
  calculator: "DFAS and VA determine your actual pay.",
  va: "VA alone decides ratings. MilVector is not affiliated with VA or accredited to represent you; an accredited VSO can help you file for free.",
  sbp: "Your election is generally permanent. Confirm it with your installation retirement services officer before you sign the DD Form 2656.",
};

/** The notice for a tool, as one paragraph. */
export function decisionNotice(tool: DecisionTool): string {
  return `${BASE} ${BY_TOOL[tool]}`;
}

export const ACK_TOOLS: readonly AckTool[] = ["va", "sbp"];

export const ACK_LABEL = "I understand this is educational information, not advice, and that my decisions are my own.";

/** Sent by a tool route when the member has not confirmed the notice (the page asks first, so this is rare). */
export const ACK_NEEDED_MESSAGE = "Please reload the page and confirm the notice at the top before you continue.";
