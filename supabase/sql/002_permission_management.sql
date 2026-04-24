-- Fast Hardware
-- Permission management with user_roles as single source of truth

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'admin', 'super_admin')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_user_roles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_user_roles_set_updated_at on public.user_roles;
create trigger trg_user_roles_set_updated_at
before update on public.user_roles
for each row execute function public.set_user_roles_updated_at();

create or replace function public.ensure_user_role_row_default()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text;
begin
  v_role := lower(coalesce(nullif(trim(new.raw_app_meta_data ->> 'role'), ''), 'user'));
  if v_role not in ('user', 'admin', 'super_admin') then
    v_role := 'user';
  end if;

  insert into public.user_roles (user_id, role)
  values (new.id, v_role)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_auth_users_default_role on auth.users;
drop trigger if exists trg_auth_users_default_user_role_row on auth.users;
create trigger trg_auth_users_default_user_role_row
after insert on auth.users
for each row execute function public.ensure_user_role_row_default();

insert into public.user_roles (user_id, role)
select
  u.id,
  case
    when lower(coalesce(nullif(trim(u.raw_app_meta_data ->> 'role'), ''), 'user')) in ('user', 'admin', 'super_admin')
      then lower(coalesce(nullif(trim(u.raw_app_meta_data ->> 'role'), ''), 'user'))
    else 'user'
  end as role
from auth.users u
on conflict (user_id) do nothing;

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'role'
where raw_app_meta_data ? 'role';

alter table public.user_roles enable row level security;

drop policy if exists "user_roles_select_self" on public.user_roles;
create policy "user_roles_select_self"
on public.user_roles
for select
to authenticated
using (auth.uid() = user_id);

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
    'user'
  )
$$;

create or replace function public.get_permission_management_stats()
returns table(total_users bigint, admin_count bigint, super_admin_count bigint)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if public.current_user_role() <> 'super_admin' then
    raise exception 'permission_denied';
  end if;

  return query
  select
    count(*)::bigint as total_users,
    count(*) filter (where ur.role = 'admin')::bigint as admin_count,
    count(*) filter (where ur.role = 'super_admin')::bigint as super_admin_count
  from public.user_roles ur;
end;
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
      coalesce(ur.role, 'user') as role,
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

create or replace function public.set_user_role_by_super_admin(
  p_user_id uuid,
  p_role text
)
returns table(ok boolean, message text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text := lower(trim(coalesce(p_role, '')));
  v_target_role text;
begin
  if public.current_user_role() <> 'super_admin' then
    return query select false, '权限不足，仅超级管理员可修改角色。';
    return;
  end if;

  if v_role not in ('user', 'admin') then
    return query select false, '目标角色仅支持 user 或 admin。';
    return;
  end if;

  select role
  into v_target_role
  from public.user_roles
  where user_id = p_user_id;

  if v_target_role is null then
    return query select false, '目标用户不存在。';
    return;
  end if;

  if p_user_id = auth.uid() then
    return query select false, '不允许修改当前登录超级管理员自身角色。';
    return;
  end if;

  if v_target_role = 'super_admin' then
    return query select false, '不允许在此接口修改超级管理员角色。';
    return;
  end if;

  update public.user_roles
  set role = v_role
  where user_id = p_user_id;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'profiles') then
    update public.profiles
    set role = v_role, updated_at = timezone('utc', now())
    where id = p_user_id;
  end if;

  return query select true, '角色更新成功。';
end;
$$;

grant execute on function public.current_user_role() to authenticated;
grant execute on function public.get_permission_management_stats() to authenticated;
grant execute on function public.list_users_for_permission_management(text, integer, integer) to authenticated;
grant execute on function public.set_user_role_by_super_admin(uuid, text) to authenticated;
