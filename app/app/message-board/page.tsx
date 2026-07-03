import { MessageBoard } from "@/components/message-board";

export default function AppMessageBoardPage() {
  return (
    <main className="page-shell">
      <section className="page-hero-dark">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker-pill">COMMUNITY</p>
            <h1 className="page-title">Ask questions, share what worked, help the next Marine.</h1>
            <p className="page-description">
              A moderated board for people going through the same transition. Post what you&apos;re running into, vote on what matters, and learn from those a few steps ahead.
            </p>
          </div>
          <aside className="page-hero-aside relative z-10">
            <p className="page-hero-aside-title">HOW IT WORKS</p>
            <ul className="page-hero-list">
              <li>Post questions, suggestions, or lessons learned</li>
              <li>Save your profile before posting or replying</li>
              <li>Vote on what matters most</li>
              <li>Reply inside active threads</li>
            </ul>
          </aside>
        </div>
      </section>
      <MessageBoard />
    </main>
  );
}
