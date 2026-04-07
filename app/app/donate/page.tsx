const channels = ["Venmo", "CashApp", "PayPal"];

const reasons = [
  {
    title: "Keep The Tools Free",
    body: "MilVector AI is meant to reduce friction for service members in transition, not put another paywall in front of them.",
  },
  {
    title: "Cover AI Costs",
    body: "The platform uses paid AI APIs behind the scenes, and those costs are currently being paid out of pocket.",
  },
  {
    title: "Protect User Trust",
    body: "This is not built around selling service member information to mortgage companies, recruiters, extended warranty spam, or other lead-generation schemes.",
  },
  {
    title: "Share The Process",
    body: "The goal is to give service members access to tools that make transition less lonely and less repetitive, so fewer people feel like they have to reinvent the process on their own.",
  },
];

function DonateContent() {
  return (
    <main className="page-shell">
      <section className="page-hero">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker">SUPPORT THE MISSION</p>
            <h1 className="page-title">Help keep MilVector free, useful, and built around trust.</h1>
            <p className="page-description">
              MilVector was built to give service members practical transition tools without turning their process into a lead list,
              a paywall, or another subscription trap. Donations help keep the platform accessible while covering real operating costs.
            </p>
          </div>
          <aside className="page-hero-aside">
            <p className="page-hero-aside-title">WHAT DONATIONS SUPPORT</p>
            <ul className="page-hero-list">
              <li>AI API costs and platform operations</li>
              <li>Free access for service members</li>
              <li>A trust-first model without selling data</li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="section-card">
        <p className="section-title">Why This Exists</p>
        <div className="mt-3 space-y-3 text-sm text-[var(--muted)]">
          <p>
            This is not about getting rich. It is about sharing the tools already built so fewer service members feel like they have to reinvent the transition process on their own.
          </p>
          <p>
            If the platform helps you, donations make it easier to keep building, keep improving, and keep access open for the next person behind you.
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {reasons.map((reason) => (
          <article key={reason.title} className="section-card">
            <p className="section-title">{reason.title}</p>
            <p className="section-description">{reason.body}</p>
          </article>
        ))}
      </section>

      <section className="section-card">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="section-title">Donation Channels</p>
            <p className="section-description">This page is where Venmo, CashApp, and PayPal support links will go live as soon as they are ready.</p>
          </div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Coming Soon</p>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {channels.map((channel) => (
            <article
              key={channel}
              className="subtle-panel flex min-h-56 flex-col items-center justify-center p-5 text-center"
            >
              <p className="text-lg font-bold">{channel}</p>
              <p className="mt-2 text-sm text-[var(--muted)]">QR code placeholder</p>
              <p className="mt-4 text-xs uppercase tracking-[0.16em] text-[var(--accent)]">Ready for upload</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

export default function AppDonatePage() {
  return <DonateContent />;
}
