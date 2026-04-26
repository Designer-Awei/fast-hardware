-- Fast Hardware
-- 免费版角色 `free`（低于 `user`）及集市发布 RLS 收紧；与前端 `isFullAccountRole` 双保险。

-- ---------------------------------------------------------------------------
-- 1. user_roles：允许 `free`
-- ---------------------------------------------------------------------------
alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles
  add constraint user_roles_role_check
  check (role in ('free', 'user', 'admin', 'super_admin'));

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

-- ---------------------------------------------------------------------------
-- 2. profiles.role：允许 `free`（若表存在；约束名与 `001_init` 一致）
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.profiles') is not null then
    alter table public.profiles drop constraint if exists profiles_role_check;
    alter table public.profiles
      add constraint profiles_role_check
      check (role in ('free', 'user', 'admin', 'super_admin'));
  end if;
exception
  when duplicate_object then
    null;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. 权限统计：增加免费用户数（OUT 参数变更须先 DROP，不可仅靠 CREATE OR REPLACE）
-- ---------------------------------------------------------------------------
drop function if exists public.get_permission_management_stats();

create function public.get_permission_management_stats()
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
  if public.current_user_role() <> 'super_admin' then
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
-- 4. 超级管理员可设置 free / user / admin（不可改 super_admin）
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
  v_role text := lower(trim(coalesce(p_role, '')));
  v_target_role text;
begin
  if public.current_user_role() <> 'super_admin' then
    return query select false, '权限不足，仅超级管理员可修改角色。';
    return;
  end if;

  if v_role not in ('free', 'user', 'admin') then
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

-- ---------------------------------------------------------------------------
-- 5. 集市待发布：禁止 `free` 插入（依赖 user_roles 真源）
-- ---------------------------------------------------------------------------
drop policy if exists "marketplace_posts_insert_own" on public.marketplace_posts;
create policy "marketplace_posts_insert_own"
on public.marketplace_posts
for insert
to authenticated
with check (
  author_id = auth.uid()
  and status = 'pending'
  and exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('user', 'admin', 'super_admin')
  )
);

-- ---------------------------------------------------------------------------
-- 6. project_backups（若已部署）：插入仅 user+；共享 SELECT 排除 free
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.project_backups') is null then
    return;
  end if;

  execute 'drop policy if exists "project_backups_insert_own" on public.project_backups';

  execute $p$
    create policy "project_backups_insert_own"
    on public.project_backups
    for insert
    to authenticated
    with check (
      user_id = auth.uid()
      and exists (
        select 1 from public.user_roles ur
        where ur.user_id = auth.uid()
          and ur.role in ('user', 'admin', 'super_admin')
      )
    );
  $p$;

  execute 'drop policy if exists "project_backups_select_shared_authenticated" on public.project_backups';

  execute $p$
    create policy "project_backups_select_shared_authenticated"
    on public.project_backups
    for select
    to authenticated
    using (
      user_id is distinct from auth.uid()
      and exists (
        select 1 from public.user_roles ur
        where ur.user_id = auth.uid()
          and ur.role in ('user', 'admin', 'super_admin')
      )
    );
  $p$;
end
$$;
