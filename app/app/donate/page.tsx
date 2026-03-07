const channels = ["Venmo", "CashApp", "PayPal"];

export default function AppDonatePage() {
  return (
    <main className="space-y-4">
      <section className="panel p-6">
        <h1 className="text-2xl font-bold">Support MilVector AI</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          If this platform helped your transition, consider supporting the project.
        </p>
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