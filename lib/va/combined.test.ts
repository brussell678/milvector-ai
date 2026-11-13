import { describe, expect, it } from "vitest";
import { combineRatings } from "@/lib/va/combined";

const combine = (...ratings: number[]) => combineRatings(ratings.map((rating) => ({ rating })));

describe("combineRatings (38 CFR 4.25)", () => {
  // Expected values are read from the combined ratings table in 4.25.
  it("matches the table for two ratings", () => {
    expect(combine(50, 30).combinedValue).toBe(65);
    expect(combine(50, 30).combinedRating).toBe(70);
    expect(combine(40, 20).combinedValue).toBe(52);
    expect(combine(40, 20).combinedRating).toBe(50);
    expect(combine(10, 10).combinedValue).toBe(19);
    expect(combine(10, 10).combinedRating).toBe(20);
  });

  it("uses the regulation's own three-rating example: 60, 40, 20 is 81, payable at 80", () => {
    expect(combine(60, 40, 20).combinedValue).toBe(81);
    expect(combine(60, 40, 20).combinedRating).toBe(80);
  });

  it("does not depend on the order entered", () => {
    expect(combine(20, 60, 40).combinedValue).toBe(combine(60, 40, 20).combinedValue);
  });

  it("rounds a value ending in 5 up", () => {
    expect(combine(50, 30).combinedRating).toBe(70); // 65
    expect(combine(70, 50).combinedValue).toBe(85);
    expect(combine(70, 50).combinedRating).toBe(90);
  });

  it("never exceeds 100 and ignores zero or invalid ratings", () => {
    expect(combine(100, 50).combinedRating).toBe(100);
    expect(combine(0, 30).combinedRating).toBe(30);
    expect(combine().combinedRating).toBe(0);
    expect(combineRatings([{ rating: Number.NaN }, { rating: 20 }]).combinedRating).toBe(20);
  });

  it("applies the bilateral factor from 4.26: 30 and 20 combine to 44, plus 4.4, is 48", () => {
    const result = combineRatings([
      { rating: 30, bilateral: true },
      { rating: 20, bilateral: true },
    ]);
    expect(result.bilateralValue).toBe(48);
    expect(result.combinedRating).toBe(50);
  });

  it("treats the bilateral group as one rating when combining with the rest", () => {
    const result = combineRatings([
      { rating: 30, bilateral: true },
      { rating: 20, bilateral: true },
      { rating: 50 },
    ]);
    // 50 combined with 48 is 74
    expect(result.combinedValue).toBe(74);
    expect(result.combinedRating).toBe(70);
  });

  it("does not apply the factor to a single bilateral-flagged rating", () => {
    const result = combineRatings([{ rating: 30, bilateral: true }, { rating: 20 }]);
    expect(result.bilateralValue).toBeNull();
    expect(result.combinedValue).toBe(44);
  });
});
