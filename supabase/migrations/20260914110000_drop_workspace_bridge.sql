-- The app now sends workspace_id with every insert: remove the bridge added for the previous
-- app version in 20260914100000_shared_workspaces.sql. Apply after the new app version is live.

do $$
declare t text;
begin
  foreach t in array array['members', 'clients', 'projects', 'tasks', 'tags', 'time_entries', 'expenses',
                           'invoices', 'time_off_policies', 'time_off_requests', 'approvals', 'schedules'] loop
    execute format('drop trigger if exists zz_default_workspace_id on public.%I', t);
  end loop;
end $$;

drop function if exists private.default_workspace_id();
