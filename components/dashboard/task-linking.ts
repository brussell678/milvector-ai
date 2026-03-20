import type { DashboardLink, DashboardTask } from "./types";

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function categoryMatches(link: DashboardLink, categories: string[]) {
  const category = normalize(link.category);
  return categories.includes(category);
}

export function getTaskLinkCategories(task: DashboardTask) {
  const text = `${task.title} ${task.description ?? ""} ${task.assistance_notes ?? ""}`.toLowerCase();
  const categories = new Set<string>();

  if (task.category) categories.add(normalize(task.category));

  if (/trs|capstone|milconnect|outbound interview|dd form 2648|co verification/.test(text)) {
    categories.add("trs");
    categories.add("registration");
  }

  if (/appendix j|epar|retirement request/.test(text)) {
    categories.add("appendix j submission");
  }

  if (/va|bdd|vso|disability|final physical|pha|dd ?214|veteran health|veteran id/.test(text)) {
    categories.add("va reference");
  }

  if (/medical|dental|tricare|deers|benefeds/.test(text)) {
    categories.add("medical");
    categories.add("va reference");
  }

  if (/skillbridge/.test(text)) {
    categories.add("skillbridge");
    categories.add("job seeking");
  }

  if (/resume|linkedin|network|job|interview|salary|career|mentor/.test(text)) {
    categories.add("job seeking");
    categories.add("transition planning");
  }

  if (/tsp|retired pay|dfas|allotment/.test(text)) {
    categories.add("retiree pay");
    categories.add("transition planning");
  }

  if (/survivor benefit|sbp|will|poa|burial|memorial|insurance/.test(text)) {
    categories.add("estate planning");
    categories.add("transition planning");
  }

  if (/college|gi bill|yellow ribbon|education/.test(text)) {
    categories.add("transition planning");
  }

  if (categories.has("administrative") && categories.size === 1) {
    categories.add("transition planning");
  }

  return [...categories];
}

export function getTaskLinks(task: DashboardTask, links: DashboardLink[], limit = 6) {
  const categories = getTaskLinkCategories(task);
  return links.filter((link) => categoryMatches(link, categories)).slice(0, limit);
}
