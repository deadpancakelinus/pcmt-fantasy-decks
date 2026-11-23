-- Run PCMT.gg sync from the backend (update, not live yet). Paste into the Supabase SQL editor on release day.
-- The backend's Dashboard has a "Run PCMT.gg sync" button: it starts the GitHub Action .github/workflows/pcmt-sync.yml
-- (the same as Actions -> PCMT.gg sync -> Run workflow) and shows how the latest run went.
--
-- It needs a GitHub token kept in Supabase Vault (never in the site, the repo or a chat):
--   1. GitHub -> Settings -> Developer settings -> Fine-grained personal access tokens -> Generate new token.
--      Repository access: only deadpancakelinus/pcmt-fantasy-decks. Permissions: Actions -> Read and write. Pick an expiry.
--   2. Supabase -> Project Settings -> Vault -> Add new secret, name: github_sync_token, value: the token.
--      (When it expires, make a new one and replace the secret's value; nothing else changes.)
-- Safe to run again.

-- Latest sync run on GitHub: { status, conclusion, started, url } (status: queued / in_progress / completed).
create or replace function public.fb_sync_status() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare tok text; res extensions.http_response; run jsonb;
begin
  if not (public.is_freshbatch() or exists (select 1 from public.pcmt_admins a where a.user_id = auth.uid())) then
    raise exception 'Only PCMT Team staff can do that.';
  end if;
  select decrypted_secret into tok from vault.decrypted_secrets where name = 'github_sync_token' limit 1;
  if tok is null then return jsonb_build_object('error', 'no_token'); end if;
  res := extensions.http(('GET', 'https://api.github.com/repos/deadpancakelinus/pcmt-fantasy-decks/actions/workflows/pcmt-sync.yml/runs?per_page=1',
    array[extensions.http_header('Authorization', 'Bearer ' || tok), extensions.http_header('Accept', 'application/vnd.github+json'),
          extensions.http_header('User-Agent', 'pcmt-fantasy-backend'), extensions.http_header('X-GitHub-Api-Version', '2022-11-28')],
    null, null)::extensions.http_request);
  if res.status <> 200 then return jsonb_build_object('error', 'github_' || res.status); end if;
  run := (res.content::jsonb) -> 'workflow_runs' -> 0;
  if run is null then return jsonb_build_object('status', 'none'); end if;
  return jsonb_build_object('status', run ->> 'status', 'conclusion', run ->> 'conclusion', 'started', run ->> 'run_started_at',
                            'event', run ->> 'event', 'url', run ->> 'html_url');
end $$;

-- Start a sync run (skipped if one is already queued or running).
create or replace function public.fb_run_sync() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare tok text; res extensions.http_response; cur jsonb;
begin
  if not (public.is_freshbatch() or exists (select 1 from public.pcmt_admins a where a.user_id = auth.uid())) then
    raise exception 'Only PCMT Team staff can do that.';
  end if;
  select decrypted_secret into tok from vault.decrypted_secrets where name = 'github_sync_token' limit 1;
  if tok is null then return jsonb_build_object('error', 'no_token'); end if;
  cur := public.fb_sync_status();
  if cur ->> 'status' in ('queued', 'in_progress', 'waiting', 'requested', 'pending') then return cur || jsonb_build_object('already', true); end if;
  res := extensions.http(('POST', 'https://api.github.com/repos/deadpancakelinus/pcmt-fantasy-decks/actions/workflows/pcmt-sync.yml/dispatches',
    array[extensions.http_header('Authorization', 'Bearer ' || tok), extensions.http_header('Accept', 'application/vnd.github+json'),
          extensions.http_header('User-Agent', 'pcmt-fantasy-backend'), extensions.http_header('X-GitHub-Api-Version', '2022-11-28')],
    'application/json', '{"ref":"main"}')::extensions.http_request);
  if res.status <> 204 then return jsonb_build_object('error', 'github_' || res.status); end if;
  return jsonb_build_object('started', true);
end $$;

revoke all on function public.fb_sync_status() from public, anon;
revoke all on function public.fb_run_sync() from public, anon;
grant execute on function public.fb_sync_status() to authenticated;
grant execute on function public.fb_run_sync() to authenticated;
