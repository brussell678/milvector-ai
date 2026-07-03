// Automatic PII redaction for document text before it is stored or sent to
// the AI. Covers Social Security Numbers and EDIPI / DoD ID numbers.
//
// Design notes:
// - Runs on extracted document text and on any pasted source text at the API
//   boundary, so scrubbed text is what gets stored and what reaches the LLM.
// - Bare 9-digit runs are treated as SSNs and bare 10-digit runs as EDIPIs.
//   On military source documents that is almost always correct; the rare
//   false positive (an unformatted phone number) is an acceptable trade
//   against leaking a real identifier.

export type RedactionCounts = {
  ssn: number;
  dodId: number;
};

export type RedactionResult = {
  text: string;
  counts: RedactionCounts;
  total: number;
};

const SSN_TOKEN = "[REDACTED SSN]";
const DOD_ID_TOKEN = "[REDACTED DOD ID]";

export function redactPII(input: string): RedactionResult {
  if (!input) return { text: input, counts: { ssn: 0, dodId: 0 }, total: 0 };

  let ssn = 0;
  let dodId = 0;
  let text = input;

  // Labeled EDIPI / DoD ID — allows separators inside the number
  text = text.replace(
    /\b(EDIPI|Do[Dd]\s*ID(?:\s*(?:Number|No\.?|#))?)\s*[:#]?\s*(\d[\d\s-]{8,12}\d)\b/gi,
    (_m, label: string) => {
      dodId += 1;
      return `${label}: ${DOD_ID_TOKEN}`;
    }
  );

  // Labeled SSN with any 9-digit number (with or without separators)
  text = text.replace(
    /\b(SSN|SSAN|Social\s+Security(?:\s+(?:Number|No\.?|#))?)\s*[:#]?\s*(\d{3}[-\s]?\d{2}[-\s]?\d{4})\b/gi,
    (_m, label: string) => {
      ssn += 1;
      return `${label}: ${SSN_TOKEN}`;
    }
  );

  // Formatted SSN: 123-45-6789 or 123 45 6789
  text = text.replace(/\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g, () => {
    ssn += 1;
    return SSN_TOKEN;
  });

  // Bare 10-digit run → EDIPI / DoD ID
  text = text.replace(/\b\d{10}\b/g, () => {
    dodId += 1;
    return DOD_ID_TOKEN;
  });

  // Bare 9-digit run → SSN
  text = text.replace(/\b\d{9}\b/g, () => {
    ssn += 1;
    return SSN_TOKEN;
  });

  return { text, counts: { ssn, dodId }, total: ssn + dodId };
}
