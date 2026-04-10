export type MessageBoardLinkOption = {
  key: string;
  label: string;
  path: string;
  resourceType: "tool" | "knowledge_base" | "documents" | "library" | "profile" | "support";
  toolSlug?: string | null;
};

export const MESSAGE_BOARD_LINK_OPTIONS: MessageBoardLinkOption[] = [
  { key: "master-resume", label: "Master Resume Builder", path: "/app/tools/fitrep-bullets", resourceType: "tool", toolSlug: "fitrep_bullets" },
  { key: "mos-translator", label: "MOS Translator", path: "/app/tools/mos-translator", resourceType: "tool", toolSlug: "mos_translator" },
  { key: "jd-decoder", label: "Job Description Decoder", path: "/app/tools/jd-decoder", resourceType: "tool", toolSlug: "jd_decoder" },
  { key: "resume-targeter", label: "Resume Targeter", path: "/app/tools/resume-targeter", resourceType: "tool", toolSlug: "resume_targeter" },
  { key: "linkedin-builder", label: "LinkedIn Profile Builder", path: "/app/tools/linkedin-builder", resourceType: "tool", toolSlug: "linkedin_builder" },
  { key: "profile", label: "Profile Workspace", path: "/app/profile", resourceType: "profile" },
  { key: "documents", label: "Documents Workspace", path: "/app/documents", resourceType: "documents" },
  { key: "library", label: "Library", path: "/app/library", resourceType: "library" },
  { key: "knowledge-base", label: "Knowledge Base", path: "/knowledge-base", resourceType: "knowledge_base" },
  { key: "support", label: "Support Center", path: "/app/feedback", resourceType: "support" },
];

export const MESSAGE_BOARD_REPORT_REASONS = [
  "Spam or duplicate",
  "Harassment or abuse",
  "Off-topic or low context",
  "Sensitive personal information",
  "Unsafe or misleading advice",
] as const;

export const MESSAGE_BOARD_STARTER_THREADS = [
  {
    title: "Welcome / Introduce Yourself",
    body:
      "Share where you are in your transition, what branch you served in, and what kind of support or direction you are looking for from the MilVector community.",
  },
  {
    title: "Weekly Wins",
    body:
      "Use this thread to share progress, milestones, interviews, job offers, completed claims, or any transition win that could help motivate the next person.",
  },
  {
    title: "Feature Requests",
    body:
      "Tell us what tools, exports, workflows, or guidance would make MilVector more useful in your transition planning and job search.",
  },
  {
    title: "Ask A Question Here",
    body:
      "If you are not sure where to start, drop your transition question here and the community can help point you toward the right MilVector tool, document, or next step.",
  },
  {
    title: "Transition Lessons Learned",
    body:
      "Share field notes from interviews, resume work, SkillBridge, benefits, federal hiring, or anything else that would help other members make smarter decisions.",
  },
];

export function getMessageBoardLinkOption(key?: string | null) {
  if (!key) return null;
  return MESSAGE_BOARD_LINK_OPTIONS.find((option) => option.key === key) ?? null;
}

export function normalizeMessageBoardText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
