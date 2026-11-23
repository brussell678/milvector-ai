// The crisis check for the VA chat (docs/CHAT_TOOLS_PLAN.md, 4.5). Everything
// a member types there (a question, a description, the conditions list) is
// checked in the page, with no AI and nothing sent anywhere, and a match
// shows the Veterans Crisis Line at once. It leans toward showing the card:
// a member who sees it and did not need it has lost nothing.

const SIGNALS = [
  /\bsuicid/i,
  /\bkill(?:ing)?\s+my\s*self\b/i,
  /\bend(?:ing)?\s+(?:my\s+(?:own\s+)?life|it\s+all)\b/i,
  /\btak(?:e|ing)\s+my\s+(?:own\s+)?life\b/i,
  /\bwant(?:ed|s)?\s+to\s+die\b/i,
  /\b(?:don'?t|do\s+not|dont)\s+want\s+to\s+(?:live|be\s+alive|be\s+here|wake\s+up)\b/i,
  /\bbetter\s+off\s+dead\b/i,
  /\bno\s+(?:reason|point)\s+(?:to|in)\s+(?:live|living|going\s+on)\b/i,
  /\bself[-\s]?harm/i,
  /\b(?:hurt|harm|cut)(?:ting)?\s+my\s*self\b/i,
  /\bcan'?t\s+go\s+on\b|\bcannot\s+go\s+on\b/i,
];

export function crisisSignal(text: string): boolean {
  return SIGNALS.some((pattern) => pattern.test(text));
}

export const CRISIS_LINE = {
  title: "You are not alone",
  text: "If you are in crisis or thinking about suicide, call 988 and press 1, text 838255, or chat online with the Veterans Crisis Line. It is free and confidential, any time, day or night.",
  call: "tel:988",
  textLink: "sms:838255",
  chat: "https://www.veteranscrisisline.net/get-help-now/chat/",
};
