import { useEffect, useMemo, useRef, useState } from "react";

type Phase = "idle" | "validating" | "complete";

const CHECKS = [
  "SWARM_CONSENSUS_REACHED",
  "SOMNIA_L1_GAS_ESTIMATED",
  "BONDING_CURVE_DEPLOYED",
  "LIQUIDITY_SEED_LOCKED",
  "AGENT_HANDOFF_COMPLETE",
] as const;

const STEP_MS = 650;

// Visual-only "beep" — a brief flash on the row just confirmed
function useBeep() {
  const [pulse, setPulse] = useState(0);
  const trigger = () => setPulse((p) => p + 1);
  return { pulse, trigger };
}

export function ForgeView() {
  const [narrative, setNarrative] = useState("");
  const [supply, setSupply] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [stepsDone, setStepsDone] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const beep = useBeep();

  const ticker = narrative.trim().split(/\s+/).filter(Boolean).map(w => w[0] || "").join("").toUpperCase().slice(0, 4) || "SMNX";

  const onForge = () => {
    if (phase === "validating") return;
    setPhase("validating");
    setStepsDone(0);
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    CHECKS.forEach((_, i) => {
      const t = setTimeout(() => {
        setStepsDone(i + 1);
        beep.trigger();
        if (i === CHECKS.length - 1) {
          const t2 = setTimeout(() => setPhase("complete"), 400);
          timersRef.current.push(t2);
        }
      }, (i + 1) * STEP_MS);
      timersRef.current.push(t);
    });
  };

  const onReset = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setPhase("idle");
    setStepsDone(0);
  };

  useEffect(() => () => { timersRef.current.forEach(clearTimeout); }, []);

  if (phase === "validating" || phase === "complete") {
    return (
      <ValidationScreen
        ticker={ticker}
        supply={supply}
        narrative={narrative}
        stepsDone={stepsDone}
        complete={phase === "complete"}
        beepPulse={beep.pulse}
        onReset={onReset}
      />
    );
  }

  return (
    <div className="min-h-full flex items-center justify-center px-4 sm:px-6 py-8 sm:py-12 blueprint-grid-fine">
      <div className="w-full max-w-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-white pb-3 sm:pb-4 mb-8 sm:mb-12">
          <div className="text-[10px] sm:text-[11px] tracking-[0.4em] text-white/60 truncate">// DEPLOYMENT_FORGE</div>
          <div className="font-mono text-[9px] sm:text-[10px] tracking-[0.3em] text-white/60 shrink-0">SOMNIA · v9.21</div>
        </div>

        <label className="block mb-12">
          <div className="font-mono text-[11px] tracking-[0.4em] text-white/60 mb-3">TOKEN_NARRATIVE</div>
          <input
            value={narrative}
            onChange={(e) => setNarrative(e.target.value)}
            placeholder="THE FUTURE IS UNWRITTEN"
            className="w-full bg-transparent border-0 border-b border-white px-0 py-4 font-display text-4xl md:text-6xl tracking-tight text-white placeholder-white/20 outline-none focus:border-white"
            style={{ borderRadius: 0 }}
          />
        </label>

        <label className="block mb-16">
          <div className="font-mono text-[11px] tracking-[0.4em] text-white/60 mb-3">SUPPLY</div>
          <div className="flex border border-white" style={{ borderRadius: 0 }}>
            <input
              value={supply}
              onChange={(e) => setSupply(e.target.value.replace(/[^\d,]/g, ""))}
              placeholder="1,000,000,000"
              inputMode="numeric"
              className="flex-1 bg-transparent border-0 px-5 py-4 font-mono text-2xl text-white placeholder-white/20 outline-none"
              style={{ borderRadius: 0 }}
            />
            <div className="px-5 flex items-center border-l border-white font-mono text-xs tracking-[0.3em] text-white/70">
              UNITS
            </div>
          </div>
        </label>

        <button
          onClick={onForge}
          className="relative w-full overflow-hidden border border-white bg-white text-black hover:bg-black hover:text-white transition-colors px-8 py-10 font-display text-3xl md:text-5xl tracking-[0.15em] text-center"
          style={{ borderRadius: 0 }}
        >
          FORGE_ON_SOMNIA
        </button>

        <div className="mt-6 grid grid-cols-3 font-mono text-[10px] tracking-[0.3em] text-white/50">
          <span>GAS_EST: 0.0042</span>
          <span className="text-center">STATUS: <span className="text-white">READY</span></span>
          <span className="text-right">BLOCK#: 18402311</span>
        </div>
      </div>
    </div>
  );
}

