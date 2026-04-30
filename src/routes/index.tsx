import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArchitectView } from "@/components/views/ArchitectView";
import { MonitorView } from "@/components/views/MonitorView";
import { StabilityView } from "@/components/views/StabilityView";
import { ForgeView } from "@/components/views/ForgeView";

export const Route = createFileRoute("/")({
  component: Index,
});

type ViewKey = "CORE_GENESIS" | "SWARM_HEARTBEAT" | "LOGIC_SYNAPSE" | "ASSET_FORGE";

const TABS: { key: ViewKey; idx: string; label: string }[] = [
  { key: "CORE_GENESIS", idx: "01", label: "01_CORE_GENESIS" },
  { key: "SWARM_HEARTBEAT", idx: "02", label: "02_SWARM_HEARTBEAT" },
  { key: "LOGIC_SYNAPSE", idx: "03", label: "03_LOGIC_SYNAPSE" },
  { key: "ASSET_FORGE", idx: "04", label: "04_ASSET_FORGE" },
];

type Metric = { cpu: number; mem: number; tps: number };

function Index() {
  const [activeTab, setActiveTab] = useState<ViewKey>("CORE_GENESIS");
  const [time, setTime] = useState("");
  const [metrics, setMetrics] = useState<Metric>({ cpu: 0.42, mem: 0.61, tps: 1840 });
  const [helpOpen, setHelpOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // clock
  useEffect(() => {
    const tick = () => setTime(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC");
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // simulated global metrics
  useEffect(() => {
    const id = setInterval(() => {
      setMetrics((m) => ({
        cpu: Math.max(0.05, Math.min(0.99, m.cpu + (Math.random() - 0.5) * 0.08)),
        mem: Math.max(0.1, Math.min(0.97, m.mem + (Math.random() - 0.5) * 0.04)),
        tps: Math.max(120, Math.round(m.tps + (Math.random() - 0.5) * 220)),
      }));
    }, 1200);
    return () => clearInterval(id);
  }, []);

  const triggerFlash = (msg: string) => {
    setFlash(msg);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 1400);
  };

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (e.key >= "1" && e.key <= "4") {
        const tab = TABS[Number(e.key) - 1];
        if (tab) {
          setActiveTab(tab.key);
          triggerFlash(`→ ${tab.label}`);
        }
      } else if (e.key === "/") {
        e.preventDefault();
        triggerFlash("CLI :: not_yet_implemented");
      } else if (e.key.toLowerCase() === "r") {
        setRefreshKey((k) => k + 1);
        triggerFlash("SWARM_STATES :: REFRESHED");
      } else if (e.key === "?") {
        setHelpOpen((v) => !v);
      } else if (e.key === "Escape") {
        setHelpOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="h-screen w-screen bg-black text-white flex flex-col overflow-hidden">
      {/* GLOBAL STATUS BAR */}
      <div className="shrink-0 border-b border-white/30 bg-black flex items-stretch font-mono text-[10px] tracking-[0.25em] text-white/70 h-9">
        <div className="px-3 sm:px-4 flex items-center gap-2 border-r border-white/20 shrink-0">
          <span className="w-1.5 h-1.5 bg-white animate-pulse" />
          <span className="text-white font-bold">SOMNIA//OS</span>
        </div>

        <Stat label="CPU_LOAD" value={`${(metrics.cpu * 100).toFixed(0)}%`} fill={metrics.cpu} alert={metrics.cpu > 0.85} />
        <Stat label="MEMORY_POOL" value={`${(metrics.mem * 100).toFixed(0)}%`} fill={metrics.mem} alert={metrics.mem > 0.9} />
        <Stat label="SOMNIA_L1_TPS" value={metrics.tps.toLocaleString()} fill={Math.min(1, metrics.tps / 3000)} />

        <div className="flex-1" />

        {flash && (
          <div className="hidden md:flex items-center px-3 border-l border-white/20 text-white animate-pulse uppercase">
            {flash}
          </div>
        )}

        <div className="hidden sm:flex items-center px-3 border-l border-white/20 text-white/60 truncate max-w-[260px]">
          {time}
        </div>

        <button
          type="button"
          onClick={() => setHelpOpen((v) => !v)}
          className={[
            "px-3 sm:px-4 border-l border-white/20 flex items-center gap-2 text-[10px] tracking-[0.3em] transition-colors",
            helpOpen ? "bg-white text-black font-bold" : "text-white/70 hover:text-white hover:bg-white/10",
          ].join(" ")}
          aria-expanded={helpOpen}
          aria-label="Keyboard shortcuts"
        >
          <span className="w-4 h-4 border border-current flex items-center justify-center text-[9px] font-bold">?</span>
          <span className="hidden sm:inline">HELP</span>
        </button>
      </div>

      {/* BODY */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 relative">
        {/* SIDEBAR */}
        <aside className="lg:w-60 xl:w-64 lg:h-full border-b lg:border-b-0 lg:border-r border-white/20 flex flex-col shrink-0">
          <div className="px-4 lg:px-6 py-4 lg:py-5 border-b border-white/20 flex items-center gap-3">
            <div className="w-7 h-7 lg:w-8 lg:h-8 border border-white flex items-center justify-center shrink-0">
              <div className="w-2.5 h-2.5 lg:w-3 lg:h-3 bg-white" />
            </div>
            <div className="min-w-0">
              <div className="font-display text-sm lg:text-base leading-none truncate">SOMNIA</div>
              <div className="font-mono text-[9px] lg:text-[10px] tracking-[0.3em] text-white/50 mt-1">CMD_CENTER</div>
            </div>
          </div>

          <nav className="flex lg:flex-col lg:flex-1 lg:py-3 overflow-x-auto lg:overflow-visible shrink-0">
            {TABS.map((t) => {
              const active = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={[
                    "shrink-0 lg:shrink text-left px-4 lg:px-6 py-3 lg:py-4 font-mono text-xs lg:text-sm tracking-[0.2em] transition-colors flex items-center gap-2 lg:gap-3 whitespace-nowrap",
                    active
                      ? "text-white font-bold border border-white bg-white/5"
                      : "text-white/40 hover:text-white/80 border border-transparent",
                  ].join(" ")}
                >
                  <span className="flex-1 font-bold uppercase">[{t.label}]</span>
                  {active && <span className="hidden lg:inline text-white">▸</span>}
                </button>
              );
            })}
          </nav>

          <div className="hidden lg:block px-6 py-4 border-t border-white/20 text-[10px] tracking-[0.3em] text-white/40 space-y-1">
            <div className="text-white/70 truncate">{time}</div>
            <div>OPERATOR: ROOT</div>
            <div>NET: SOMNIA_MAIN</div>
            <div className="flex items-center gap-2 text-white">
              <span className="w-1.5 h-1.5 bg-white animate-pulse" /> LINK_ESTABLISHED
            </div>
          </div>
        </aside>

        {/* MAIN */}
        <main className="flex-1 flex flex-col min-h-0 min-w-0">
          <div className="px-4 lg:px-8 py-2 lg:py-3 border-b border-white/20 flex items-center justify-between text-[9px] lg:text-[10px] tracking-[0.3em] text-white/50 shrink-0 gap-3">
            <span className="truncate font-bold uppercase">// {activeTab}_VIEW</span>
            <span className="shrink-0 whitespace-nowrap">SECURE <span className="text-white">●</span></span>
          </div>
          <div key={refreshKey} className="flex-1 min-h-0 overflow-auto">
            {activeTab === "CORE_GENESIS" && <ArchitectView />}
            {activeTab === "SWARM_HEARTBEAT" && <MonitorView />}
            {activeTab === "LOGIC_SYNAPSE" && <StabilityView />}
            {activeTab === "ASSET_FORGE" && <ForgeView />}
          </div>
        </main>

        {/* HELP TOOLTIP / OVERLAY */}
        {helpOpen && (
          <div
            className="absolute z-50 bottom-4 right-4 w-[min(92vw,320px)] bg-black border border-white text-white font-mono text-[11px] shadow-[6px_6px_0_0_#fff]"
            role="dialog"
            aria-label="Keyboard shortcuts"
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/40">
              <span className="tracking-[0.3em] font-bold text-[10px]">// KEYBOARD_SHORTCUTS</span>
              <button
                onClick={() => setHelpOpen(false)}
                className="w-5 h-5 border border-white/60 hover:border-white hover:bg-white hover:text-black flex items-center justify-center text-[10px] leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <ul className="divide-y divide-white/15">
              <ShortcutRow keys={["1", "·", "·", "4"]} desc="SWITCH_TAB" />
              <ShortcutRow keys={["/"]} desc="OPEN_CLI" />
              <ShortcutRow keys={["R"]} desc="REFRESH_SWARM_STATES" />
              <ShortcutRow keys={["?"]} desc="TOGGLE_HELP" />
              <ShortcutRow keys={["ESC"]} desc="DISMISS" />
            </ul>
            <div className="px-3 py-2 border-t border-white/40 text-white/50 text-[9px] tracking-[0.3em]">
              SOMNIA//CMD_CENTER · v0.9.21
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  fill,
  alert,
}: {
  label: string;
  value: string;
  fill: number;
  alert?: boolean;
}) {
  return (
    <div className="hidden xs:flex sm:flex items-center gap-2 sm:gap-3 px-3 sm:px-4 border-r border-white/20 shrink-0">
      <span className={`text-[9px] tracking-[0.3em] ${alert ? "text-white animate-pulse" : "text-white/50"}`}>
        {label}
      </span>
      <div className="hidden md:block relative w-16 h-1.5 border border-white/40 bg-black overflow-hidden">
        <div
          className={`absolute left-0 top-0 bottom-0 ${alert ? "bg-white animate-pulse" : "bg-white"}`}
          style={{ width: `${Math.min(100, Math.max(0, fill * 100))}%` }}
        />
      </div>
      <span className="text-white font-bold tabular-nums text-[10px] min-w-[44px] text-right">
        {value}
      </span>
    </div>
  );
}

function ShortcutRow({ keys, desc }: { keys: string[]; desc: string }) {
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2">
      <div className="flex items-center gap-1">
        {keys.map((k, i) =>
          k === "·" ? (
            <span key={i} className="text-white/40 px-0.5">·</span>
          ) : (
            <kbd
              key={i}
              className="min-w-[22px] h-[22px] px-1.5 border border-white bg-black text-white text-[10px] font-bold flex items-center justify-center"
            >
              {k}
            </kbd>
          ),
        )}
      </div>
      <span className="text-white/70 tracking-[0.2em] text-[10px]">{desc}</span>
    </li>
  );
}
