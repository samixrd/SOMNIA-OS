/**
 * supabaseClient.ts
 * SwarmForge · Somnia Testnet
 *
 * Handles real-time sync for:
 *   - agents_state      (128 agents: DNA pattern, status, last tx hash)
 *   - stability_metrics (PID tuning + Nyquist / error state)
 */

import { createClient, RealtimeChannel } from "@supabase/supabase-js";

// ─── env ─────────────────────────────────────────────────────────────────────
// Vite exposes VITE_* vars; for server-side (TanStack Start SSR) use process.env
const SUPABASE_URL =
  (typeof import.meta !== "undefined"
    ? (import.meta as any).env?.VITE_SUPABASE_URL
    : undefined) ?? process.env.VITE_SUPABASE_URL ?? "";

const SUPABASE_ANON_KEY =
  (typeof import.meta !== "undefined"
    ? (import.meta as any).env?.VITE_SUPABASE_ANON_KEY
    : undefined) ?? process.env.VITE_SUPABASE_ANON_KEY ?? "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    "[SwarmForge] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set. " +
      "Add them to your .env file."
  );
}

// ─── client singleton ─────────────────────────────────────────────────────────
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: {
    params: {
      eventsPerSecond: 20, // Somnia's 400k TPS means we can be generous
    },
  },
});

// ─── Domain types ─────────────────────────────────────────────────────────────

/** Visual DNA pattern → drives MonitorView agent cell rendering */
export type DnaPattern =
  | "solid"
  | "checker"
  | "stripes"
  | "dots"
  | "grid"
  | "empty";

/** Operational status derived from on-chain activity */
export type AgentStatus =
  | "ACTIVE"
  | "IDLE"
  | "SYNC"
  | "DEGRADED"
  | "OFFLINE"
  | "ELITE";

/**
 * agents_state — one row per agent (128 total)
 *
 * DDL (run in Supabase SQL editor):
 * ─────────────────────────────────
 * create table public.agents_state (
 *   id         text      primary key,          -- e.g. "AG_001"
 *   dna        text      not null,             -- DnaPattern
 *   status     text      not null,             -- AgentStatus
 *   reputation smallint  not null default 50,  -- 0-100
 *   last_tx    text,                           -- latest Somnia tx hash (0x…)
 *   updated_at timestamptz not null default now()
 * );
 *
 * -- Enable Realtime for this table:
 * alter publication supabase_realtime add table public.agents_state;
 *
 * -- Row-level security (optional but recommended):
 * alter table public.agents_state enable row level security;
 * create policy "public read" on public.agents_state for select using (true);
 */
export interface AgentState {
  id: string;           // "AG_001" … "AG_128"
  dna: DnaPattern;
  status: AgentStatus;
  reputation: number;   // 0–100
  last_tx: string | null;
  updated_at: string;   // ISO timestamp
}

/**
 * stability_metrics — single-row (or time-series) PID + Nyquist state
 *
 * DDL:
 * ─────────────────────────────────
 * create table public.stability_metrics (
 *   id              bigint    generated always as identity primary key,
 *   kp              numeric   not null,   -- proportional gain
 *   ti              numeric   not null,   -- integral time constant
 *   error_signal    numeric   not null,   -- current PID error e(t)
 *   phase_margin    numeric,              -- Δϕ degrees
 *   gain_margin_db  numeric,              -- ΔK dB
 *   stability_index numeric,              -- 0–1 scalar
 *   recorded_at     timestamptz not null default now()
 * );
 *
 * -- Enable Realtime:
 * alter publication supabase_realtime add table public.stability_metrics;
 */
export interface StabilityMetric {
  id: number;
  kp: number;             // Proportional gain Kp
  ti: number;             // Integral time Ti
  error_signal: number;   // e(t) — the instantaneous PID error
  phase_margin: number | null;    // Δϕ (degrees)
  gain_margin_db: number | null;  // ΔK (dB)
  stability_index: number | null; // 0.0 – 1.0
  recorded_at: string;
}

// ─── Typed query helpers ──────────────────────────────────────────────────────

/** Fetch all 128 agents, ordered by id */
export async function fetchAllAgents(): Promise<AgentState[]> {
  const { data, error } = await supabase
    .from("agents_state")
    .select("*")
    .order("id", { ascending: true });

  if (error) throw new Error(`[agents_state] fetch error: ${error.message}`);
  return (data ?? []) as AgentState[];
}

/** Fetch the most-recent stability metrics row */
export async function fetchLatestMetrics(): Promise<StabilityMetric | null> {
  const { data, error } = await supabase
    .from("stability_metrics")
    .select("*")
    .order("recorded_at", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 = "no rows" — not a real error
    throw new Error(`[stability_metrics] fetch error: ${error.message}`);
  }
  return (data as StabilityMetric) ?? null;
}

