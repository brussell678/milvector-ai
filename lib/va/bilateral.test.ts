import { describe, expect, it } from "vitest";
import { limbForCode, withBilateralFlags } from "@/lib/va/bilateral";
import { combineRatings } from "@/lib/va/combined";
import { getCode } from "@/lib/va/schedule";

describe("limbForCode (38 CFR 4.26)", () => {
  it("never offers the bilateral factor for conditions that are not extremities", () => {
    // mental health, sleep apnea, heart rhythm, hypertension, tinnitus, hearing, migraine, spine, diabetes
    for (const code of ["9440", "9411", "6847", "7010", "7101", "6260", "6100", "8100", "5237", "5243", "7913"]) {
      expect(limbForCode(code), code).toBeNull();
    }
  });

  it("recognizes arms and legs", () => {
    expect(limbForCode("5201")).toBe("upper"); // arm, limitation of motion
    expect(limbForCode("5215")).toBe("upper"); // wrist
    expect(limbForCode("5260")).toBe("lower"); // knee flexion
    expect(limbForCode("5271")).toBe("lower"); // ankle
    expect(limbForCode("5269")).toBe("lower"); // plantar fasciitis
    expect(limbForCode("8515")).toBe("upper"); // median nerve
    expect(limbForCode("8520")).toBe("lower"); // sciatic nerve
    expect(limbForCode("8620")).toBe("lower"); // sciatic neuritis
    expect(limbForCode("7120")).toBe("either"); // varicose veins
  });

  it("excludes torso and neck muscle groups", () => {
    expect(limbForCode("5305")).toBe("upper");
    expect(limbForCode("5314")).toBe("lower");
    expect(limbForCode("5320")).toBeNull();
  });

  it("classifies codes that really exist in the schedule under the expected body part", () => {
    expect(getCode("5201")?.title).toMatch(/arm/i);
    expect(getCode("5260")?.title).toMatch(/leg/i);
    expect(getCode("8520")?.title).toMatch(/sciatic/i);
    expect(getCode("7120")?.title).toMatch(/varicose/i);
  });
});

describe("withBilateralFlags", () => {
  it("needs both a left and a right in the same pair", () => {
    const oneSide = withBilateralFlags([
      { rating: 30, side: "left-lower" },
      { rating: 20, side: "left-lower" },
    ]);
    expect(oneSide.every((c) => !c.bilateral)).toBe(true);

    const bothSides = withBilateralFlags([
      { rating: 30, side: "left-lower" },
      { rating: 20, side: "right-lower" },
    ]);
    expect(bothSides.every((c) => c.bilateral)).toBe(true);
  });

  it("treats the leg as a whole: right knee and left foot qualify together", () => {
    const flags = withBilateralFlags([
      { rating: 10, side: "right-lower" },
      { rating: 10, side: "left-lower" },
      { rating: 50, side: "" },
    ]);
    expect(flags.map((c) => c.bilateral)).toEqual([true, true, false]);
  });

  it("does not pair an arm with a leg", () => {
    const flags = withBilateralFlags([
      { rating: 20, side: "left-upper" },
      { rating: 20, side: "right-lower" },
    ]);
    expect(flags.every((c) => !c.bilateral)).toBe(true);
  });

  it("counts a single both-sides rating, and ignores zero percent ratings", () => {
    expect(withBilateralFlags([{ rating: 30, side: "both-lower" }])[0].bilateral).toBe(true);
    const zero = withBilateralFlags([
      { rating: 0, side: "left-lower" },
      { rating: 20, side: "right-lower" },
    ]);
    expect(zero.every((c) => !c.bilateral)).toBe(true);
  });

  it("feeds the combined calculation: knees 30 and 20 plus PTSD 50 is 74, payable at 70", () => {
    const result = combineRatings(
      withBilateralFlags([
        { rating: 30, side: "left-lower" },
        { rating: 20, side: "right-lower" },
        { rating: 50, side: "" },
      ])
    );
    expect(result.bilateralValue).toBe(48);
    expect(result.combinedValue).toBe(74);
    expect(result.combinedRating).toBe(70);
  });
});
