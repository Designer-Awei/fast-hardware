-- Fast Hardware
-- 管理员（admin）可进入权限管理：查看统计与用户列表，且仅能在 free / user 间切换目标账号；超级管理员（super_admin）规则不变。

-- ---------------------------------------------------------------------------
-- 1. 权限统计：管理员也可读
-- ---------------------------------------------------------------------------
create or replace function public.get_permission_management_stats()
returns table(
  total_users bigint,
  admin_count bigint,
  super_admin_count bigint,
  free_count bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if public.current_user_role() not in ('super_admin', 'admin') then
    raise exception 'permission_denied';
  end if;

  return query
  select
    count(*)::bigint as total_users,
    count(*) filter (where ur.role = 'admin')::bigint as admin_count,
    count(*) filter (where ur.role = 'super_admin')::bigint as super_admin_count,
    count(*) filter (where ur.role = 'free')::bigint as free_count
  from public.user_roles ur;
end;
$$;

grant execute on function public.get_permission_management_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. 用户列表：管理员也可读
-- ---------------------------------------------------------------------------
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
  if public.current_user_role() not in ('super_admin', 'admin') then
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

-- ---------------------------------------------------------------------------
-- 3. 角色变更：admin 仅允许 free <-> user；super_admin 仍为 free/user/admin
-- ---------------------------------------------------------------------------
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
  v_actor text := public.current_user_role();
  v_role text := lower(trim(coalesce(p_role, '')));
  v_target_role text;
begin
  if v_actor not in ('super_admin', 'admin') then
    return query select false, '权限不足。';
    return;
  end if;

  if v_actor = 'admin' then
    if v_role not in ('free', 'user') then
      return query select false, '管理员仅可将账号设为免费用户或普通用户。';
      return;
    end if;
  elsif v_role not in ('free', 'user', 'admin') then
    return query select false, '目标角色仅支持 free、user 或 admin。';
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
    return query select false, '不允许修改当前登录账号自身角色。';
    return;
  end if;

  if v_target_role = 'super_admin' then
    return query select false, '不允许在此接口修改超级管理员角色。';
    return;
  end if;

  if v_actor = 'admin' then
    if v_target_role not in ('free', 'user') then
      return query select false, '无权修改该账号角色。';
      return;
    end if;
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
