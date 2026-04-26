-- Fast Hardware
-- 新注册用户默认角色为 `free`（`raw_app_meta_data.role` 仍为合法值时可覆盖为 user/admin）

alter table public.user_roles alter column role set default 'free';

do $$
begin
  if to_regclass('public.profiles') is not null then
    alter table public.profiles alter column role set default 'free';
  end if;
end
$$;

create or replace function public.ensure_user_role_row_default()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text;
begin
  v_role := lower(coalesce(nullif(trim(new.raw_app_meta_data ->> 'role'), ''), 'free'));
  if v_role not in ('free', 'user', 'admin', 'super_admin') then
    v_role := 'free';
  end if;

  insert into public.user_roles (user_id, role)
  values (new.id, v_role)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    (
      select ur.role
      from public.user_roles ur
      where ur.user_id = auth.uid()
      limit 1
    ),
    'free'
  )
$$;

create or replace function public.list_users_for_permission_management(
  p_query text default '',
  p_page integer default 1,
  p_page_size integer default 20
)
returns table(
  user_id uuid,
  email text,
  display_name text,
  role text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_offset integer := (v_page - 1) * v_page_size;
  v_query text := lower(trim(coalesce(p_query, '')));
begin
  if public.current_user_role() <> 'super_admin' then
    raise exception 'permission_denied';
  end if;

  return query
  with matched as (
    select
      u.id as user_id,
      u.email,
      coalesce(nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(u.email, ''), '@', 1)) as display_name,
      coalesce(ur.role, 'free') as role,
      u.created_at
    from auth.users u
    left join public.user_roles ur on ur.user_id = u.id
    where
      v_query = ''
      or lower(coalesce(u.email, '')) like '%' || v_query || '%'
      or lower(coalesce(u.raw_user_meta_data ->> 'display_name', '')) like '%' || v_query || '%'
  )
  select
    m.user_id::uuid,
    m.email::text,
    m.display_name::text,
    m.role::text,
    m.created_at::timestamptz,
    count(*) over ()::bigint as total_count
  from matched m
  order by m.created_at desc
  offset v_offset
  limit v_page_size;
end;
$$;
