-- Industry Research production infrastructure schema.
-- First production-oriented Supabase slice: authoritative run records,
-- delivery artifacts, n8n callback events, and zvec local-index metadata.
--
-- Access model:
-- - No client-side table access in v1.
-- - No Supabase Auth dependency in v1.
-- - Server-side service_role writes only.
-- - RLS is enabled on every table and no anon/authenticated policies are added.

create table if not exists public.industry_research_runs (
  run_id text primary key,
  owner_id uuid,
  project_name text not null,
  template_id text not null,
  industry text not null,
  category text not null,
  market text not null,
  research_goal text not null,
  status text not null check (
    status in (
      'running',
      'ready_for_internal_review',
      'needs_review_with_crawl_failures',
      'blocked_no_raw_documents',
      'failed'
    )
  ),
  mode text not null,
  llm_status text not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  input jsonb not null,
  manifest jsonb,
  run_log jsonb,
  counts jsonb not null default '{}'::jsonb,
  source_quality_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.industry_research_artifacts (
  run_id text not null references public.industry_research_runs(run_id) on delete cascade,
  kind text not null check (
    kind in (
      'input',
      'raw_documents',
      'databases',
      'review_items',
      'report',
      'reviewed_report',
      'run_log',
      'manifest'
    )
  ),
  content_type text not null,
  json_content jsonb,
  text_content text,
  byte_size integer not null default 0 check (byte_size >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (run_id, kind),
  check (json_content is not null or text_content is not null)
);

create table if not exists public.industry_research_n8n_events (
  id bigserial primary key,
  run_id text not null,
  status text not null check (status in ('queued', 'running', 'completed', 'failed')),
  n8n_execution_id text,
  delivery_package_api_path text,
  message text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);

create table if not exists public.industry_research_zvec_chunks (
  chunk_id text primary key,
  run_id text not null references public.industry_research_runs(run_id) on delete cascade,
  artifact_kind text not null,
  chunk_index integer not null check (chunk_index >= 0),
  title text not null,
  text_hash text not null,
  text_excerpt text not null,
  metadata jsonb not null default '{}'::jsonb,
  zvec_collection text not null default 'industry_research_chunks',
  sync_status text not null default 'pending' check (sync_status in ('pending', 'indexed', 'failed')),
  indexed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists industry_research_runs_finished_at_idx
  on public.industry_research_runs(finished_at desc);

create index if not exists industry_research_artifacts_kind_idx
  on public.industry_research_artifacts(kind);

create index if not exists industry_research_n8n_events_run_id_idx
  on public.industry_research_n8n_events(run_id, received_at desc);

create index if not exists industry_research_zvec_chunks_run_id_idx
  on public.industry_research_zvec_chunks(run_id, artifact_kind, chunk_index);

alter table public.industry_research_runs enable row level security;
alter table public.industry_research_artifacts enable row level security;
alter table public.industry_research_n8n_events enable row level security;
alter table public.industry_research_zvec_chunks enable row level security;

revoke all on table public.industry_research_runs from anon, authenticated;
revoke all on table public.industry_research_artifacts from anon, authenticated;
revoke all on table public.industry_research_n8n_events from anon, authenticated;
revoke all on table public.industry_research_zvec_chunks from anon, authenticated;
revoke all on sequence public.industry_research_n8n_events_id_seq from public;
revoke all on sequence public.industry_research_n8n_events_id_seq from anon, authenticated;

grant select, insert, update, delete on table public.industry_research_runs to service_role;
grant select, insert, update, delete on table public.industry_research_artifacts to service_role;
grant select, insert, update, delete on table public.industry_research_n8n_events to service_role;
grant select, insert, update, delete on table public.industry_research_zvec_chunks to service_role;
grant usage, select on sequence public.industry_research_n8n_events_id_seq to service_role;

comment on table public.industry_research_runs is
  'Authoritative server-side run records for the industry research agent. RLS deny-by-default; service_role only in v1.';
comment on table public.industry_research_artifacts is
  'Delivery package artifacts keyed by run_id and artifact kind. Mirrors the local 8-file delivery package.';
comment on table public.industry_research_n8n_events is
  'n8n callback event ledger. Does not require a foreign key so orphan callbacks can be audited.';
comment on table public.industry_research_zvec_chunks is
  'Metadata for local zvec chunks. zvec remains a cache, not authoritative storage.';
