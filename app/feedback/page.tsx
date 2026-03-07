import { FeedbackForm } from "@/components/feedback-form";

export default function FeedbackPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-6 md:px-8">
      <section className="panel p-6">
        <h1 className="text-2xl font-bold">Feedback</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Share platform suggestions, bug reports, and mission-impact feedback.
        </p>
      </section>
      <FeedbackForm />
    </main>
  );
}