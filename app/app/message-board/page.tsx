import { MessageBoard } from "@/components/message-board";

export default function AppMessageBoardPage() {
  return (
    <main className="page-shell">
      <section className="page-hero">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker">MESSAGE BOARD</p>
            <h1 className="page-title">Surface ideas, friction points, and community priorities.</h1>
            <p className="page-description">
              Discuss what is working, what is missing, and what should matter most. Upvotes help useful ideas rise to the top, while notifications, linked workflows, and reporting keep the board active, actionable, and trustworthy.
            </p>
          </div>
          <aside className="page-hero-aside">
            <p className="page-hero-aside-title">HOW IT WORKS</p>
            <ul className="page-hero-list">
              <li>Post questions, suggestions, or field notes</li>
              <li>Save your profile before posting or replying</li>
              <li>Vote on what matters most</li>
              <li>Reply directly inside active threads</li>
              <li>Link posts back to MilVector tools and resources</li>
            </ul>
          </aside>
        </div>
      </section>
      <MessageBoard />
    </main>
  );
}
