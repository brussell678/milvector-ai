import { FeedbackForm } from "@/components/feedback-form";

export default function AppFeedbackPage() {
  return (
    <main className="space-y-4">
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