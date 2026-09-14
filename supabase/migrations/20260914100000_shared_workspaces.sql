-- Shared workspaces, invitations, project access and per-workspace SMTP settings.
--
-- Before this migration every row belonged to a single auth user (RLS: user_id = auth.uid()).
-- Now every row belongs to a workspace (workspace_id). A person gets into a workspace through a
-- members row linked to their auth user (members.auth_user_id), which only happens by accepting an
-- invitation (or by creating the workspace). user_id stays on each row and now means "created by".

create schema if not exists private;
grant usage on schema private to authenticated;

-- 1. workspaces get their own id ---------------------------------------------------------------

alter table public.workspaces add column id uuid not null default gen_random_uuid();
alter table public.workspaces drop constraint workspaces_pkey;
alter table public.workspaces add constraint workspaces_pkey primary key (id);
create index workspaces_user_idx on public.workspaces (user_id);

-- 2. workspace_id on every data table ----------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['members', 'clients', 'projects', 'tasks', 'tags', 'time_entries', 'expenses',
                           'invoices', 'time_off_policies', 'time_off_requests', 'approvals', 'schedules'] loop
    -- rows whose owner never got a workspace row get one now
    execute format('insert into public.workspaces (user_id) select distinct x.user_id from public.%I x
                    where not exists (select 1 from public.workspaces w where w.user_id = x.user_id)', t);
    execute format('alter table public.%I add column workspace_id uuid references public.workspaces(id) on delete cascade', t);
    execute format('update public.%I x set workspace_id = w.id from public.workspaces w where w.user_id = x.user_id', t);
    execute format('alter table public.%I alter column workspace_id set not null', t);
    execute format('create index %I on public.%I (workspace_id)', t || '_workspace_idx', t);
    -- user_id now means "created by": keep the row when that account is deleted
    execute format('alter table public.%I alter column user_id drop not null', t);
    execute format('alter table public.%I drop constraint %I', t, t || '_user_id_fkey');
    execute format('alter table public.%I add constraint %I foreign key (user_id) references auth.users(id) on delete set null', t, t || '_user_id_fkey');
  end loop;
end $$;

-- Temporary bridge for the previous app version, which inserts rows without workspace_id:
-- such rows land in the caller's own workspace. Dropped by the next migration once the new
-- app version is live.
create function private.default_workspace_id() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.workspace_id is null then
    select w.id into new.workspace_id from public.workspaces w
     where w.user_id = (select auth.uid()) order by w.created_at limit 1;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['members', 'clients', 'projects', 'tasks', 'tags', 'time_entries', 'expenses',
                           'invoices', 'time_off_policies', 'time_off_requests', 'approvals', 'schedules'] loop
    execute format('create trigger zz_default_workspace_id before insert on public.%I
                    for each row execute function private.default_workspace_id()', t);
  end loop;
end $$;

-- 3. members are linked to auth users ----------------------------------------------------------

alter table public.members add column auth_user_id uuid references auth.users(id) on delete set null;
create unique index members_workspace_auth_user_key on public.members (workspace_id, auth_user_id) where auth_user_id is not null;
create index members_auth_user_idx on public.members (auth_user_id);

-- the owner's existing Owner row becomes their membership
update public.members m set auth_user_id = w.user_id, status = 'Active'
  from public.workspaces w
 where m.workspace_id = w.id
   and m.id = (select m2.id from public.members m2
                where m2.workspace_id = w.id and m2.role = 'Owner'
                order by m2.created_at limit 1);

-- workspaces without an Owner row get one
insert into public.members (workspace_id, user_id, auth_user_id, name, email, role, status)
select w.id, w.user_id, w.user_id,
       coalesce(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
       coalesce(u.email, ''), 'Owner', 'Active'
  from public.workspaces w
  join auth.users u on u.id = w.user_id
 where not exists (select 1 from public.members m where m.workspace_id = w.id and m.auth_user_id = w.user_id);

-- 4. project access ----------------------------------------------------------------------------

alter table public.projects add column is_public boolean not null default true;

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, member_id)
);
create index project_members_member_idx on public.project_members (member_id);
create index project_members_workspace_idx on public.project_members (workspace_id);
alter table public.project_members enable row level security;

-- 5. invitations (only reachable through the functions below and the invite edge function) ----

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz
);
create index invitations_member_idx on public.invitations (member_id);
create index invitations_workspace_idx on public.invitations (workspace_id);
create index invitations_invited_by_idx on public.invitations (invited_by);
alter table public.invitations enable row level security;
revoke all on public.invitations from anon, authenticated;

