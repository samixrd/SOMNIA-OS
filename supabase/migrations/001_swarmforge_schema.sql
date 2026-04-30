-- ============================================================
--  SwarmForge · Somnia Testnet
--  Supabase Migration: 001_swarmforge_schema.sql
--
--  Run this in your Supabase project:
--    Dashboard → SQL Editor → New query → paste → Run
-- ============================================================

-- ─── 1. agents_state ────────────────────────────────────────
--
--  One row per agent (128 total).
--  Updated every time an agent submits a Somnia tx or changes status.

create table if not exists public.agents_state (
  id          text         primary key,           -- "AG_001" … "AG_128"
  dna         text         not null,              -- DnaPattern visual code
  status      text         not null               -- AgentStatus
                           check (status in (
                             'ACTIVE','IDLE','SYNC','DEGRADED','OFFLINE','ELITE'
                           )),
  reputation  smallint     not null default 50     -- 0 – 100 on-chain score
                           check (reputation between 0 and 100),
  last_tx     text,                               -- latest Somnia tx hash
  updated_at  timestamptz  not null default now()
);

-- Index for fast "give me all ACTIVE agents" queries
create index if not exists idx_agents_status
  on public.agents_state (status);

-- Index for reputation leaderboard queries
create index if not exists idx_agents_reputation
  on public.agents_state (reputation desc);

-- Auto-update updated_at on any row change
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_agents_updated_at on public.agents_state;
create trigger trg_agents_updated_at
  before update on public.agents_state
  for each row execute procedure public.set_updated_at();

-- ─── 2. stability_metrics ───────────────────────────────────
--
--  Append-only time-series: one row per PID controller sample.
--  Front-end subscribes to INSERT events and streams into StabilityView.

create table if not exists public.stability_metrics (
  id               bigint      generated always as identity primary key,
  kp               numeric     not null,    -- Proportional gain
  ti               numeric     not null,    -- Integral time constant
  error_signal     numeric     not null,    -- e(t) — instantaneous error
  phase_margin     numeric,                 -- Δϕ (degrees)  — nullable until computed
  gain_margin_db   numeric,                 -- ΔK (dB)
  stability_index  numeric                  -- 0.0 – 1.0 scalar
                   check (stability_index is null
                       or stability_index between 0 and 1),
  recorded_at      timestamptz not null default now()
);

-- Fast "last N samples" lookup for the Nyquist chart
create index if not exists idx_metrics_recorded_at
  on public.stability_metrics (recorded_at desc);

-- ─── 3. Enable Realtime ────────────────────────────────────
--
--  Adds both tables to the supabase_realtime publication so
--  subscribeToAgents() and subscribeToMetrics() receive live events.

alter publication supabase_realtime add table public.agents_state;
alter publication supabase_realtime add table public.stability_metrics;

-- ─── 4. Row-Level Security ─────────────────────────────────
--
--  Enable RLS and add a permissive read policy.
--  Write operations should use the service-role key (server-side only).

alter table public.agents_state      enable row level security;
alter table public.stability_metrics enable row level security;

-- Public can read; only authenticated service role can write
drop policy if exists "agents_state public read"      on public.agents_state;
drop policy if exists "stability_metrics public read" on public.stability_metrics;

create policy "agents_state public read"
  on public.agents_state for select using (true);

create policy "stability_metrics public read"
  on public.stability_metrics for select using (true);

-- ─── 5. Utility view: swarm_summary ────────────────────────
--
--  Handy aggregate consumed by the ArchitectView status bar.

create or replace view public.swarm_summary as
select
  count(*)                                              as total_agents,
  count(*) filter (where status = 'ELITE')             as elite_count,
  count(*) filter (where status = 'ACTIVE')            as active_count,
  count(*) filter (where status = 'SYNC')              as sync_count,
  count(*) filter (where status = 'IDLE')              as idle_count,
  count(*) filter (where status = 'DEGRADED')          as degraded_count,
  count(*) filter (where status = 'OFFLINE')           as offline_count,
  round(avg(reputation), 1)                            as avg_reputation,
  max(updated_at)                                      as last_activity
from public.agents_state;

-- ─── 6. Seed guard: prevent accidental double-seed ─────────
--
--  The TypeScript seedAgents() uses ignoreDuplicates:true,
--  but this constraint makes it DB-level safe too.
--  (id is already PRIMARY KEY, so this is just documentation)

comment on table public.agents_state is
  'SwarmForge agent registry — 128 agents on Somnia Testnet';

comment on table public.stability_metrics is
  'PID + Nyquist stability snapshots, one row per controller tick';
