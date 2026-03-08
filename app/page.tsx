import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";

const features = [
  "Master Resume Builder from VMET, JST, and FITREPs/EVALs",
  "MOS Translator for role mapping and credential pathways",
  "Job Description Decoder for must-haves, risks, and interview prep",
  "Targeted Resume Builder for job-specific alignment",
];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; token_hash?: string; type?: string; next?: string; error?: string; error_code?: string; error_description?: string }>;
}) {
  const params = await searchParams;
  const code = params.code;
  const tokenHash = params.token_hash;
  const type = params.type;
  const next = params.next ?? "/app";
  const authError = params.error;
  const authErrorCode = params.error_code;
  const authErrorDescription = params.error_description;

  if (authError || authErrorCode || authErrorDescription) {
    const query = new URLSearchParams();
    const message = authErrorDescription ?? authErrorCode ?? authError ?? "Authentication link is invalid or expired. Request a new magic link.";
    query.set("error", message);
    redirect(`/login?${query.toString()}`);
  }

  if (code || (tokenHash && type)) {
    const query = new URLSearchParams();
    if (code) query.set("code", code);
    if (tokenHash) query.set("token_hash", tokenHash);
    if (type) query.set("type", type);
    query.set("next", next);
    redirect(`/auth/confirm?${query.toString()}`);
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 md:px-8">
      <section className="panel overflow-hidden">
        <div className="grid gap-8 p-8 md:grid-cols-[1.2fr_0.8fr] md:p-12">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <Image
                src="/assets/milvector-ai-logo.svg"
                alt="MILVECTOR AI logo"
                width={56}
                height={56}
                className="object-contain"
              />
              <p className="inline-flex rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold tracking-wide text-[var(--accent)]">
                MILVECTOR AI
              </p>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-balance md:text-5xl">
              Find the vector to your next career.
            </h1>
            <p className="max-w-2xl text-lg text-[var(--muted)]">
              AI tools designed to help service members translate their military experience into civilian careers.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/login" className="btn btn-primary">
                Start Free
              </Link>
              <Link href="/app" className="btn btn-secondary">
                Learn How It Works
              </Link>
            </div>
          </div>
          <div className="panel hero-outcomes p-6">
            <p className="hero-outcomes-title text-xs font-semibold tracking-widest">WHAT YOU GET</p>
            <ul className="mt-4 space-y-3 text-sm">
              <li>Actionable first output in under 10 minutes</li>
              <li>Master resume generated from your source records</li>
              <li>Targeted resume per job posting</li>
              <li>Saved document and resume library for reuse</li>
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

