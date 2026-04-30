import { useEffect, useRef, useState } from "react";

export function ArchitectView() {
  const [kp, setKp] = useState("0.847");
  const [ti, setTi] = useState("12.40");
  const [swarm, setSwarm] = useState("256");

  // Build a 3D-ish wireframe neural mesh: layers of nodes with connecting lines.
  const layers = [4, 7, 9, 7, 4];
  const W = 520;
  const H = 420;
  const nodes: { x: number; y: number; layer: number; idx: number }[] = [];
  layers.forEach((count, li) => {
    const x = ((li + 1) / (layers.length + 1)) * W;
    for (let i = 0; i < count; i++) {
      const y = ((i + 1) / (count + 1)) * H;
      // skew for pseudo-3D
      const skewY = y + (li - 2) * 6;
      nodes.push({ x, y: skewY, layer: li, idx: i });
    }
  });

  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let li = 0; li < layers.length - 1; li++) {
    const a = nodes.filter((n) => n.layer === li);
    const b = nodes.filter((n) => n.layer === li + 1);
    a.forEach((n1) => b.forEach((n2) => lines.push({ x1: n1.x, y1: n1.y, x2: n2.x, y2: n2.y })));
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 min-h-full">
      {/* LEFT — wireframe */}
      <div className="relative border-b lg:border-b-0 lg:border-r border-white/20 blueprint-grid overflow-hidden min-h-[280px] sm:min-h-[360px] lg:min-h-0">
        <div className="absolute top-0 left-0 right-0 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between border-b border-white/15 bg-black/60 backdrop-blur-sm z-10 text-[10px] sm:text-[11px] tracking-[0.3em] text-white/60">
          <span className="truncate">SCHEMATIC // NEURAL_MESH_v4.2</span>
          <span className="shrink-0 ml-3">SCALE 1:1</span>
        </div>

        <div className="absolute inset-0 pt-12 pb-10 flex items-center justify-center">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-[92%] h-[82%]">
            <defs>
              <pattern id="cross" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width={W} height={H} fill="url(#cross)" />
            {/* outer frame */}
            <rect x="2" y="2" width={W - 4} height={H - 4} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1" strokeDasharray="4 4" />

            {lines.map((l, i) => (
              <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="rgba(255,255,255,0.18)" strokeWidth="0.6" />
            ))}
            {nodes.map((n, i) => (
              <g key={i}>
                <circle cx={n.x} cy={n.y} r="4" fill="#000" stroke="#fff" strokeWidth="1" />
                <circle cx={n.x} cy={n.y} r="1.5" fill="#fff" />
              </g>
            ))}

            {/* annotations */}
            <line x1="20" y1={H - 20} x2="80" y2={H - 20} stroke="#fff" strokeWidth="1" />
            <text x="20" y={H - 26} fill="#fff" fontFamily="JetBrains Mono" fontSize="9">100mm</text>
            <text x={W - 110} y={20} fill="rgba(255,255,255,0.6)" fontFamily="JetBrains Mono" fontSize="9">REV.014 / 04.29.2026</text>
          </svg>
        </div>

        <div className="absolute bottom-0 left-0 right-0 px-4 sm:px-6 py-2 sm:py-3 border-t border-white/15 bg-black/60 flex justify-between text-[9px] sm:text-[10px] tracking-[0.3em] text-white/50">
          <span>NODES: {nodes.length}</span>
          <span className="hidden sm:inline">EDGES: {lines.length}</span>
          <span>TOPOLOGY: DENSE_FF</span>
        </div>
      </div>

      {/* RIGHT — input fields */}
      <div className="p-5 sm:p-8 lg:p-10 flex flex-col gap-6 sm:gap-8 lg:gap-10">
        <header>
          <div className="text-[11px] tracking-[0.4em] text-white/50">// CONTROLLER_PARAMETERS</div>
          <h2 className="font-display text-3xl sm:text-4xl mt-2">TUNING&nbsp;BLOCK</h2>
          <p className="text-sm text-white/60 mt-3 max-w-md leading-relaxed">
            Calibrate the proportional, integral and swarm-density coefficients of the active mesh. Values are committed to the controller on FORGE.
          </p>
        </header>

        <Field label="Kp" sub="Proportional gain" value={kp} onChange={setKp} unit="V/rad" />
        <Field label="Ti" sub="Integral time constant" value={ti} onChange={setTi} unit="ms" />
        <Field label="Swarm_Count" sub="Active agent population" value={swarm} onChange={setSwarm} unit="agents" />

        <div className="border border-white/30 p-4 grid grid-cols-3 gap-4 text-[10px] tracking-[0.25em] text-white/60">
          <div><div className="text-white text-base font-display">98.4%</div>STABILITY</div>
          <div><div className="text-white text-base font-display">14.2ms</div>LATENCY</div>
          <div><div className="text-white text-base font-display">NOMINAL</div>STATUS</div>
        </div>

        <GasReservoir />
      </div>
    </div>
  );
}

