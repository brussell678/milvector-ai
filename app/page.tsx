import Link from "next/link";
import Image from "next/image";

const features = [
  "Master Resume Builder from VMET, JST, and FITREPs/EVALs",
  "MOS translator for role mapping and cert paths",
  "Job Description Decoder for must-haves and interview prep",
  "Targeted Resume Builder for job-specific alignment",
];

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10 md:px-8">
      <section className="panel overflow-hidden">
        <div className="grid gap-8 p-8 md:grid-cols-[1.2fr_0.8fr] md:p-12">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <Image
                src="/assets/the-next-mission-logo.svg"
                alt="The Next Mission logo"
                width={56}
                height={56}
                className="rounded-xl object-contain ring-1 ring-[var(--line)]"
              />
              <p className="inline-flex rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold tracking-wide text-[var(--accent)]">
                THE NEXT MISSION
              </p>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-balance md:text-5xl">
              Transition support that turns military performance into civilian results.
            </h1>
            <p className="max-w-2xl text-lg text-[var(--muted)]">
              Move from documents and MOS data to targeted resumes with one guided workflow.
              Built for speed, clarity, and ATS relevance.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/login" className="btn btn-primary">
                Sign In
              </Link>
              <Link href="/app" className="btn btn-secondary">
                Open App
              </Link>
            </div>
          </div>
          <div className="panel bg-[#0f6d53] p-6 text-white">
            <p className="text-xs font-semibold tracking-widest text-[#d2efe5]">MVP OUTCOMES</p>
            <ul className="mt-4 space-y-3 text-sm">
              <li>Time-to-first-value under 10 minutes</li>
              <li>Master bullets artifact generation</li>
              <li>Targeted resume generation per job</li>
              <li>Persistent tool history + artifacts</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        {features.map((feature) => (
          <article key={feature} className="panel p-5">
            <p className="font-semibold">{feature}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
