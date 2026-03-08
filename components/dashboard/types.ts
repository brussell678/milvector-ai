export type SupportingTask = {
  id?: string;
  title: string;
  description: string | null;
  order_index: number;
};

export type DashboardTask = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  phase_month: number;
  days_before_event: number | null;
  tool_link: string | null;
  knowledge_article: string | null;
  assistance_type: "tool" | "doc" | "none";
  assistance_ref: string | null;
  assistance_notes: string | null;
  transition_supporting_tasks: SupportingTask[];
};

export type DashboardLink = {
  id: string;
  title: string;
  category: string;
  description: string | null;
  url: string;
};

export type CategoryReadiness = {
  key: string;
  label: string;
  weight: number;
  completed: number;
  total: number;
  score: number;
};
