/**
 * MonitorView.tsx  (updated)
 * Replaces mock data with:
 *  - useAgents()          → live Supabase agent grid
 *  - listenToSwarmEvents() → real on-chain TX_LOG_STREAM
 */

import { useEffect, useRef, useState } from "react";
import { listenToSwarmEvents, type TxLogEntry } from "@/lib/somniaService";
import { useAgents } from "@/hooks/useSwarmData";
import type { AgentState, DnaPattern, AgentStatus } from "@/lib/supabaseClient";

// ─── CSS pattern map (unchanged from original) ───────────────────────────────
type Pattern = DnaPattern;
type Status  = AgentStatus;

const STATUS_BY_PATTERN: Record<Pattern, Status> = {
  solid:   "ELITE",
  checker: "ACTIVE",
  stripes: "SYNC",
  dots:    "IDLE",
  grid:    "DEGRADED",
  empty:   "OFFLINE",
};

const PATTERN_STYLE: Record<Pattern, React.CSSProperties> = {
  solid: { backgroundColor: "#ffffff" },
  stripes: {
    backgroundImage: "repeating-linear-gradient(45deg, #ffffff 0 2px, #000000 2px 5px)",
  },
  dots: {
    backgroundColor: "#000000",
    backgroundImage: "radial-gradient(#ffffff 1px, transparent 1.2px)",
    backgroundSize: "5px 5px",
  },
  grid: {
    backgroundColor: "#000000",
    backgroundImage:
      "linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)",
    backgroundSize: "6px 6px",
  },
  checker: {
    backgroundImage:
      "linear-gradient(45deg, #ffffff 25%, transparent 25%, transparent 75%, #ffffff 75%), linear-gradient(45deg, #ffffff 25%, #000000 25%, #000000 75%, #ffffff 75%)",
    backgroundSize: "6px 6px",
    backgroundPosition: "0 0, 3px 3px",
  },
  empty: { backgroundColor: "#000000" },
};

// ─── Component ────────────────────────────────────────────────────────────────
interface MonitorViewProps {
  /** TX entries pushed from ForgeView on successful mint */
  externalLogs?: TxLogEntry[];
}