function ValidationScreen({
  ticker,
  supply,
  narrative,
  stepsDone,
  complete,
  beepPulse,
  onReset,
}: {
  ticker: string;
  supply: string;
  narrative: string;
  stepsDone: number;
  complete: boolean;
  beepPulse: number;
  onReset: () => void;
}) {
  return (
    <div className="min-h-full flex flex-col items-center justify-center px-4 sm:px-6 py-8 blueprint-grid-fine">
      <div className="w-full max-w-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-white pb-3 mb-8">
          <div className="text-[10px] sm:text-[11px] tracking-[0.4em] text-white/70 font-bold uppercase truncate">
            // SEQUENTIAL_VALIDATION
          </div>
          <div className="font-mono text-[10px] tracking-[0.3em] flex items-center gap-2 shrink-0">
            <span className={complete ? "text-white" : "text-white animate-pulse"}>
              {complete ? "● SEALED" : "● COMMITTING"}
            </span>
          </div>
        </div>

        <ul className="border border-white divide-y divide-white/30 mb-8" style={{ borderRadius: 0 }}>
          {CHECKS.map((label, i) => {
            const done = i < stepsDone;
            const active = i === stepsDone - 1;
            const beepKey = active ? beepPulse : 0;
            return (
              <li
                key={label}
                className={[
                  "flex items-center gap-4 px-4 sm:px-5 py-3 sm:py-4 font-mono text-xs sm:text-sm tracking-[0.2em] transition-colors",
                  done ? "bg-white text-black" : "bg-black text-white/35",
                ].join(" ")}
              >
                <span
                  className={[
                    "w-5 h-5 sm:w-6 sm:h-6 border flex items-center justify-center shrink-0 text-[10px] font-bold",
                    done ? "border-black bg-black text-white" : "border-white/40 text-white/40",
                  ].join(" ")}
                  style={{ borderRadius: 0 }}
                >
                  {done ? "✓" : String(i + 1).padStart(2, "0")}
                </span>
                <span className="flex-1 truncate font-bold uppercase">{label}</span>
                {active && (
                  <span
                    key={beepKey}
                    className="font-mono text-[10px] tracking-[0.3em] animate-beep-flash"
                  >
                    ◉ BEEP
                  </span>
                )}
                {done && !active && (
                  <span className="font-mono text-[10px] tracking-[0.3em] opacity-70">OK</span>
                )}
                {!done && !active && (
                  <span className="font-mono text-[10px] tracking-[0.3em] opacity-40">···</span>
                )}
              </li>
            );
          })}
        </ul>

        {/* Progress hairline */}
        <div className="h-px bg-white/20 mb-8 relative overflow-hidden">
          <div
            className="absolute left-0 top-0 bottom-0 bg-white transition-[width] duration-300 ease-out"
            style={{ width: `${(stepsDone / CHECKS.length) * 100}%` }}
          />
        </div>

        {complete && (
          <div className="flex flex-col items-center gap-6 animate-fade-in">
            <Holo3D ticker={ticker} />
            <div className="text-center font-mono text-[11px] tracking-[0.35em] text-white/70 space-y-1">
              <div className="text-white font-bold">TOKEN_DEPLOYED // SOMNIA_L1</div>
              <div className="truncate max-w-md">
                "{narrative.toUpperCase() || "THE FUTURE IS UNWRITTEN"}"
              </div>
              <div className="text-white/50">
                SUPPLY: {supply || "1,000,000,000"} · CONTRACT: 0x{ticker.toLowerCase()}…7e1a
              </div>
            </div>
            <button
              onClick={onReset}
              className="border border-white px-6 py-3 font-mono text-xs tracking-[0.3em] hover:bg-white hover:text-black transition-colors"
              style={{ borderRadius: 0 }}
            >
              [ FORGE_ANOTHER ]
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Holo3D({ ticker }: { ticker: string }) {
  const ringChars = useMemo(
    () => Array.from({ length: 24 }, (_, i) => "01"[i % 2]).join(" "),
    [],
  );
  return (
    <div
      className="relative w-56 h-56 sm:w-72 sm:h-72 flex items-center justify-center"
      style={{ perspective: "900px" }}
    >
      {/* horizon plane */}
      <div
        className="absolute inset-0 border border-white/40 animate-holo-spin"
        style={{ transform: "rotateX(70deg)", borderRadius: 0 }}
      />
      <div
        className="absolute inset-6 border border-white/25 animate-holo-spin-rev"
        style={{ transform: "rotateX(70deg)", borderRadius: 0 }}
      />

      {/* rotating ring text */}
      <div
        className="absolute inset-0 flex items-center justify-center font-mono text-[10px] tracking-[0.4em] text-white/60 animate-holo-spin"
        style={{ transform: "rotateX(70deg)" }}
      >
        <span className="whitespace-nowrap">{ringChars}</span>
      </div>

      {/* central token cube */}
      <div
        className="relative animate-holo-tilt"
        style={{ transformStyle: "preserve-3d" }}
      >
        <div
          className="border border-white bg-black px-6 py-4 font-display text-3xl sm:text-4xl tracking-[0.2em] text-white relative"
          style={{
            borderRadius: 0,
            boxShadow: "0 0 0 1px #fff inset, 0 0 24px rgba(255,255,255,0.25)",
            transform: "translateZ(0)",
          }}
        >
          <span className="relative z-10">${ticker}</span>
          {/* scanline overlay */}
          <div
            className="pointer-events-none absolute inset-0 opacity-40 mix-blend-screen"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, rgba(255,255,255,0.18) 0 1px, transparent 1px 3px)",
            }}
          />
        </div>
        {/* depth shadow layers */}
        <div
          className="absolute inset-0 border border-white/40"
          style={{ transform: "translateZ(-8px) translate(4px,4px)", borderRadius: 0 }}
        />
        <div
          className="absolute inset-0 border border-white/20"
          style={{ transform: "translateZ(-16px) translate(8px,8px)", borderRadius: 0 }}
        />
      </div>

      {/* corner brackets */}
      {[
        "top-0 left-0 border-t border-l",
        "top-0 right-0 border-t border-r",
        "bottom-0 left-0 border-b border-l",
        "bottom-0 right-0 border-b border-r",
      ].map((c, i) => (
        <span key={i} className={`absolute w-4 h-4 border-white ${c}`} />
      ))}
    </div>
  );
}
