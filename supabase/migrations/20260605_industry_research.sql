-- Industry Research Product Line schema draft.
-- First implementation uses local mock data. Apply this migration only when
-- Supabase persistence is intentionally enabled.

create table if not exists research_projects (
  id text primary key,
  name text not null,
  template_id text not null,
  industry text not null,
  category text not null,
  market text not null,
  goal text not null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists source_discovery_plans (
  id text primary key,
  project_id text not null references research_projects(id) on delete cascade,
  industry text not null,
  category text not null,
  market text not null,
  research_goal text not null,
  seed_keywords jsonb not null default '[]'::jsonb,
  required_databases jsonb not null default '[]'::jsonb,
  notes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists source_discovery_candidates (
  id text primary key,
  project_id text not null references research_projects(id) on delete cascade,
  plan_id text not null references source_discovery_plans(id) on delete cascade,
  source_type text not null,
  discovery_method text not null,
  title text not null,
  seed text not null,
  priority text not null,
  expected_databases jsonb not null default '[]'::jsonb,
  compliance_boundary text not null,
  status text not null default 'planned',
  created_at timestamptz not null default now()
);

create table if not exists crawl_plans (
  id text primary key,
  project_id text not null references research_projects(id) on delete cascade,
  mode text not null default 'mock',
  guardrails jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists crawl_plan_targets (
  id text primary key,
  project_id text not null references research_projects(id) on delete cascade,
  plan_id text not null references crawl_plans(id) on delete cascade,
  candidate_id text references source_discovery_candidates(id) on delete set null,
  target_kind text not null,
  target_value text not null,
  reason text not null,
  max_pages integer not null default 1,
  database_targets jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists crawl_jobs (
  id text primary key,
  project_id text not null references research_projects(id) on delete cascade,
  target_id text not null references crawl_plan_targets(id) on delete cascade,
  status text not null default 'queued',
  planned_action text not null,
  tool_candidate_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists crawl_runs (
  id text primary key,
  project_id text not null references research_projects(id) on delete cascade,
  job_id text not null references crawl_jobs(id) on delete cascade,
  status text not null default 'done',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  documents_created integer not null default 0,
  summary text not null default ''
);

create table if not exists research_sources (
  id text primary key,
  project_id text not null references research_projects(id) on delete cascade,
  source_type text not null,
  title text not null,
  source_value text not null,
  automation_hint text,
  created_at timestamptz not null default now()
);

create table if not exists raw_documents (
  id text primary key,
  project_id text not null references research_projects(id) on delete cascade,
  source_id text not null references research_sources(id) on delete cascade,
  crawl_run_id text not null references crawl_runs(id) on delete cascade,
  url text not null,
  title text not null,
  content_type text not null,
  excerpt text not null,
  extracted_text text not null,
  database_targets jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists research_documents (
  id text primary key,
  project_id text not null references research_projects(id) on delete cascade,
  source_id text not null references research_sources(id) on delete cascade,
  raw_document_id text references raw_documents(id) on delete set null,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists extraction_jobs (
  id text primary key,
  project_id text not null references research_projects(id) on delete cascade,
  raw_document_id text not null references raw_documents(id) on delete cascade,
  target_database text not null,
  status text not null default 'done',
  extracted_count integer not null default 0,
  summary text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists competitors (
  id text primary key,
  project_id text not null references research_projects(id) on delete cascade,
  name text not null,
  channel text not null,
  website_structure jsonb not null default '[]'::jsonb,
  collection_signals jsonb not null default '[]'::jsonb,
  positioning text not null,
  evidence_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists product_signals (
  id text primary key,
  project_id text not null references research_projects(id) on delete cascade,
  competitor_id text references competitors(id) on delete set null,
  category text not null,
  signal text not null,
  tags jsonb not null default '[]'::jsonb,
  evidence_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists pain_points (
  id text primary key,
  project_id text not null references research_projects(id) on delete cascade,
  theme text not null,
  user_need text not null,
  frequency text not null,
  evidence_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists content_signals (
  id text primary key,
  project_id text not null references research_projects(id) on delete cascade,
  platform text not null,
  topic text not null,
  content_type text not null,
  why_it_works text not null,
  evidence_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists opportunities (
  id text primary key,
  project_id text not null references research_projects(id) on delete cascade,
  title text not null,
  summary text not null,
  demand_score integer not null,
  competition_score integer not null,
  content_gap_score integer not null,
  business_value_score integer not null,
  evidence_quality_score integer not null,
  total_score integer not null,
  review_status text not null default 'needs_review',
  review_note text not null default '',
  evidence_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists evidence (
  id text primary key,
  project_id text not null references research_projects(id) on delete cascade,
  source_id text not null references research_sources(id) on delete cascade,
  raw_document_id text references raw_documents(id) on delete set null,
  quote text not null,
  note text not null,
  created_at timestamptz not null default now()
);

create table if not exists research_reports (
  id text primary key,
  project_id text not null references research_projects(id) on delete cascade,
  report_format text not null default 'markdown',
  title text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists research_workflow_runs (
  id text primary key,
  project_id text not null references research_projects(id) on delete cascade,
  template_id text not null,
  run_mode text not null default 'mock',
  status text not null default 'done',
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists source_database (
  id text primary key,
  project_id text not null references research_projects(id) on delete cascade,
  source_id text not null references research_sources(id) on delete cascade,
  source_type text not null,
  discovery_method text not null,
  title text not null,
  source_value text not null,
  priority text not null,
  reliability text not null default 'mock',
  refresh_cadence text not null default 'manual',
  compliance_boundary text not null,
  created_at timestamptz not null default now()
);

create table if not exists competitor_database (
  id text primary key,
  project_id text not null references research_projects(id) on delete cascade,
  competitor_id text references competitors(id) on delete set null,
  name text not null,
  market text not null,
  channel text not null,
  positioning text not null,
  source_ids jsonb not null default '[]'::jsonb,
  evidence_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists website_structure_database (
  id text primary key,
  project_id text not null references research_projects(id) on delete cascade,
  competitor_id text references competitors(id) on delete set null,
  url text not null,
  sections jsonb not null default '[]'::jsonb,
  commerce_signals jsonb not null default '[]'::jsonb,
  content_signals jsonb not null default '[]'::jsonb,
  source_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists product_database (
  id text primary key,
  project_id text not null references research_projects(id) on delete cascade,
  competitor_id text references competitors(id) on delete set null,
  name text not null,
  category text not null,
  price_signal text not null,
  tags jsonb not null default '[]'::jsonb,
  evidence_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists keyword_database (
  id text primary key,
  project_id text not null references research_projects(id) on delete cascade,
  keyword text not null,
  intent text not null,
  source text not null,
  evidence_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists pain_point_database (
  id text primary key,
  project_id text not null references research_projects(id) on delete cascade,
  theme text not null,
  user_need text not null,
  frequency text not null,
  source_ids jsonb not null default '[]'::jsonb,
  evidence_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists content_database (
  id text primary key,
  project_id text not null references research_projects(id) on delete cascade,
  platform text not null,
  topic text not null,
  content_type text not null,
  why_it_works text not null,
  evidence_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists opportunity_database (
  id text primary key,
  project_id text not null references research_projects(id) on delete cascade,
  opportunity_id text references opportunities(id) on delete set null,
  title text not null,
  summary text not null,
  total_score integer not null,
  review_status text not null default 'needs_review',
  evidence_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists weekly_intelligence_reports (
  id text primary key,
  project_id text not null references research_projects(id) on delete cascade,
  week_of date not null,
  title text not null,
  summary text not null,
  new_signals jsonb not null default '[]'::jsonb,
  watch_list jsonb not null default '[]'::jsonb,
  evidence_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Row Level Security  (added 2026-06-08, audit fix P0-1)
-- ------------------------------------------------------------
-- Deny-by-default. Enabling RLS with NO permissive policy means the
-- anon and authenticated roles get ZERO access. The service_role key
-- (used only server-side) bypasses RLS, so server writes keep working.
-- Do NOT expose any table to the client (anon/authenticated) until you
-- add scoped policies — see the multi-tenant template at the bottom.
-- ============================================================

alter table research_projects            enable row level security;
alter table source_discovery_plans       enable row level security;
alter table source_discovery_candidates  enable row level security;
alter table crawl_plans                  enable row level security;
alter table crawl_plan_targets           enable row level security;
alter table crawl_jobs                   enable row level security;
alter table crawl_runs                   enable row level security;
alter table research_sources             enable row level security;
alter table raw_documents                enable row level security;
alter table research_documents           enable row level security;
alter table extraction_jobs              enable row level security;
alter table competitors                  enable row level security;
alter table product_signals              enable row level security;
alter table pain_points                  enable row level security;
alter table content_signals              enable row level security;
alter table opportunities                enable row level security;
alter table evidence                     enable row level security;
alter table research_reports             enable row level security;
alter table research_workflow_runs       enable row level security;
alter table source_database              enable row level security;
alter table competitor_database          enable row level security;
alter table website_structure_database   enable row level security;
alter table product_database             enable row level security;
alter table keyword_database             enable row level security;
alter table pain_point_database          enable row level security;
alter table content_database             enable row level security;
alter table opportunity_database         enable row level security;
alter table weekly_intelligence_reports  enable row level security;

-- TODO(multi-tenant): before opening client (authenticated) access,
-- add an owner column + policies to each table, e.g.:
--   alter table research_projects add column owner_id uuid not null default auth.uid();
--   create policy "owner_select" on research_projects
--     for select using (auth.uid() = owner_id);
--   create policy "owner_modify" on research_projects
--     for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
-- Child tables can scope via their project_id -> research_projects.owner_id.
