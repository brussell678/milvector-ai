import { MessageBoard } from "@/components/message-board";

export default function AppMessageBoardPage() {
  return (
    <main className="space-y-4">
      <section className="panel p-6">
        <h1 className="text-2xl font-bold">Message Board</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Discuss ideas with the community, vote on what matters most, and reply directly to ongoing threads.
        </p>
      </section>
      <MessageBoard />
    </main>
  );
}
