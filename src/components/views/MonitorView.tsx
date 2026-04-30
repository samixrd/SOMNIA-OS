import { useEffect, useMemo, useState } from "react";

function randHash() {
  const chars = "0123456789abcdef";
  let s = "0x";
  for (let i = 0; i < 40; i++) s += chars[Math.floor(Math.random() * 16)];
  return s;
}

type Log = { hash: string; block: number; gas: string; status: string; t: string };

type Pattern = "solid" | "stripes" | "dots" | "grid" | "checker" | "empty";
type Status = "ACTIVE" | "IDLE" | "SYNC" | "DEGRADED" | "OFFLINE" | "ELITE";

type Agent = {
  id: string;
  pattern: Pattern;
  status: Status;
  reputation: number; // 0-100
};

const STATUS_BY_PATTERN: Record<Pattern, Status> = {
  solid: "ELITE",       // pure white — highest reputation
  checker: "ACTIVE",    // operating
  stripes: "SYNC",      // syncing
  dots: "IDLE",         // standby
  grid: "DEGRADED",     // partial
  empty: "OFFLINE",     // black, dead
};

// CSS-only monochrome patterns
const PATTERN_STYLE: Record<Pattern, React.CSSProperties> = {
  solid: { backgroundColor: "#ffffff" },
  stripes: {
    backgroundImage:
      "repeating-linear-gradient(45deg, #ffffff 0 2px, #000000 2px 5px)",
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

const PATTERN_POOL: Pattern[] = [
  "solid", "solid",
  "checker", "checker", "checker",
  "stripes", "stripes", "stripes",
  "dots", "dots", "dots", "dots",
  "grid", "grid",
  "empty",
];

function buildAgents(): Agent[] {
  return Array.from({ length: 128 }, (_, i) => {
    const pattern = PATTERN_POOL[Math.floor(Math.random() * PATTERN_POOL.length)];
    const status = STATUS_BY_PATTERN[pattern];
    const repBase: Record<Status, number> = {
      ELITE: 95, ACTIVE: 75, SYNC: 60, IDLE: 45, DEGRADED: 25, OFFLINE: 0,
    };
    const reputation = Math.min(100, Math.max(0, repBase[status] + Math.floor((Math.random() - 0.5) * 12)));
    return {
      id: `AG_${String(i + 1).padStart(3, "0")}`,
      pattern,
      status,
      reputation,
    };
  });
}

export function MonitorView() {
  const agents = useMemo(buildAgents, []);
  const [hovered, setHovered] = useState<Agent | null>(null);

  const [logs, setLogs] = useState<Log[]>(() =>
    Array.from({ length: 14 }, (_, i) => ({
      hash: randHash(),
      block: 18402311 - i,
      gas: (Math.random() * 0.05 + 0.001).toFixed(5),
      status: Math.random() > 0.1 ? "OK" : "REVERT",
      t: new Date(Date.now() - i * 4200).toISOString().slice(11, 19),
    })),
  );

  useEffect(() => {
    const id = setInterval(() => {
      setLogs((prev) => [
        {
          hash: randHash(),
          block: prev[0].block + 1,
          gas: (Math.random() * 0.05 + 0.001).toFixed(5),
          status: Math.random() > 0.08 ? "OK" : "REVERT",
          t: new Date().toISOString().slice(11, 19),
        },
        ...prev,
      ].slice(0, 22));
    }, 1500);
    return () => clearInterval(id);
  }, []);

  const counts = agents.reduce<Record<Status, number>>(
    (acc, a) => ({ ...acc, [a.status]: (acc[a.status] || 0) + 1 }),
    { ACTIVE: 0, IDLE: 0, SYNC: 0, DEGRADED: 0, OFFLINE: 0, ELITE: 0 },
  );

  return (
    <div className="min-h-full flex flex-col">
      <header className="px-4 sm:px-8 py-4 sm:py-5 border-b border-white/20 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] sm:text-[11px] tracking-[0.4em] text-white/50">// MESH_TELEMETRY</div>
          <h2 className="font-display text-xl sm:text-2xl mt-1 truncate">AGENT_MATRIX&nbsp;128</h2>
        </div>
        <div className="flex gap-3 sm:gap-6 text-[9px] sm:text-[10px] tracking-[0.3em] text-white/60 shrink-0">
          <span className="hidden sm:inline">POP {agents.length}/128</span>
          <span>UPLINK <span className="text-white">●</span> LIVE</span>
        </div>
      </header>

      {/* GRID + INSPECTOR */}
      <div className="px-4 sm:px-8 py-4 sm:py-6 border-b border-white/20 grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-4 sm:gap-6">
        <div>
          <div
            className="grid gap-[3px]"
            style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}
            onMouseLeave={() => setHovered(null)}
          >
            {agents.map((agent, i) => {
              const isHovered = hovered?.id === agent.id;
              return (
                <div
                  key={agent.id}
                  onMouseEnter={() => setHovered(agent)}
                  className={[
                    "aspect-square relative cursor-crosshair transition-all duration-150",
                    "border",
                    isHovered ? "border-white scale-110 z-10" : "border-white/20",
                  ].join(" ")}
                  aria-label={`${agent.id} ${agent.status}`}
                >
                  <div
                    className="absolute inset-[2px] animate-breathe"
                    style={{
                      ...PATTERN_STYLE[agent.pattern],
                      animationDelay: `${(i % 13) * 0.18 + (i * 0.03) % 1.5}s`,
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

          {/* LEGEND */}
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {(Object.keys(STATUS_BY_PATTERN) as Pattern[]).map((p) => {
              const status = STATUS_BY_PATTERN[p];
              return (
                <div key={p} className="flex items-center gap-2 border border-white/15 px-2 py-1.5">
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

        {/* INSPECTOR */}
        <aside className="border border-white/25 p-4 min-h-[180px] lg:min-h-[220px] flex flex-col">
          <div className="text-[10px] tracking-[0.3em] text-white/50 mb-3">// INSPECTOR</div>
          {hovered ? (
            <div className="space-y-3 font-mono text-xs">
              <div>
                <div className="text-white/40 text-[10px] tracking-[0.25em]">AGENT_ID</div>
                <div className="font-display text-2xl tracking-tight">{hovered.id}</div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <div className="text-white/40 text-[9px] tracking-[0.25em]">STATUS</div>
                  <div className="text-white">{hovered.status}</div>
                </div>
                <div>
                  <div className="text-white/40 text-[9px] tracking-[0.25em]">PATTERN</div>
                  <div className="text-white">{hovered.pattern.toUpperCase()}</div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[9px] tracking-[0.25em] text-white/40 mb-1">
                  <span>REPUTATION</span><span className="text-white">{hovered.reputation}/100</span>
                </div>
                <div className="h-2 border border-white/40">
                  <div className="h-full bg-white" style={{ width: `${hovered.reputation}%` }} />
                </div>
              </div>
            </div>
          ) : (
            <div className="m-auto text-center text-[10px] tracking-[0.3em] text-white/30">
              HOVER&nbsp;ANY&nbsp;CELL<br />TO&nbsp;INSPECT
            </div>
          )}
        </aside>
      </div>

      {/* TERMINAL TABLE */}
      <div className="flex-1 px-4 sm:px-8 py-4 sm:py-6 flex flex-col min-h-[260px]">
        <div className="flex items-center justify-between mb-3 gap-3">
          <span className="text-[10px] sm:text-[11px] tracking-[0.4em] text-white/60">// TX_LOG_STREAM</span>
          <span className="font-mono text-[9px] sm:text-[10px] text-white/50 truncate">tail -f /var/log/somnia.tx</span>
        </div>
        <div className="border border-white/25 flex-1 flex flex-col overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <div className="grid grid-cols-[70px_1fr_90px_90px_80px] sm:grid-cols-[80px_1fr_110px_110px_90px] px-3 sm:px-4 py-2 border-b border-white/25 text-[9px] sm:text-[10px] tracking-[0.3em] text-white/60 bg-white/5">
                <span>TIME</span><span>HASH</span><span>BLOCK</span><span>GAS</span><span>STATUS</span>
              </div>
              <div className="font-mono text-[11px] sm:text-xs">
                {logs.map((l, i) => (
                  <div
                    key={l.hash}
                    className="grid grid-cols-[70px_1fr_90px_90px_80px] sm:grid-cols-[80px_1fr_110px_110px_90px] px-3 sm:px-4 py-1.5 border-b border-white/10 hover:bg-white hover:text-black transition-colors"
                    style={{ opacity: 1 - i * 0.025 }}
                  >
                    <span className="text-white/70">{l.t}</span>
                    <span className="truncate">{l.hash}</span>
                    <span>{l.block}</span>
                    <span>{l.gas}</span>
                    <span className={l.status === "OK" ? "" : "text-white"}>
                      {l.status === "OK" ? "■ OK" : "▲ REVERT"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