export function MonitorView({ externalLogs = [] }: MonitorViewProps = {}) {
  // ── Live agent grid from Supabase ──
  const { agents, loading: agentsLoading } = useAgents();
  const [hovered, setHovered] = useState<AgentState | null>(null);

  // ── TX log — seeded with placeholder rows, then prepended by chain events ──
  const [logs, setLogs] = useState<TxLogEntry[]>(() =>
    Array.from({ length: 14 }, (_, i) => ({
      hash: `0x${Array.from({ length: 40 }, () =>
        "0123456789abcdef"[Math.floor(Math.random() * 16)]
      ).join("")}`,
      block: 18402311 - i,
      gas: (Math.random() * 0.05 + 0.001).toFixed(5),
      status: Math.random() > 0.1 ? "OK" : "REVERT",
      t: new Date(Date.now() - i * 4200).toISOString().slice(11, 19),
    }))
  );

  // Flash set — hashes of freshly-arrived rows (highlights for 2s)
  const [freshHashes, setFreshHashes] = useState<Set<string>>(new Set());

  const addTxLog = (entry: TxLogEntry) => {
    setLogs((prev) => [entry, ...prev].slice(0, 22));
    setFreshHashes((s) => new Set(s).add(entry.hash));
    setTimeout(
      () =>
        setFreshHashes((s) => {
          const next = new Set(s);
          next.delete(entry.hash);
          return next;
        }),
      2000
    );
  };

  // ── Blockchain event listener ──
  useEffect(() => {
    const unsub = listenToSwarmEvents(addTxLog, (err) => {
      console.error("[MonitorView] chain error:", err.message);
    });
    return unsub;
  }, []);

  // ── Merge ForgeView TX entries when they arrive ──
  useEffect(() => {
    if (!externalLogs.length) return;
    externalLogs.forEach((entry) => addTxLog(entry));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalLogs]);

  // ── Counts ──
  const counts = agents.reduce<Record<Status, number>>(
    (acc, a) => ({ ...acc, [a.status]: (acc[a.status] || 0) + 1 }),
    { ACTIVE: 0, IDLE: 0, SYNC: 0, DEGRADED: 0, OFFLINE: 0, ELITE: 0 }
  );

  return (
    <div className="min-h-full flex flex-col">
      {/* ── HEADER ── */}
      <header className="px-4 sm:px-8 py-4 sm:py-5 border-b border-white/20 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] sm:text-[11px] tracking-[0.4em] text-white/50">
            // MESH_TELEMETRY
          </div>
          <h2 className="font-display text-xl sm:text-2xl mt-1 truncate">
            AGENT_MATRIX&nbsp;128
          </h2>
        </div>
        <div className="flex gap-3 sm:gap-6 text-[9px] sm:text-[10px] tracking-[0.3em] text-white/60 shrink-0">
          <span className="hidden sm:inline">POP {agents.length}/128</span>
          <span>
            UPLINK{" "}
            <span className={agentsLoading ? "text-white/40" : "text-white"}>
              ●
            </span>{" "}
            {agentsLoading ? "SYNC" : "LIVE"}
          </span>
        </div>
      </header>

      {/* ── GRID + INSPECTOR ── */}
      <div className="px-4 sm:px-8 py-4 sm:py-6 border-b border-white/20 grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-4 sm:gap-6">
        <div>
          {agentsLoading ? (
            <div className="h-40 flex items-center justify-center font-mono text-[11px] tracking-[0.3em] text-white/30 animate-pulse">
              LOADING SWARM DATA…
            </div>
          ) : (
            <div
              className="grid gap-[3px]"
              style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}
              onMouseLeave={() => setHovered(null)}
            >
              {agents.map((agent, i) => {
                const isHovered = hovered?.id === agent.id;
                const pattern = agent.dna as Pattern;
                return (
                  <div
                    key={agent.id}
                    onMouseEnter={() => setHovered(agent)}
                    className={[
                      "aspect-square relative cursor-crosshair transition-all duration-150 border",
                      isHovered
                        ? "border-white scale-110 z-10"
                        : "border-white/20",
                    ].join(" ")}
                    aria-label={`${agent.id} ${agent.status}`}
                  >
                    <div
                      className="absolute inset-[2px] animate-breathe"
                      style={{
                        ...PATTERN_STYLE[pattern],
                        animationDelay: `${(i % 13) * 0.18 + ((i * 0.03) % 1.5)}s`,
                        animationDuration: `${2.4 + (i % 5) * 0.3}s`,
                      }}
                    />
                    {isHovered && (
                      <div className="absolute left-1/2 -translate-x-1/2 -top-7 px-2 py-1 bg-white text-black font-mono text-[10px] tracking-[0.15em] whitespace-nowrap z-20 pointer-events-none">
                        {agent.id} · {agent.status}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* LEGEND */}
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {(Object.keys(STATUS_BY_PATTERN) as Pattern[]).map((p) => {
              const status = STATUS_BY_PATTERN[p];
              return (
                <div
                  key={p}
                  className="flex items-center gap-2 border border-white/15 px-2 py-1.5"
                >
                  <div className="w-5 h-5 border border-white/40 relative">
                    <div className="absolute inset-[1px]" style={PATTERN_STYLE[p]} />
                  </div>
                  <div className="font-mono text-[9px] tracking-[0.2em] text-white/70">
                    <div className="text-white">{status}</div>
                    <div className="text-white/40">{counts[status]} units</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── INSPECTOR ── */}
        <aside className="border border-white/25 p-4 min-h-[180px] lg:min-h-[220px] flex flex-col">
          <div className="text-[10px] tracking-[0.3em] text-white/50 mb-3">
            // INSPECTOR
          </div>
          {hovered ? (
            <div className="space-y-3 font-mono text-xs">
              <div>
                <div className="text-white/40 text-[10px] tracking-[0.25em]">
                  AGENT_ID
                </div>
                <div className="font-display text-2xl tracking-tight">
                  {hovered.id}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <div className="text-white/40 text-[9px] tracking-[0.25em]">
                    STATUS
                  </div>
                  <div className="text-white">{hovered.status}</div>
                </div>
                <div>
                  <div className="text-white/40 text-[9px] tracking-[0.25em]">
                    DNA
                  </div>
                  <div className="text-white">{hovered.dna.toUpperCase()}</div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[9px] tracking-[0.25em] text-white/40 mb-1">
                  <span>REPUTATION</span>
                  <span className="text-white">{hovered.reputation}/100</span>
                </div>
                <div className="h-2 border border-white/40">
                  <div
                    className="h-full bg-white transition-all duration-700"
                    style={{ width: `${hovered.reputation}%` }}
                  />
                </div>
              </div>
              {hovered.last_tx && (
                <div>
                  <div className="text-white/40 text-[9px] tracking-[0.25em] mb-1">
                    LAST_TX
                  </div>
                  <a
                    href={`https://shannon-explorer.somnia.network/tx/${hovered.last_tx}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/60 hover:text-white text-[10px] truncate block underline underline-offset-2"
                  >
                    {hovered.last_tx.slice(0, 18)}…
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div className="m-auto text-center text-[10px] tracking-[0.3em] text-white/30">
              HOVER&nbsp;ANY&nbsp;CELL
              <br />
              TO&nbsp;INSPECT
            </div>
          )}
        </aside>
      </div>

      {/* ── TX_LOG_STREAM ── */}
      <div className="flex-1 px-4 sm:px-8 py-4 sm:py-6 flex flex-col min-h-[260px]">
        <div className="flex items-center justify-between mb-3 gap-3">
          <span className="text-[10px] sm:text-[11px] tracking-[0.4em] text-white/60">
            // TX_LOG_STREAM
          </span>
          <span className="font-mono text-[9px] sm:text-[10px] text-white/50 truncate">
            tail -f /var/log/somnia.tx
          </span>
        </div>
        <div className="border border-white/25 flex-1 flex flex-col overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              {/* Column headers */}
              <div className="grid grid-cols-[70px_1fr_90px_90px_80px] sm:grid-cols-[80px_1fr_110px_110px_90px] px-3 sm:px-4 py-2 border-b border-white/25 text-[9px] sm:text-[10px] tracking-[0.3em] text-white/60 bg-white/5">
                <span>TIME</span>
                <span>HASH</span>
                <span>BLOCK</span>
                <span>EVENT</span>
                <span>STATUS</span>
              </div>

              {/* Rows */}
              <div className="font-mono text-[11px] sm:text-xs">
                {logs.map((l, i) => {
                  const isFresh = freshHashes.has(l.hash);
                  return (
                    <div
                      key={l.hash}
                      className={[
                        "grid grid-cols-[70px_1fr_90px_90px_80px] sm:grid-cols-[80px_1fr_110px_110px_90px]",
                        "px-3 sm:px-4 py-1.5 border-b border-white/10 transition-colors",
                        isFresh
                          ? "bg-white text-black"
                          : "hover:bg-white hover:text-black",
                      ].join(" ")}
                      style={{ opacity: isFresh ? 1 : 1 - i * 0.025 }}
                    >
                      <span className={isFresh ? "text-black/70" : "text-white/70"}>
                        {l.t}
                      </span>
                      <span className="truncate">
                        <a
                          href={`https://shannon-explorer.somnia.network/tx/${l.hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {l.hash}
                        </a>
                      </span>
                      <span>{l.block.toLocaleString()}</span>
                      <span className="truncate">
                        {l.event ?? "TX"}
                        {l.agentId ? ` · ${l.agentId}` : ""}
                      </span>
                      <span className={l.status === "OK" ? "" : "text-white font-bold"}>
                        {l.status === "OK" ? "■ OK" : "▲ REVERT"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
