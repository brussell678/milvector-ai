import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { LibraryListManager } from "@/components/library-list-manager";

const PAGE_SIZE = 10;

function buildPageHref(page: number, q: string, type: string) {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (q) params.set("q", q);
  if (type !== "all") params.set("type", type);
  const query = params.toString();
  return query ? `/app/library?${query}` : "/app/library";
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; type?: string }>;
}) {
  const params = await searchParams;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const q = (params.q ?? "").trim();
  const type =
    params.type === "master_bullets" || params.type === "master_resume" || params.type === "targeted_resume"
      ? params.type
      : "all";
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let listQuery = supabase
    .from("resume_artifacts")
    .select("id,artifact_type,title,created_at,content")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(from, to);

  let countQuery = supabase
    .from("resume_artifacts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (type !== "all") {
    listQuery = listQuery.eq("artifact_type", type);
    countQuery = countQuery.eq("artifact_type", type);
  }
  if (q) {
    listQuery = listQuery.ilike("title", `%${q}%`);
    countQuery = countQuery.ilike("title", `%${q}%`);
  }

  const [{ data }, { count }] = await Promise.all([listQuery, countQuery]);
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <main className="space-y-4">
      <section className="panel p-6">
        <h1 className="text-2xl font-bold">Library</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Saved master resumes and targeted resumes.
        </p>
      </section>
      <section className="panel p-6">
        <form className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <input
            name="q"
            className="input"
            placeholder="Search by title"
            defaultValue={q}
          />
          <select name="type" className="input" defaultValue={type}>
            <option value="all">All types</option>
            <option value="master_bullets">Legacy master bullets</option>
            <option value="master_resume">Master resumes</option>
            <option value="targeted_resume">Targeted resumes</option>
          </select>
          <button className="btn btn-primary" type="submit">Apply</button>
        </form>
      </section>
      {data?.length ? (
        <LibraryListManager items={data} />
      ) : (
        <p className="panel p-5 text-sm text-[var(--muted)]">No artifacts yet.</p>
      )}
      <section className="panel flex items-center justify-between p-4 text-sm">
        <p>
          Page {page} of {totalPages} ({total} total)
        </p>
        <div className="flex gap-2">
          {hasPrev ? (
            <Link className="btn btn-secondary text-sm" href={buildPageHref(page - 1, q, type)}>
              Previous
            </Link>
          ) : (
            <span className="btn btn-secondary text-sm opacity-50">Previous</span>
          )}
          {hasNext ? (
            <Link className="btn btn-secondary text-sm" href={buildPageHref(page + 1, q, type)}>
              Next
            </Link>
          ) : (
            <span className="btn btn-secondary text-sm opacity-50">Next</span>
          )}
        </div>
      </section>
    </main>
  );
}
