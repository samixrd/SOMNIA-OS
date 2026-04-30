/**
 * useSwarmData.ts
 * SwarmForge · Somnia Testnet
 *
 * Drop-in hooks that replace the mock useState/setInterval logic in
 * MonitorView and StabilityView with live Supabase real-time data.
 *
 * Usage
 * ─────
 * // MonitorView
 * const { agents, loading, error } = useAgents();
 *
 * // StabilityView
 * const { metrics, history, loading } = useStabilityMetrics();
 */

import { useEffect, useReducer, useRef, useState } from "react";
import {
  fetchAllAgents,
  fetchLatestMetrics,
  subscribeToAgents,
  subscribeToMetrics,
  type AgentState,
  type StabilityMetric,
} from "../lib/supabaseClient";

// ─── useAgents ────────────────────────────────────────────────────────────────

type AgentMap = Map<string, AgentState>;

type AgentAction =
  | { type: "INIT"; agents: AgentState[] }
  | { type: "INSERT" | "UPDATE"; agent: AgentState }
  | { type: "DELETE"; agent: AgentState };

function agentReducer(state: AgentMap, action: AgentAction): AgentMap {
  const next = new Map(state);
  switch (action.type) {
    case "INIT":
      action.agents.forEach((a) => next.set(a.id, a));
      return next;
    case "INSERT":
    case "UPDATE":
      next.set(action.agent.id, action.agent);
      return next;
    case "DELETE":
      next.delete(action.agent.id);
      return next;
  }
}

export interface UseAgentsResult {
  /** Ordered array of all 128 agents (sorted by id) */
  agents: AgentState[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetches the full 128-agent roster on mount and subscribes to live changes.
 * Returns a stable sorted array so MonitorView can render the grid directly.
 */
export function useAgents(): UseAgentsResult {
  const [agentMap, dispatch] = useReducer(agentReducer, new Map<string, AgentState>());
  const [loading, setLoading]  = useState(true);
  const [error, setError]      = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // 1. Initial fetch
    fetchAllAgents()
      .then((agents) => {
        if (!cancelled) {
          dispatch({ type: "INIT", agents });
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err?.message ?? err));
          setLoading(false);
        }
      });

    // 2. Real-time subscription
    const unsub = subscribeToAgents((agent, eventType) => {
      dispatch({ type: eventType, agent });
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const agents = Array.from(agentMap.values()).sort((a, b) =>
    a.id.localeCompare(b.id)
  );

  return { agents, loading, error };
}

// ─── useStabilityMetrics ──────────────────────────────────────────────────────

const MAX_HISTORY = 60; // keep last 60 snapshots for Nyquist chart

export interface UseStabilityMetricsResult {
  /** The most-recent metrics row */
  metrics: StabilityMetric | null;
  /** Rolling window of the last MAX_HISTORY rows (chronological) */
  history: StabilityMetric[];
  loading: boolean;
  error: string | null;
}

/**
 * Loads the latest stability snapshot and subscribes to new inserts.
 * The `history` array is capped at MAX_HISTORY to keep memory bounded.
 */
export function useStabilityMetrics(): UseStabilityMetricsResult {
  const [metrics, setMetrics] = useState<StabilityMetric | null>(null);
  const [history, setHistory] = useState<StabilityMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const historyRef = useRef<StabilityMetric[]>([]);

  useEffect(() => {
    let cancelled = false;

    fetchLatestMetrics()
      .then((row) => {
        if (!cancelled && row) {
          setMetrics(row);
          historyRef.current = [row];
          setHistory([row]);
        }
        if (!cancelled) setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err?.message ?? err));
          setLoading(false);
        }
      });

    const unsub = subscribeToMetrics((row) => {
      setMetrics(row);
      historyRef.current = [...historyRef.current, row].slice(-MAX_HISTORY);
      setHistory([...historyRef.current]);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  return { metrics, history, loading, error };
}

// ─── useSwarmSummary ──────────────────────────────────────────────────────────

export interface SwarmSummary {
  totalAgents: number;
  eliteCount:  number;
  activeCount: number;
  syncCount:   number;
  idleCount:   number;
  degradedCount: number;
  offlineCount: number;
  avgReputation: number;
  lastActivity: string | null;
}

/** Derives swarm summary stats from the live agent list — no extra round-trip. */
export function useSwarmSummary(): SwarmSummary {
  const { agents } = useAgents();

  return {
    totalAgents:    agents.length,
    eliteCount:     agents.filter((a) => a.status === "ELITE").length,
    activeCount:    agents.filter((a) => a.status === "ACTIVE").length,
    syncCount:      agents.filter((a) => a.status === "SYNC").length,
    idleCount:      agents.filter((a) => a.status === "IDLE").length,
    degradedCount:  agents.filter((a) => a.status === "DEGRADED").length,
    offlineCount:   agents.filter((a) => a.status === "OFFLINE").length,
    avgReputation:
      agents.length > 0
        ? Math.round(
            agents.reduce((s, a) => s + a.reputation, 0) / agents.length
          )
        : 0,
    lastActivity:
      agents.reduce<string | null>(
        (best, a) =>
          !best || a.updated_at > best ? a.updated_at : best,
        null
      ),
  };
}
