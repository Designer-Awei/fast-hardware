-- Fast Hardware
-- Supabase init SQL for account + maker marketplace

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'post_status') then
    create type public.post_status as enum ('pending', 'approved', 'rejected');
  end if;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  role text not null default 'user' check (role in ('user', 'admin', 'super_admin')),
  provider text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  summary text not null default '',
  status public.post_status not null default 'pending',
  reject_reason text,
  oss_poster_key text,
  oss_thumbnail_key text,
  oss_bundle_key text,
  likes_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  reviewed_at timestamptz,
  reviewer_id uuid references public.profiles(id)
);

create table if not exists public.post_likes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, post_id)
);

create table if not exists public.post_favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, post_id)
);

create table if not exists public.daily_uploads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  upload_date date not null default current_date,
  upload_count integer not null default 0 check (upload_count >= 0),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, upload_date)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  post_id uuid references public.posts(id),
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_posts_author_id on public.posts(author_id);
create index if not exists idx_posts_status on public.posts(status);
create index if not exists idx_posts_created_at on public.posts(created_at desc);
create index if not exists idx_audit_logs_actor_id on public.audit_logs(actor_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_profiles_set_updated_at on public.profiles;
create trigger trg_profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_posts_set_updated_at on public.posts;
create trigger trg_posts_set_updated_at
before update on public.posts
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, provider)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url',
    coalesce(new.raw_app_meta_data ->> 'provider', 'email')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_favorites enable row level security;
alter table public.daily_uploads enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "posts_select_approved_public" on public.posts;
create policy "posts_select_approved_public"
on public.posts
for select
to anon, authenticated
using (status = 'approved');

drop policy if exists "posts_select_own_non_public" on public.posts;
create policy "posts_select_own_non_public"
on public.posts
for select
to authenticated
using (author_id = auth.uid());

drop policy if exists "posts_insert_own" on public.posts;
create policy "posts_insert_own"
on public.posts
for insert
to authenticated
with check (author_id = auth.uid());

drop policy if exists "posts_update_own_pending" on public.posts;
create policy "posts_update_own_pending"
on public.posts
for update
to authenticated
using (author_id = auth.uid() and status = 'pending')
with check (author_id = auth.uid() and status = 'pending');

drop policy if exists "post_likes_select_own" on public.post_likes;
create policy "post_likes_select_own"
on public.post_likes
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "post_likes_insert_own" on public.post_likes;
create policy "post_likes_insert_own"
on public.post_likes
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "post_likes_delete_own" on public.post_likes;
create policy "post_likes_delete_own"
on public.post_likes
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "post_favorites_select_own" on public.post_favorites;
create policy "post_favorites_select_own"
on public.post_favorites
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "post_favorites_insert_own" on public.post_favorites;
create policy "post_favorites_insert_own"
on public.post_favorites
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "post_favorites_delete_own" on public.post_favorites;
create policy "post_favorites_delete_own"
on public.post_favorites
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "daily_uploads_select_own" on public.daily_uploads;
create policy "daily_uploads_select_own"
on public.daily_uploads
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "daily_uploads_insert_own" on public.daily_uploads;
create policy "daily_uploads_insert_own"
on public.daily_uploads
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "daily_uploads_update_own" on public.daily_uploads;
create policy "daily_uploads_update_own"
on public.daily_uploads
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- audit_logs intentionally has no client-side read/write policies.
-- write audit records through service role / edge functions only.
