import { describe, expect, it } from "vitest";
import { lockedReply, reviewPath, reviewPending } from "@/lib/resume/review-lock";
import { reviewCount, savedReview, withLine, type BuildResult } from "@/lib/resume/build-result";

const fig = (text: string, reviewed?: string) => ({ place: "PMO LAV", text, figures: ["62 percent"], sources: [text], ...(reviewed ? { reviewed } : {}) });

describe("the review lock (D15)", () => {
  it("never locks a resume built before the lock", () => {
    expect(reviewPending({ checked: { figures: [fig("Cut prep 62 percent.")] } })).toBe(0);
    expect(reviewPending(null)).toBe(0);
  });

  it("counts the lines still to check on a new resume", () => {
    const saved = { reviewRequired: true, checked: { figures: [fig("A 62 percent.", "correct"), fig("B 40 Marines."), fig("C $1.2M.", "outdated")] } };
    expect(reviewPending(saved)).toBe(1);
    expect(reviewPending({ ...saved, checked: { figures: saved.checked.figures.map((f) => ({ ...f, reviewed: "misstated" })) } })).toBe(0);
    expect(reviewPending({ reviewRequired: true, checked: { figures: [] } })).toBe(0);
  });

  it("sends a link clicked in the browser to the resume's review, and anything else a plain message", async () => {
    const page = lockedReply(new Request("https://www.milvector.org/api/documents/x/download", { headers: { accept: "text/html,application/xhtml+xml" } }), "art-1");
    expect(page.status).toBe(303);
    expect(page.headers.get("location")).toBe("https://www.milvector.org" + reviewPath("art-1"));
    const api = lockedReply(new Request("https://www.milvector.org/api/documents/x/download", { headers: { accept: "*/*" } }), "art-1");
    expect(api.status).toBe(423);
    expect((await api.json()).code).toBe("review_locked");
  });
});

describe("a saved review read back", () => {
  const figures = [fig("A 62 percent.", "correct"), fig("B 40 Marines."), fig("C $1.2M.", "outdated"), fig("D 3 sites.", "misstated")];

  it("keeps each mark by its place in the list", () => {
    const review = savedReview(figures);
    expect(Object.keys(review)).toEqual(["0", "2", "3"]);
    expect(review[0]).toEqual({ status: "correct" });
    expect(review[2].status).toBe("fixed");
    expect(reviewCount(figures, review)).toEqual({ done: 3, total: 4 });
  });

  it("swaps a fixed line in the resume on screen", () => {
    const resume = {
      targetTitle: "Program Manager",
      tagline: "",
      summary: "Led teams. Cut prep 62 percent.",
      skills: [],
      highlights: [],
      experience: [],
      jobs: [{ roleId: "R1", title: "Officer", organization: "USMC", dates: "2020 - 2024", bullets: [{ text: "Cut prep 62 percent." }] }],
      projects: [],
      education: [],
      certifications: [],
      training: [],
      gaps: [],
      estimatedPages: 1.5,
    } as unknown as BuildResult["resume"];
    const next = withLine(resume, "Cut prep 62 percent.", "Cut prep 55 percent.");
    expect(next.jobs[0].bullets[0].text).toBe("Cut prep 55 percent.");
    expect(next.summary).toBe("Led teams. Cut prep 55 percent.");
  });
});