-- 6. SMTP settings per workspace; the password lives in Supabase Vault ------------------------

create table public.workspace_smtp (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  host text not null,
  port integer not null default 465 check (port between 1 and 65535),
  secure boolean not null default true,
  username text not null default '',
  password_secret_id uuid,
  from_email text not null,
  from_name text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
create index workspace_smtp_updated_by_idx on public.workspace_smtp (updated_by);
alter table public.workspace_smtp enable row level security;
revoke all on public.workspace_smtp from anon, authenticated;

create function private.drop_smtp_secret() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.password_secret_id is not null then
    delete from vault.secrets where id = old.password_secret_id;
  end if;
  return old;
end $$;
create trigger workspace_smtp_drop_secret after delete on public.workspace_smtp
  for each row execute function private.drop_smtp_secret();

-- 7. access helpers used by the policies -------------------------------------------------------

create function private.member_workspaces() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select w.id from public.workspaces w where w.user_id = (select auth.uid())
  union
  select m.workspace_id from public.members m where m.auth_user_id = (select auth.uid())
$$;

create function private.manager_workspaces() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select w.id from public.workspaces w where w.user_id = (select auth.uid())
  union
  select m.workspace_id from public.members m
   where m.auth_user_id = (select auth.uid()) and m.role in ('Owner', 'Admin', 'Manager')
$$;

create function private.admin_workspaces() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select w.id from public.workspaces w where w.user_id = (select auth.uid())
  union
  select m.workspace_id from public.members m
   where m.auth_user_id = (select auth.uid()) and m.role in ('Owner', 'Admin')
$$;

create function private.my_member_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.id from public.members m where m.auth_user_id = (select auth.uid())
$$;

create function private.is_workspace_admin(p_workspace uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.admin_workspaces() a(id) where a.id = p_workspace)
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.member_workspaces(), private.manager_workspaces(),
  private.admin_workspaces(), private.my_member_ids(), private.is_workspace_admin(uuid) to authenticated;

-- 8. policies ----------------------------------------------------------------------------------

do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

do $$
declare
  m   constant text := 'workspace_id in (select private.member_workspaces())';
  g   constant text := 'workspace_id in (select private.manager_workspaces())';
  a   constant text := 'workspace_id in (select private.admin_workspaces())';
  own constant text := 'member_id in (select private.my_member_ids())';
  t text;
  read_sql text;
  write_sql text;
begin
  -- read by every member, written by managers (or admins for members)
  foreach t in array array['members', 'clients', 'tasks', 'time_off_policies', 'schedules', 'project_members', 'projects', 'invoices'] loop
    read_sql := case t
      when 'projects' then format('(%s) or ((%s) and (is_public or id in (select pm.project_id from public.project_members pm where pm.member_id in (select private.my_member_ids()))))', g, m)
      when 'tasks' then format('(%s) and project_id in (select p.id from public.projects p)', m)
      when 'invoices' then g
      else m
    end;
    write_sql := case t when 'members' then a else g end;
    execute format('create policy "read" on public.%I for select to authenticated using (%s)', t, read_sql);
    execute format('create policy "insert" on public.%I for insert to authenticated with check (%s)', t, write_sql);
    execute format('create policy "update" on public.%I for update to authenticated using (%s) with check (%s)', t, write_sql, write_sql);
    execute format('create policy "delete" on public.%I for delete to authenticated using (%s)', t, write_sql);
  end loop;

  -- tags: anyone can add one while tracking, managers curate them
  execute format('create policy "read" on public.tags for select to authenticated using (%s)', m);
  execute format('create policy "insert" on public.tags for insert to authenticated with check (%s)', m);
  execute format('create policy "update" on public.tags for update to authenticated using (%s) with check (%s)', g, g);
  execute format('create policy "delete" on public.tags for delete to authenticated using (%s)', g);

  -- time and expenses: members see and edit their own, managers everything
  foreach t in array array['time_entries', 'expenses'] loop
    write_sql := format('(%s) or ((%s) and (%s))', g, m, own);
    execute format('create policy "read" on public.%I for select to authenticated using (%s)', t, write_sql);
    execute format('create policy "insert" on public.%I for insert to authenticated with check (%s)', t, write_sql);
    execute format('create policy "update" on public.%I for update to authenticated using (%s) with check (%s)', t, write_sql, write_sql);
    execute format('create policy "delete" on public.%I for delete to authenticated using (%s)', t, write_sql);
  end loop;

  -- requests: members file and withdraw their own pending ones, managers decide
  foreach t in array array['time_off_requests', 'approvals'] loop
    read_sql := format('(%s) or ((%s) and (%s))', g, m, own);
    write_sql := format('(%s) or ((%s) and (%s) and status = ''Pending'')', g, m, own);
    execute format('create policy "read" on public.%I for select to authenticated using (%s)', t, m);
    execute format('create policy "insert" on public.%I for insert to authenticated with check (%s)', t, write_sql);
    execute format('create policy "update" on public.%I for update to authenticated using (%s) with check (%s)', t, read_sql, write_sql);
    execute format('create policy "delete" on public.%I for delete to authenticated using (%s)', t, write_sql);
  end loop;
end $$;

create policy "read" on public.workspaces for select to authenticated
  using (id in (select private.member_workspaces()));
create policy "update" on public.workspaces for update to authenticated
  using (id in (select private.admin_workspaces())) with check (id in (select private.admin_workspaces()));
create policy "delete" on public.workspaces for delete to authenticated
  using (user_id = (select auth.uid()));

-- 9. guards the policies can't express ----------------------------------------------------------

-- a members row is linked to an auth user only by accepting an invitation (security definer)
create function private.guard_member_link() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' and new.auth_user_id is not null and new.auth_user_id is distinct from (select auth.uid()) then
      raise exception 'Members join a workspace by accepting an invitation.';
    elsif tg_op = 'UPDATE' and new.auth_user_id is distinct from old.auth_user_id then
      raise exception 'Members join a workspace by accepting an invitation.';
    end if;
  end if;
  return new;
end $$;
create trigger members_guard_link before insert or update on public.members
  for each row execute function private.guard_member_link();

create function private.guard_workspace_owner() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and new.user_id is distinct from old.user_id then
    raise exception 'The workspace owner can''t be changed.';
  end if;
  return new;
end $$;
create trigger workspaces_guard_owner before update on public.workspaces
  for each row execute function private.guard_workspace_owner();

-- tags are now scoped by workspace
create or replace function public.on_tag_deleted() returns trigger
language plpgsql set search_path to 'public' as $$
begin
  update public.time_entries
     set tag_ids = array_remove(tag_ids, old.id)
   where workspace_id = old.workspace_id
     and old.id = any(tag_ids);
  return old;
end $$;

-- 10. functions called by the app --------------------------------------------------------------

create function public.create_workspace(p_name text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  u record;
  ws uuid;
begin
  if uid is null then raise exception 'Sign in first.'; end if;
  select email, coalesce(raw_user_meta_data->>'name', raw_user_meta_data->>'full_name', split_part(email, '@', 1)) as name
    into u from auth.users where id = uid;
  insert into public.workspaces (user_id, name)
  values (uid, coalesce(nullif(trim(p_name), ''), u.name || '''s workspace'))
  returning id into ws;
  insert into public.members (workspace_id, user_id, auth_user_id, name, email, role, status)
  values (ws, uid, uid, u.name, coalesce(u.email, ''), 'Owner', 'Active');
  return ws;
end $$;

create function public.get_invitation(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r record;
begin
  select i.email, i.expires_at, i.accepted_at, w.name as workspace_name, m.name as member_name,
         coalesce(iu.raw_user_meta_data->>'name', iu.raw_user_meta_data->>'full_name', iu.email) as inviter_name
    into r
    from public.invitations i
    join public.workspaces w on w.id = i.workspace_id
    join public.members m on m.id = i.member_id
    left join auth.users iu on iu.id = i.invited_by
   where i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;
  return jsonb_build_object(
    'status', case when r.accepted_at is not null then 'accepted' when r.expires_at < now() then 'expired' else 'valid' end,
    'email', r.email,
    'workspaceName', r.workspace_name,
    'memberName', r.member_name,
    'inviterName', r.inviter_name,
    'userExists', exists (select 1 from auth.users u where lower(u.email) = lower(r.email))
  );
end $$;

create function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  my_email text;
  inv public.invitations;
begin
  if uid is null then raise exception 'Sign in first.'; end if;
  select * into inv from public.invitations
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
   for update;
  if not found then raise exception 'This invitation link is not valid.'; end if;

  select email into my_email from auth.users where id = uid;
  if lower(coalesce(my_email, '')) <> lower(inv.email) then
    raise exception 'This invitation was sent to %. Sign in with that email address to accept it.', inv.email;
  end if;

  if inv.accepted_at is not null then
    if exists (select 1 from public.members where workspace_id = inv.workspace_id and auth_user_id = uid) then
      return inv.workspace_id;
    end if;
    raise exception 'This invitation has already been used.';
  end if;
  if inv.expires_at < now() then
    raise exception 'This invitation has expired. Ask the person who invited you to send a new one.';
  end if;

  if not exists (select 1 from public.members where workspace_id = inv.workspace_id and auth_user_id = uid) then
    update public.members set auth_user_id = uid, status = 'Active' where id = inv.member_id;
  end if;
  update public.invitations set accepted_at = now() where id = inv.id;
  return inv.workspace_id;
end $$;

create function public.get_smtp_settings(p_workspace uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if not private.is_workspace_admin(p_workspace) then
    raise exception 'Only workspace owners and admins can manage email settings.';
  end if;
  select jsonb_build_object(
           'host', s.host, 'port', s.port, 'secure', s.secure, 'username', s.username,
           'fromEmail', s.from_email, 'fromName', s.from_name,
           'hasPassword', s.password_secret_id is not null, 'updatedAt', s.updated_at)
    into r
    from public.workspace_smtp s where s.workspace_id = p_workspace;
  return r;
end $$;

create function public.save_smtp_settings(
  p_workspace uuid, p_host text, p_port integer, p_secure boolean, p_username text,
  p_password text, p_from_email text, p_from_name text
) returns void
language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  if not private.is_workspace_admin(p_workspace) then
    raise exception 'Only workspace owners and admins can manage email settings.';
  end if;
  if coalesce(trim(p_host), '') = '' then raise exception 'SMTP host is required.'; end if;
  if coalesce(trim(p_from_email), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Sender email is not a valid address.'; end if;
  if p_port is null or p_port not between 1 and 65535 then raise exception 'Port must be between 1 and 65535.'; end if;
  if p_port in (25, 587) then
    raise exception 'Port % is blocked for outgoing mail from Supabase Edge Functions. Use 465 (SSL/TLS) or 2525 (STARTTLS).', p_port;
  end if;

  select password_secret_id into sid from public.workspace_smtp where workspace_id = p_workspace;
  if coalesce(p_password, '') <> '' then
    if sid is null then
      sid := vault.create_secret(p_password, 'smtp_password_' || p_workspace::text, 'SMTP password for Jamify workspace');
    else
      perform vault.update_secret(sid, p_password);
    end if;
  end if;

  insert into public.workspace_smtp (workspace_id, host, port, secure, username, password_secret_id, from_email, from_name, updated_at, updated_by)
  values (p_workspace, trim(p_host), p_port, coalesce(p_secure, true), coalesce(trim(p_username), ''), sid,
          trim(p_from_email), coalesce(trim(p_from_name), ''), now(), (select auth.uid()))
  on conflict (workspace_id) do update set
    host = excluded.host, port = excluded.port, secure = excluded.secure, username = excluded.username,
    password_secret_id = excluded.password_secret_id, from_email = excluded.from_email,
    from_name = excluded.from_name, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end $$;

create function public.delete_smtp_settings(p_workspace uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_workspace_admin(p_workspace) then
    raise exception 'Only workspace owners and admins can manage email settings.';
  end if;
  delete from public.workspace_smtp where workspace_id = p_workspace;
end $$;

-- used by the invite edge function only
create function public.smtp_config_for_sending(p_workspace uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'host', s.host, 'port', s.port, 'secure', s.secure, 'username', s.username,
           'password', ds.decrypted_secret, 'fromEmail', s.from_email, 'fromName', s.from_name)
    from public.workspace_smtp s
    left join vault.decrypted_secrets ds on ds.id = s.password_secret_id
   where s.workspace_id = p_workspace
$$;

revoke all on function public.create_workspace(text), public.get_invitation(text), public.accept_invitation(text),
  public.get_smtp_settings(uuid), public.save_smtp_settings(uuid, text, integer, boolean, text, text, text, text),
  public.delete_smtp_settings(uuid), public.smtp_config_for_sending(uuid)
  from public, anon, authenticated;
grant execute on function public.create_workspace(text), public.accept_invitation(text),
  public.get_smtp_settings(uuid), public.save_smtp_settings(uuid, text, integer, boolean, text, text, text, text),
  public.delete_smtp_settings(uuid) to authenticated;
grant execute on function public.get_invitation(text) to anon, authenticated;
grant execute on function public.smtp_config_for_sending(uuid) to service_role;
