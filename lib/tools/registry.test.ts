import { describe, expect, it } from "vitest";
import { toolGroups, toolLabels } from "@/lib/tools/registry";

const allTools = toolGroups.flatMap((group) => group.tools);

describe("tool registry", () => {
  it("has no duplicate hrefs or titles", () => {
    const hrefs = allTools.map((tool) => tool.href);
    const titles = allTools.map((tool) => tool.title);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("keeps every tool inside MilVector", () => {
    for (const tool of allTools) {
      expect(tool.href.startsWith("/"), tool.title).toBe(true);
    }
  });

  it("gives every built-in tool route a display label for the activity feed", () => {
    const labelled = new Set(Object.values(toolLabels));
    for (const tool of allTools.filter((t) => !t.isCalculator && !t.isBuilder && !t.isPreview)) {
      expect(labelled.has(tool.title), tool.title).toBe(true);
    }
  });
});
