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

  it("marks a tool external exactly when its href leaves the site", () => {
    for (const tool of allTools) {
      expect(!!tool.isExternal, tool.title).toBe(tool.href.startsWith("http"));
    }
  });

  it("gives every built-in tool route a display label for the activity feed", () => {
    const labelled = new Set(Object.values(toolLabels));
    for (const tool of allTools.filter((t) => !t.isExternal && !t.isCalculator)) {
      expect(labelled.has(tool.title), tool.title).toBe(true);
    }
  });
});
