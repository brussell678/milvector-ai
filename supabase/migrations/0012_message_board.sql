create table if not exists public.message_board_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_post_id uuid references public.message_board_posts(id) on delete cascade,
  title text,
  body text not null,
  author_label text not null,
  created_at timestamptz not null default now(),
  constraint message_board_posts_title_required_for_threads check (
    (parent_post_id is null and title is not null and length(btrim(title)) > 0)
    or parent_post_id is not null
  )
);

create table if not exists public.message_board_votes (
  post_id uuid not null references public.message_board_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  vote_value smallint not null check (vote_value in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists message_board_posts_parent_created_idx
  on public.message_board_posts(parent_post_id, created_at desc);

create index if not exists message_board_posts_created_idx
  on public.message_board_posts(created_at desc)
  where parent_post_id is null;

create index if not exists message_board_votes_post_idx
  on public.message_board_votes(post_id);

create or replace function public.set_message_board_vote_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_message_board_vote_updated_at on public.message_board_votes;
create trigger set_message_board_vote_updated_at
before update on public.message_board_votes
for each row
execute function public.set_message_board_vote_updated_at();

alter table public.message_board_posts enable row level security;
alter table public.message_board_votes enable row level security;

drop policy if exists "message_board_posts_read_all" on public.message_board_posts;
create policy "message_board_posts_read_all"
on public.message_board_posts
for select
using (true);

drop policy if exists "message_board_posts_insert_own" on public.message_board_posts;
create policy "message_board_posts_insert_own"
on public.message_board_posts
for insert
with check (auth.uid() = user_id);

drop policy if exists "message_board_votes_read_all" on public.message_board_votes;
create policy "message_board_votes_read_all"
on public.message_board_votes
for select
using (true);

drop policy if exists "message_board_votes_insert_own" on public.message_board_votes;
create policy "message_board_votes_insert_own"
on public.message_board_votes
for insert
with check (auth.uid() = user_id);

drop policy if exists "message_board_votes_update_own" on public.message_board_votes;
create policy "message_board_votes_update_own"
on public.message_board_votes
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "message_board_votes_delete_own" on public.message_board_votes;
create policy "message_board_votes_delete_own"
on public.message_board_votes
for delete
using (auth.uid() = user_id);
