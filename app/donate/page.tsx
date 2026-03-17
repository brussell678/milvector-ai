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

export default function DonatePage() {
  return (
    <main className="mx-auto max-w-5xl space-y-4 px-6 md:px-8">
      <section className="panel p-6">
        <h1 className="text-2xl font-bold">Support MilVector AI</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          MilVector AI was built to give transitioning service members practical tools without turning their transition
          into a lead list or another subscription trap.
        </p>
        <p className="mt-3 text-sm text-[var(--muted)]">
          I am not trying to get rich from this. I am trying to share the tools I built so other service members do
          not feel like they have to reinvent the entire transition process by themselves.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {reasons.map((reason) => (
          <article key={reason.title} className="panel p-5">
            <h2 className="text-lg font-bold">{reason.title}</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">{reason.body}</p>
          </article>
        ))}
      </section>

      <section className="panel p-6">
        <h2 className="text-lg font-bold">Why Donations Matter</h2>
        <div className="mt-3 space-y-3 text-sm text-[var(--muted)]">
          <p>Donations help cover the AI API costs required to run the tools and keep the platform available to more service members.</p>
          <p>They also help preserve a model built on trust: useful support for transition without selling personal data or pushing people into unrelated offers.</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {channels.map((channel) => (
          <article key={channel} className="panel flex min-h-52 flex-col items-center justify-center p-5 text-center">
            <p className="font-semibold">{channel}</p>
            <p className="mt-2 text-xs text-[var(--muted)]">QR code placeholder</p>
          </article>
        ))}
      </section>
    </main>
  );
}