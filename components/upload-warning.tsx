export const UPLOAD_WARNING_TEXT =
  "Before uploading documents, redact any sensitive personal information such as SSN, full date of birth, or home address.";

export function UploadWarning() {
  return (
    <section className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-4">
      <p className="text-sm font-semibold text-[var(--warn)]">Before You Upload</p>
      <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{UPLOAD_WARNING_TEXT}</p>
    </section>
  );
}
