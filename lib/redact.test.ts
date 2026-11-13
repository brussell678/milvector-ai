import { describe, expect, it } from "vitest";
import { redactPII } from "@/lib/redact";

describe("redactPII", () => {
  it("removes a formatted SSN", () => {
    const out = redactPII("Marine reported aboard. 123-45-6789 on file.");
    expect(out.text).not.toContain("123-45-6789");
    expect(out.counts.ssn).toBe(1);
  });

  it("removes a labeled SSN written without separators", () => {
    const out = redactPII("SSN: 123456789");
    expect(out.text).toBe("SSN: [REDACTED SSN]");
  });

  it("removes a labeled EDIPI and a bare 10-digit DoD ID", () => {
    const out = redactPII("EDIPI 1234567890. Alternate id 0987654321.");
    expect(out.text).not.toMatch(/\d{10}/);
    expect(out.counts.dodId).toBe(2);
  });

  it("leaves dates, dollar figures, and short numbers alone", () => {
    const text = "Managed $2,300,000 across 14 sections from 2019 to 2023; readiness rose 12 percent.";
    const out = redactPII(text);
    expect(out.text).toBe(text);
    expect(out.total).toBe(0);
  });

  it("handles empty input", () => {
    expect(redactPII("").total).toBe(0);
  });
});
