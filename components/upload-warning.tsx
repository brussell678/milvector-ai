export const UPLOAD_WARNING_TEXT =
  "MilVector automatically removes SSN and DoD ID (EDIPI) numbers from your document text before it is stored or used by the AI. Still, redact anything else you wouldn't want kept — full date of birth, home address, or dependent information — before uploading.";

export function UploadWarning() {
  return (
    <section className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-4">
      <p className="text-sm font-semibold text-[var(--warn)]">Before You Upload</p>
      <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{UPLOAD_WARNING_TEXT}</p>
    </section>
  );
}