/** Upsert a single agent row (called by the Somnia tx listener) */
export async function upsertAgent(
  agent: Omit<AgentState, "updated_at">
): Promise<void> {
  const { error } = await supabase
    .from("agents_state")
    .upsert({ ...agent, updated_at: new Date().toISOString() });

  if (error) throw new Error(`[agents_state] upsert error: ${error.message}`);
}

/** Insert a new stability snapshot */
export async function insertMetrics(
  metrics: Omit<StabilityMetric, "id" | "recorded_at">
): Promise<void> {
  const { error } = await supabase
    .from("stability_metrics")
    .insert({ ...metrics, recorded_at: new Date().toISOString() });

  if (error)
    throw new Error(`[stability_metrics] insert error: ${error.message}`);
}

// ─── Real-time subscription helpers ──────────────────────────────────────────

export type AgentChangeHandler = (
  payload: AgentState,
  eventType: "INSERT" | "UPDATE" | "DELETE"
) => void;

export type MetricsChangeHandler = (
  payload: StabilityMetric,
  eventType: "INSERT" | "UPDATE"
) => void;

/**
 * Subscribe to live changes on agents_state.
 *
 * Usage:
 *   const unsub = subscribeToAgents((agent, event) => {
 *     dispatch({ type: event, agent });
 *   });
 *   // on component unmount:
 *   unsub();
 */
export function subscribeToAgents(
  handler: AgentChangeHandler
): () => void {
  const channel: RealtimeChannel = supabase
    .channel("agents_state_changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "agents_state" },
      (payload) => {
        const eventType = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
        const record =
          eventType === "DELETE"
            ? (payload.old as AgentState)
            : (payload.new as AgentState);
        handler(record, eventType);
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.info("[SwarmForge] 🟢 agents_state realtime active");
      } else if (status === "CHANNEL_ERROR") {
        console.error("[SwarmForge] ❌ agents_state realtime error");
      }
    });

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribe to new rows on stability_metrics (INSERT + UPDATE only).
 *
 * Usage:
 *   const unsub = subscribeToMetrics((row) => setMetrics(row));
 *   unsub(); // on unmount
 */
export function subscribeToMetrics(
  handler: MetricsChangeHandler
): () => void {
  const channel: RealtimeChannel = supabase
    .channel("stability_metrics_changes")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "stability_metrics",
      },
      (payload) => handler(payload.new as StabilityMetric, "INSERT")
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "stability_metrics",
      },
      (payload) => handler(payload.new as StabilityMetric, "UPDATE")
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.info("[SwarmForge] 🟢 stability_metrics realtime active");
      }
    });

  return () => {
    supabase.removeChannel(channel);
  };
}

// ─── Seed helper (dev only) ───────────────────────────────────────────────────

const DNA_POOL: DnaPattern[] = [
  "solid", "solid",
  "checker", "checker", "checker",
  "stripes", "stripes", "stripes",
  "dots", "dots", "dots", "dots",
  "grid", "grid",
  "empty",
];

const STATUS_BY_DNA: Record<DnaPattern, AgentStatus> = {
  solid: "ELITE",
  checker: "ACTIVE",
  stripes: "SYNC",
  dots: "IDLE",
  grid: "DEGRADED",
  empty: "OFFLINE",
};

/**
 * Seed the database with 128 agent rows (call once from dev console).
 * Only inserts rows that don't already exist.
 *
 * Example: await seedAgents();
 */
export async function seedAgents(): Promise<void> {
  const agents: Omit<AgentState, "updated_at">[] = Array.from(
    { length: 128 },
    (_, i) => {
      const dna = DNA_POOL[Math.floor(Math.random() * DNA_POOL.length)];
      const status = STATUS_BY_DNA[dna];
      const repBase: Record<AgentStatus, number> = {
        ELITE: 95, ACTIVE: 75, SYNC: 60, IDLE: 45, DEGRADED: 25, OFFLINE: 0,
      };
      return {
        id: `AG_${String(i + 1).padStart(3, "0")}`,
        dna,
        status,
        reputation: Math.min(
          100,
          Math.max(0, repBase[status] + Math.round((Math.random() - 0.5) * 12))
        ),
        last_tx: null,
      };
    }
  );

  // upsert in one batch — onConflict = "id" so it's idempotent
  const { error } = await supabase
    .from("agents_state")
    .upsert(
      agents.map((a) => ({ ...a, updated_at: new Date().toISOString() })),
      { onConflict: "id", ignoreDuplicates: true }
    );

  if (error) throw new Error(`[seedAgents] ${error.message}`);
  console.info("[SwarmForge] ✅ Seeded 128 agents");
}
