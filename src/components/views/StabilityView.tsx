import { useEffect, useMemo, useRef, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

const FEED_TEMPLATES = [
  "[SYSTEM]: Latency detected on Somnia Node 4",
  "[PID]: Adjusting Damping Factor to 0.707",
  "[OBS]: Nyquist contour radius locked at 1.000",
  "[CALC]: Phase margin Δϕ = {pm}°",
  "[CALC]: Gain margin ΔK = {gm} dB",
  "[WARN]: Mesh node 0x7e1a drift +0.04",
  "[AUTO]: Recalibrating Kp → {kp}",
  "[INFO]: Swarm consensus {a}/{b}",
  "[OBS]: Encirclements about (-1, j0): 0",
  "[INFO]: System classified MINIMUM_PHASE",
  "[AUTO]: Committing tuning vector to mesh",
  "[INFO]: Stability invariant HOLD",
  "[CALC]: Sensitivity peak Ms = 1.31",
  "[WARN]: Latency spike 22ms on shard-04",
  "[AUTO]: Rerouting through shard-09",
  "[INFO]: Entropy 0.0042 — within bound",
  "[SYSTEM]: Heartbeat ack from Somnia Node 1..7",
  "[PID]: Integral windup clamped at 4.20",
  "[AUTO]: Hot-swapping controller → C_v9.21.4",
  "[OBS]: Bode crossover ωc = 1.84 rad/s",
];

function fmt(tpl: string) {
  return tpl
    .replace("{pm}", (44 + Math.random() * 6).toFixed(1))
    .replace("{gm}", (7 + Math.random() * 3).toFixed(1))
    .replace("{kp}", (0.82 + Math.random() * 0.05).toFixed(3))
    .replace("{a}", String(240 + Math.floor(Math.random() * 16)))
    .replace("{b}", "256");
}

type Pt = { re: number; im: number; w: number };

function generateNyquist(seed: number, jitter: number): Pt[] {
  // G(s) = K / ((s+0.5)(s+1.5)) with slow time-varying K
  const K = 1 + Math.sin(seed * 0.3) * 0.08;
  const pts: Pt[] = [];
  for (let i = 0; i <= 240; i++) {
    const w = Math.pow(10, -1.5 + (i / 240) * 3);
    const re1 = 0.5, im1 = w;
    const re2 = 1.5, im2 = w;
    const dRe = re1 * re2 - im1 * im2;
    const dIm = re1 * im2 + re2 * im1;
    const mag = dRe * dRe + dIm * dIm;
    const re = (K * dRe) / mag + (Math.random() - 0.5) * jitter;
    const im = (-K * dIm) / mag + (Math.random() - 0.5) * jitter;
    pts.push({ re, im, w });
  }
  // mirror conjugate
  for (let i = 240; i >= 0; i--) {
    const w = Math.pow(10, -1.5 + (i / 240) * 3);
    const re1 = 0.5, im1 = -w;
    const re2 = 1.5, im2 = -w;
    const dRe = re1 * re2 - im1 * im2;
    const dIm = re1 * im2 + re2 * im1;
    const mag = dRe * dRe + dIm * dIm;
    const re = (K * dRe) / mag + (Math.random() - 0.5) * jitter;
    const im = (-K * dIm) / mag + (Math.random() - 0.5) * jitter;
    pts.push({ re, im, w: -w });
  }
  return pts;
}

export function StabilityView() {
  const [data, setData] = useState<Pt[]>(() => generateNyquist(0, 0.002));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => t + 1);
      setData(generateNyquist(Date.now() / 1000, 0.004));
    }, 2000);
    return () => clearInterval(id);
  }, []);

  type FeedItem = { id: number; t: string; text: string };
  const [feed, setFeed] = useState<FeedItem[]>(() =>
    Array.from({ length: 6 }, (_, i) => ({
      id: i,
      t: new Date(Date.now() - (6 - i) * 1500).toISOString().slice(11, 19),
      text: fmt(FEED_TEMPLATES[i % FEED_TEMPLATES.length]),
    })),
  );
  const feedIdRef = useRef(6);
  const feedEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      const next: FeedItem = {
        id: feedIdRef.current++,
        t: new Date().toISOString().slice(11, 19),
        text: fmt(FEED_TEMPLATES[Math.floor(Math.random() * FEED_TEMPLATES.length)]),
      };
      setFeed((prev) => [...prev, next].slice(-60));
    }, 1100);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [feed]);

  const stats = useMemo(() => {
    const pm = (44 + Math.sin(tick * 0.4) * 3).toFixed(1);
    const gm = (8 + Math.cos(tick * 0.3) * 1.2).toFixed(1);
    return { pm, gm };
  }, [tick]);

  // Neural load — driven by feed activity (recent burst rate)
  const [load, setLoad] = useState(0.3);
  const lastFeedLen = useRef(feed.length);
  useEffect(() => {
    const delta = feed.length - lastFeedLen.current;
    lastFeedLen.current = feed.length;
    setLoad((l) => Math.min(1, Math.max(0.05, l * 0.7 + delta * 0.35 + Math.random() * 0.15)));
  }, [feed.length]);
  const [jitter, setJitter] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setJitter(Math.random()), 90);
    return () => clearInterval(id);
  }, []);

  // Stability index — drops occasionally → triggers matrix flicker
  const stabilityIndex = useMemo(() => {
    const base = 0.78 + Math.sin(tick * 0.27) * 0.18 + Math.cos(tick * 0.11) * 0.08;
    return Math.max(0, Math.min(1, base));
  }, [tick]);
  const stressed = stabilityIndex < 0.55;

  // 3x3 correlation matrix — grayscale shades, slow drift
  const corrMatrix = useMemo(() => {
    const m: number[][] = [];
    for (let i = 0; i < 3; i++) {
      const row: number[] = [];
      for (let j = 0; j < 3; j++) {
        if (i === j) row.push(1);
        else {
          const v = 0.45 + 0.4 * Math.sin(tick * 0.2 + (i + 1) * (j + 2));
          row.push(Math.max(0, Math.min(1, v)));
        }
      }
      m.push(row);
    }
    return m;
  }, [tick]);


  return (
    <div className="min-h-full grid grid-cols-1 lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_340px]">
      {/* PLOT */}
      <div className="relative blueprint-grid-fine overflow-hidden flex flex-col bg-black min-h-[420px] lg:min-h-0">
        {/* FLOATING NEURAL LOAD INDICATOR */}
        <div className="absolute top-24 right-3 z-20 flex flex-col items-center gap-2 select-none pointer-events-none">
          <div className="font-mono text-[8px] tracking-[0.3em] text-white/60 [writing-mode:vertical-rl] rotate-180">
            NEURAL_LOAD
          </div>
          <div className="relative h-40 w-3 border border-white/30 bg-black overflow-hidden">
            <div
              className="absolute left-1/2 top-0 bottom-0 w-px bg-white"
              style={{
                transform: `translateX(${(jitter - 0.5) * load * 6}px)`,
                opacity: 0.85,
              }}
            />
            <div
              className="absolute left-0 right-0 bottom-0 bg-white/15"
              style={{ height: `${load * 100}%` }}
            />
            <div className="absolute inset-x-0 top-1/4 h-px bg-white/20" />
            <div className="absolute inset-x-0 top-1/2 h-px bg-white/30" />
            <div className="absolute inset-x-0 top-3/4 h-px bg-white/20" />
          </div>
          <div className="font-mono text-[9px] text-white tabular-nums">
            {(load * 100).toFixed(0)}%
          </div>
        </div>

        <header className="px-4 sm:px-8 py-4 sm:py-5 border-b border-white/20 bg-black/70 backdrop-blur-sm flex justify-between items-start sm:items-center gap-3">
          <div className="min-w-0">
            <div className="text-[10px] sm:text-[11px] tracking-[0.4em] text-white/50">// STABILITY_ANALYSIS</div>
            <h2 className="font-display text-xl sm:text-2xl mt-1">NYQUIST&nbsp;PLOT</h2>
          </div>
          <div className="text-[9px] sm:text-[10px] tracking-[0.25em] sm:tracking-[0.3em] text-white/60 text-right font-mono shrink-0">
            <div className="hidden sm:block">G(s) = K / (s+0.5)(s+1.5)</div>
            <div className="text-white">STABLE · 0 ENC.</div>
          </div>
        </header>

        <div className="flex-1 px-2 pb-2 pt-4 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="2 4" />
              <XAxis
                type="number"
                dataKey="re"
                domain={[-1.5, 1.5]}
                ticks={[-1.5, -1, -0.5, 0, 0.5, 1, 1.5]}
                stroke="rgba(255,255,255,0.5)"
                tick={{ fill: "rgba(255,255,255,0.6)", fontFamily: "JetBrains Mono", fontSize: 10 }}
                tickLine={{ stroke: "rgba(255,255,255,0.4)" }}
                axisLine={{ stroke: "rgba(255,255,255,0.4)" }}
                label={{ value: "Re{G(jω)}", position: "insideBottomRight", offset: -8, fill: "rgba(255,255,255,0.7)", fontSize: 10, fontFamily: "JetBrains Mono" }}
              />
              <YAxis
                type="number"
                dataKey="im"
                domain={[-1.5, 1.5]}
                ticks={[-1.5, -1, -0.5, 0, 0.5, 1, 1.5]}
                stroke="rgba(255,255,255,0.5)"
                tick={{ fill: "rgba(255,255,255,0.6)", fontFamily: "JetBrains Mono", fontSize: 10 }}
                tickLine={{ stroke: "rgba(255,255,255,0.4)" }}
                axisLine={{ stroke: "rgba(255,255,255,0.4)" }}
                label={{ value: "Im{G(jω)}", position: "insideTopLeft", offset: 10, fill: "rgba(255,255,255,0.7)", fontSize: 10, fontFamily: "JetBrains Mono" }}
              />
              <Tooltip
                cursor={{ stroke: "rgba(255,255,255,0.3)", strokeDasharray: "2 2" }}
                contentStyle={{
                  background: "#000",
                  border: "1px solid #fff",
                  borderRadius: 0,
                  fontFamily: "JetBrains Mono",
                  fontSize: 10,
                  color: "#fff",
                }}
                labelFormatter={() => ""}
                formatter={(v: number, name: string) => [v.toFixed(3), name === "re" ? "Re" : "Im"]}
              />
              <ReferenceLine x={0} stroke="rgba(255,255,255,0.35)" />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.35)" />
              <ReferenceDot x={-1} y={0} r={5} fill="#000" stroke="#fff" strokeWidth={1.2} label={{ value: "(-1, j0)", position: "top", fill: "#fff", fontSize: 10, fontFamily: "JetBrains Mono" }} />
              <Line
                type="monotone"
                dataKey="im"
                stroke="#ffffff"
                strokeWidth={1.6}
                dot={false}
                isAnimationActive={false}
                className="animate-laser"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="px-4 sm:px-8 py-2 sm:py-3 border-t border-white/20 bg-black/70 flex justify-between gap-2 text-[9px] sm:text-[10px] tracking-[0.25em] sm:tracking-[0.3em] text-white/60 font-mono">
          <span className="truncate">ω: 10⁻¹·⁵ → 10¹·⁵</span>
          <span className="hidden sm:inline">SAMPLES: {data.length} · TICK {tick}</span>
          <span className="truncate">Δϕ={stats.pm}° / ΔK={stats.gm}dB</span>
        </div>
        </div>

      {/* FEED */}
      <aside className="border-t lg:border-t-0 lg:border-l border-white/20 flex flex-col min-h-[280px] lg:min-h-0">
        <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-white/20 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] sm:text-[11px] tracking-[0.4em] text-white/50">// AI_LOGIC_FEED</div>
            <div className="font-display text-base sm:text-lg mt-1">REASONING_STREAM</div>
          </div>
          <span className="font-mono text-[10px] text-white flex items-center gap-1 shrink-0">
            <span className="w-1.5 h-1.5 bg-white animate-pulse" /> LIVE
          </span>
        </div>

        {/* CROSS_AGENT_CORRELATION 3x3 MATRIX */}
        <div className={`px-4 sm:px-5 py-3 border-b border-white/20 ${stressed ? "animate-flicker" : ""}`}>
          <div className="flex items-center justify-between mb-2 gap-2">
            <div className="font-mono text-[9px] sm:text-[10px] tracking-[0.3em] text-white/60 truncate">
              CROSS_AGENT_CORRELATION
            </div>
            <span
              className={`font-mono text-[9px] tracking-[0.2em] shrink-0 ${
                stressed ? "text-white animate-pulse" : "text-white/50"
              }`}
            >
              {stressed ? "◉ STRESS" : "◌ NOMINAL"}
            </span>
          </div>
          <div className="flex items-start gap-3">
            <div className="grid grid-cols-3 gap-px bg-white/20 p-px">
              {corrMatrix.flatMap((row, i) =>
                row.map((v, j) => {
                  const shade = Math.round(v * 255);
                  const isDiag = i === j;
                  return (
                    <div
                      key={`${i}-${j}`}
                      className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center font-mono text-[8px] tabular-nums"
                      style={{
                        background: `rgb(${shade},${shade},${shade})`,
                        color: shade > 140 ? "#000" : "#fff",
                        outline: isDiag ? "1px solid #fff" : "none",
                        outlineOffset: "-1px",
                      }}
                      title={`A${i + 1}↔A${j + 1}: ${v.toFixed(2)}`}
                    >
                      {v.toFixed(2).slice(1)}
                    </div>
                  );
                }),
              )}
            </div>
            <div className="flex-1 min-w-0 font-mono text-[9px] text-white/50 leading-[1.6] space-y-0.5">
              <div>AGENTS: A1·A2·A3</div>
              <div>σ: {(corrMatrix[0][1] * 0.7 + corrMatrix[1][2] * 0.3).toFixed(3)}</div>
              <div>STAB_IDX: <span className="text-white">{stabilityIndex.toFixed(2)}</span></div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 font-mono text-[10px] sm:text-[11px] leading-[1.7] bg-black">
          {feed.map((item, i) => {
            const isRecent = i >= feed.length - 3;
            const tagMatch = item.text.match(/^\[(\w+)\]/);
            const tag = tagMatch?.[1] ?? "";
            const rest = tagMatch ? item.text.slice(tagMatch[0].length) : item.text;
            return (
              <div
                key={item.id}
                className={isRecent ? "text-white" : i >= feed.length - 10 ? "text-white/60" : "text-white/25"}
              >
                <span className="text-white/40">{item.t} </span>
                <span className="text-white/70">{">"} </span>
                <span className="text-white">[{tag}]:</span>
                <span>{rest.replace(/^:?/, "")}</span>
              </div>
            );
          })}
          <div className="text-white">
            <span className="text-white/40">{new Date().toISOString().slice(11, 19)} </span>
            <span className="text-white/70">{">"} </span>
            <span className="inline-block w-2 h-3 bg-white align-middle animate-pulse" />
          </div>
          <div ref={feedEndRef} />
        </div>
      </aside>
    </div>
  );
}
