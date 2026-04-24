-- Fast Hardware
-- Marketplace core tables and RPCs (Supabase-only storage flow)

create table if not exists public.marketplace_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  project_key text not null,
  project_name text not null,
  description text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  pending_snapshot_key text,
  pending_code_key text,
  public_snapshot_key text,
  public_code_key text,
  likes_count integer not null default 0,
  favorites_count integer not null default 0,
  remixes_count integer not null default 0,
  published_at timestamptz,
  reviewed_at timestamptz,
  reviewer_id uuid references auth.users(id),
  reject_reason text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_marketplace_posts_status_created_at
  on public.marketplace_posts(status, created_at desc);
create index if not exists idx_marketplace_posts_status_likes
  on public.marketplace_posts(status, likes_count desc, published_at desc nulls last);

create table if not exists public.marketplace_post_likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.marketplace_posts(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, post_id)
);

create table if not exists public.marketplace_post_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.marketplace_posts(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, post_id)
);

create table if not exists public.marketplace_post_remixes (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.marketplace_posts(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, post_id)
);

create table if not exists public.daily_marketplace_uploads (
  user_id uuid not null references auth.users(id) on delete cascade,
  upload_date date not null default current_date,
  upload_count integer not null default 0 check (upload_count >= 0),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, upload_date)
);

alter table public.marketplace_posts enable row level security;
alter table public.marketplace_post_likes enable row level security;
alter table public.marketplace_post_favorites enable row level security;
alter table public.marketplace_post_remixes enable row level security;
alter table public.daily_marketplace_uploads enable row level security;

drop policy if exists "marketplace_posts_select_approved_authenticated" on public.marketplace_posts;
create policy "marketplace_posts_select_approved_authenticated"
on public.marketplace_posts
for select
to authenticated
using (status = 'approved');

drop policy if exists "marketplace_posts_select_own_non_public" on public.marketplace_posts;
create policy "marketplace_posts_select_own_non_public"
on public.marketplace_posts
for select
to authenticated
using (author_id = auth.uid());

drop policy if exists "marketplace_posts_insert_own" on public.marketplace_posts;
create policy "marketplace_posts_insert_own"
on public.marketplace_posts
for insert
to authenticated
with check (author_id = auth.uid() and status = 'pending');

drop policy if exists "marketplace_posts_update_own_pending" on public.marketplace_posts;
create policy "marketplace_posts_update_own_pending"
on public.marketplace_posts
for update
to authenticated
using (author_id = auth.uid() and status = 'pending')
with check (author_id = auth.uid() and status = 'pending');

drop policy if exists "marketplace_posts_select_pending_for_admin" on public.marketplace_posts;
create policy "marketplace_posts_select_pending_for_admin"
on public.marketplace_posts
for select
to authenticated
using (
  exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('admin', 'super_admin')
  )
);

drop policy if exists "marketplace_posts_review_update_for_admin" on public.marketplace_posts;
create policy "marketplace_posts_review_update_for_admin"
on public.marketplace_posts
for update
to authenticated
using (
  exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('admin', 'super_admin')
  )
)
with check (
  exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('admin', 'super_admin')
  )
);

drop policy if exists "marketplace_post_likes_select_own" on public.marketplace_post_likes;
create policy "marketplace_post_likes_select_own"
on public.marketplace_post_likes
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "marketplace_post_likes_insert_own" on public.marketplace_post_likes;
create policy "marketplace_post_likes_insert_own"
on public.marketplace_post_likes
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "marketplace_post_likes_delete_own" on public.marketplace_post_likes;
create policy "marketplace_post_likes_delete_own"
on public.marketplace_post_likes
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "marketplace_post_favorites_select_own" on public.marketplace_post_favorites;
create policy "marketplace_post_favorites_select_own"
on public.marketplace_post_favorites
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "marketplace_post_favorites_insert_own" on public.marketplace_post_favorites;
create policy "marketplace_post_favorites_insert_own"
on public.marketplace_post_favorites
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "marketplace_post_favorites_delete_own" on public.marketplace_post_favorites;
create policy "marketplace_post_favorites_delete_own"
on public.marketplace_post_favorites
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "marketplace_post_remixes_select_own" on public.marketplace_post_remixes;
create policy "marketplace_post_remixes_select_own"
on public.marketplace_post_remixes
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "marketplace_post_remixes_insert_own" on public.marketplace_post_remixes;
create policy "marketplace_post_remixes_insert_own"
on public.marketplace_post_remixes
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "daily_marketplace_uploads_select_own" on public.daily_marketplace_uploads;
create policy "daily_marketplace_uploads_select_own"
on public.daily_marketplace_uploads
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "daily_marketplace_uploads_insert_own" on public.daily_marketplace_uploads;
create policy "daily_marketplace_uploads_insert_own"
on public.daily_marketplace_uploads
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "daily_marketplace_uploads_update_own" on public.daily_marketplace_uploads;
create policy "daily_marketplace_uploads_update_own"
on public.daily_marketplace_uploads
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('marketplace-pending', 'marketplace-pending', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('marketplace-public', 'marketplace-public', false)
on conflict (id) do nothing;

drop policy if exists "marketplace_pending_upload_own" on storage.objects;
create policy "marketplace_pending_upload_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'marketplace-pending'
  and auth.uid() is not null
  and name like auth.uid()::text || '/%'
);

drop policy if exists "marketplace_pending_read_own_or_admin" on storage.objects;
create policy "marketplace_pending_read_own_or_admin"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'marketplace-pending'
  and (
    (auth.uid() is not null and name like auth.uid()::text || '/%')
    or exists (
      select 1
      from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role in ('admin', 'super_admin')
    )
  )
);

drop policy if exists "marketplace_pending_delete_own_or_admin" on storage.objects;
create policy "marketplace_pending_delete_own_or_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'marketplace-pending'
  and (
    (auth.uid() is not null and name like auth.uid()::text || '/%')
    or exists (
      select 1
      from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role in ('admin', 'super_admin')
    )
  )
);

drop policy if exists "marketplace_public_read_authenticated" on storage.objects;
create policy "marketplace_public_read_authenticated"
on storage.objects
for select
to authenticated
using (bucket_id = 'marketplace-public');

drop policy if exists "marketplace_public_write_admin" on storage.objects;
create policy "marketplace_public_write_admin"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'marketplace-public'
  and exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('admin', 'super_admin')
  )
);

drop policy if exists "marketplace_public_update_admin" on storage.objects;
create policy "marketplace_public_update_admin"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'marketplace-public'
  and exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('admin', 'super_admin')
  )
)
with check (
  bucket_id = 'marketplace-public'
  and exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('admin', 'super_admin')
  )
);

drop policy if exists "marketplace_public_delete_admin" on storage.objects;
create policy "marketplace_public_delete_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'marketplace-public'
  and exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('admin', 'super_admin')
  )
);