function GasReservoir() {
  const [reserve, setReserve] = useState(0.34); // 0..1 of cap
  const CAP = 5000; // SOM
  const [fetching, setFetching] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => { timersRef.current.forEach(clearTimeout); }, []);

  const onRequest = () => {
    if (fetching) return;
    setFetching(true);
    const t = setTimeout(() => {
      setReserve((r) => Math.min(1, r + 0.22 + Math.random() * 0.08));
      setFetching(false);
      setPulseKey((k) => k + 1);
    }, 2000);
    timersRef.current.push(t);
  };

  const balance = Math.round(reserve * CAP);
  const low = reserve < 0.2;

  return (
    <div className="border border-white/40 bg-black">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/30">
        <div className="font-mono text-[10px] tracking-[0.3em] text-white/70">// GAS_RESERVOIR</div>
        <div className={`font-mono text-[10px] tracking-[0.3em] flex items-center gap-1.5 ${low ? "text-white animate-pulse" : "text-white/60"}`}>
          <span className="w-1.5 h-1.5 bg-white" />
          {low ? "LOW" : "OK"} · TESTNET
        </div>
      </div>

      <div className="px-4 pt-4 pb-3">
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <span className="font-display text-2xl text-white tabular-nums">
            {balance.toLocaleString()}
            <span className="font-mono text-[10px] text-white/50 tracking-[0.3em] ml-2">SOM</span>
          </span>
          <span className="font-mono text-[10px] tracking-[0.3em] text-white/50">
            CAP {CAP.toLocaleString()}
          </span>
        </div>

        {/* segmented progress bar */}
        <div className="relative h-3 border border-white/50 bg-black overflow-hidden">
          <div
            key={pulseKey}
            className="absolute inset-y-0 left-0 bg-white transition-[width] duration-700 ease-out"
            style={{ width: `${reserve * 100}%` }}
          />
          {/* 10 tick marks */}
          <div className="absolute inset-0 flex">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="flex-1 border-r border-black/60 last:border-r-0" />
            ))}
          </div>
          {fetching && (
            <div className="absolute inset-0 overflow-hidden">
              <div className="absolute inset-y-0 w-1/3 bg-white/30 animate-faucet-sweep" />
            </div>
          )}
        </div>

        <div className="mt-1 flex justify-between font-mono text-[9px] tracking-[0.3em] text-white/40">
          <span>0</span>
          <span className="tabular-nums text-white/70">{Math.round(reserve * 100)}%</span>
          <span>{CAP.toLocaleString()}</span>
        </div>
      </div>

      <button
        onClick={onRequest}
        disabled={fetching}
        className={[
          "w-full border-t border-white/40 px-4 py-3 font-mono text-xs tracking-[0.3em] text-left flex items-center justify-between gap-3 transition-colors",
          fetching
            ? "bg-white/5 text-white cursor-wait"
            : "text-white hover:bg-white hover:text-black",
        ].join(" ")}
        style={{ borderRadius: 0 }}
      >
        <span className="font-bold uppercase truncate">
          {fetching ? "FETCHING_FROM_FAUCET..." : "REQUEST_TESTNET_FUNDS"}
        </span>
        {fetching ? (
          <span className="font-mono text-[10px] tracking-[0.2em] flex items-center gap-1 shrink-0">
            <span className="inline-block w-1.5 h-1.5 bg-white animate-pulse" />
            <span className="inline-block w-1.5 h-1.5 bg-white animate-pulse [animation-delay:120ms]" />
            <span className="inline-block w-1.5 h-1.5 bg-white animate-pulse [animation-delay:240ms]" />
          </span>
        ) : (
          <span className="shrink-0">▸</span>
        )}
      </button>
    </div>
  );
}

function Field({
  label, sub, value, onChange, unit,
}: { label: string; sub: string; value: string; onChange: (v: string) => void; unit: string }) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-2 gap-2">
        <span className="font-mono text-xs tracking-[0.3em] text-white">{label.toUpperCase()}</span>
        <span className="font-mono text-[9px] sm:text-[10px] tracking-[0.2em] text-white/40 truncate">{sub.toUpperCase()}</span>
      </div>
      <div className="flex border border-white/40 focus-within:border-white">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-0 bg-transparent px-3 sm:px-4 py-2.5 sm:py-3 font-mono text-xl sm:text-2xl text-white outline-none"
        />
        <div className="px-3 sm:px-4 flex items-center border-l border-white/40 text-[10px] sm:text-xs text-white/60 tracking-[0.2em] shrink-0">{unit}</div>
      </div>
    </label>
  );
}
