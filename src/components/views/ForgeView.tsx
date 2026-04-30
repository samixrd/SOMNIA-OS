/**
 * ForgeView.tsx  — UX polish update
 *
 * New in this version:
 *  1. LOADING STATE   — button shows animated spinner + "FORGING…" while tx is pending
 *  2. SUCCESS LINK    — "VIEW ON EXPLORER" button → shannon-explorer.somnia.network/tx/:hash
 *  3. ERROR TOASTS    — slide-in toast for user-rejection, low gas, and generic errors
 *  4. BALANCE SYNC    — useReadContract polls balanceOf() after each successful forge;
 *                       balance updates automatically without a page refresh
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useActiveAccount,
  useReadContract,
  useSendTransaction,
} from "thirdweb/react";
import { getContract, prepareContractCall, toWei } from "thirdweb";
import { thirdwebClient } from "@/components/WalletConnect";
import { somniaChain }    from "@/routes/__root";
import type { TxLogEntry } from "@/lib/somniaService";

// ─── Contract ─────────────────────────────────────────────────────────────────
export const SWARM_CONTRACT_ADDRESS =
  "0xFD585f3225DE051B55206B875Ee8B9a318807893" as const;

const EXPLORER = "https://explorer-shannon.somnia.network";

const swarmContract = getContract({
  client: thirdwebClient,
  chain:  somniaChain,
  address: SWARM_CONTRACT_ADDRESS,
});

// ─── Error classifier ─────────────────────────────────────────────────────────
type ToastKind = "rejected" | "gas" | "error";

interface ToastData {
  kind: ToastKind;
  msg:  string;
}

function classifyError(err: Error): ToastData {
  const raw = (err?.message ?? "").toLowerCase();
  if (
    raw.includes("user rejected") ||
    raw.includes("user denied") ||
    raw.includes("rejected the request") ||
    raw.includes("action_rejected")
  ) {
    return { kind: "rejected", msg: "TX_REJECTED — you cancelled the request in MetaMask." };
  }
  if (
    raw.includes("insufficient funds") ||
    raw.includes("gas required exceeds") ||
    raw.includes("out of gas") ||
    raw.includes("intrinsic gas")
  ) {
    return { kind: "gas", msg: "INSUFFICIENT_GAS — top up your STT balance on Somnia Testnet." };
  }
  return {
    kind: "error",
    msg: `TX_FAILED — ${err.message.slice(0, 120)}${err.message.length > 120 ? "…" : ""}`,
  };
}

// ─── Toast component ──────────────────────────────────────────────────────────
const TOAST_ICONS: Record<ToastKind, string> = {
  rejected: "✕",
  gas:      "⛽",
  error:    "▲",
};

const TOAST_LABELS: Record<ToastKind, string> = {
  rejected: "REQUEST_REJECTED",
  gas:      "INSUFFICIENT_GAS",
  error:    "TX_ERROR",
};

function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastData;
  onDismiss: () => void;
}) {
  // Auto-dismiss after 6 s
  useEffect(() => {
    const t = setTimeout(onDismiss, 6000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      className="fixed bottom-6 right-6 z-[100] w-[min(94vw,440px)] border border-white bg-black
                 font-mono text-[11px] tracking-[0.2em] shadow-[4px_4px_0_0_rgba(255,255,255,0.6)]
                 animate-slide-up"
    >
      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/30 bg-white/5">
        <span className="font-bold tracking-[0.3em] text-white flex items-center gap-2">
          <span>{TOAST_ICONS[toast.kind]}</span>
          {TOAST_LABELS[toast.kind]}
        </span>
        <button
          onClick={onDismiss}
          className="w-5 h-5 border border-white/50 hover:border-white hover:bg-white
                     hover:text-black flex items-center justify-center text-[11px] leading-none
                     transition-colors"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div className="px-4 py-3 text-white/70 leading-relaxed break-all">
        {toast.msg}
      </div>

      {/* Progress bar — drains over 6 s */}
      <div className="h-[2px] bg-white/20 overflow-hidden">
        <div
          className="h-full bg-white origin-left"
          style={{ animation: "drain 6s linear forwards" }}
        />
      </div>

      <style>{`
        @keyframes drain { from { transform: scaleX(1); } to { transform: scaleX(0); } }
        @keyframes slide-up { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        .animate-slide-up { animation: slide-up 0.25s ease-out; }
      `}</style>
    </div>
  );
}

// ─── Balance display ──────────────────────────────────────────────────────────
function useTokenBalance(address: string | undefined, refreshTrigger: number) {
  const { data, isLoading, refetch } = useReadContract({
    contract: swarmContract,
    method:   "function balanceOf(address account) view returns (uint256)",
    params:   [address ?? "0x0000000000000000000000000000000000000000"],
    queryOptions: { enabled: !!address },
  });

  // Re-fetch whenever refreshTrigger increments (after each successful forge)
  useEffect(() => {
    if (refreshTrigger > 0 && address) refetch();
  }, [refreshTrigger, address, refetch]);

  if (!address || isLoading || data === undefined) return null;

  // Convert from wei (18 decimals) → human-readable with commas
  const whole = data / BigInt(10 ** 18);
  return whole.toLocaleString();
}

// ─── Phase type ───────────────────────────────────────────────────────────────
type Phase =
  | "idle"
  | "validating"
  | "awaiting_wallet"
  | "pending_tx"
  | "complete"
  | "error";

const CHECKS = [
  "SWARM_CONSENSUS_REACHED",
  "SOMNIA_L1_GAS_ESTIMATED",
  "BONDING_CURVE_DEPLOYED",
  "LIQUIDITY_SEED_LOCKED",
  "AGENT_HANDOFF_COMPLETE",
] as const;

const STEP_MS = 650;

// ─── Spinner SVG ──────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <svg
      className="inline-block w-6 h-6 mr-3 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <circle cx="12" cy="12" r="10" strokeOpacity={0.25} />
      <path d="M12 2 a10 10 0 0 1 10 10" strokeLinecap="square" />
    </svg>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface ForgeViewProps {
  onTxSuccess?: (entry: TxLogEntry) => void;
}

// ─── Main component ───────────────────────────────────────────────────────────
export function ForgeView({ onTxSuccess }: ForgeViewProps = {}) {
  const account  = useActiveAccount();
  const { mutate: sendTx, isPending } = useSendTransaction();

  const [narrative,      setNarrative]      = useState("");
  const [supply,         setSupply]         = useState("");
  const [phase,          setPhase]          = useState<Phase>("idle");
  const [stepsDone,      setStepsDone]      = useState(0);
  const [txHash,         setTxHash]         = useState<string | null>(null);
  const [toast,          setToast]          = useState<ToastData | null>(null);
  const [balanceRefresh, setBalanceRefresh] = useState(0);

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Live token balance — auto-refreshes after each forge
  const balance = useTokenBalance(account?.address, balanceRefresh);

  const ticker = useMemo(
    () =>
      narrative.trim().split(/\s+/).filter(Boolean)
        .map((w) => w[0] || "").join("").toUpperCase().slice(0, 4) || "SMNX",
    [narrative]
  );

  // ── Validation animation ──
  const runValidation = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setStepsDone(0);
    CHECKS.forEach((_, i) => {
      const t = setTimeout(
        () => setStepsDone(i + 1),
        (i + 1) * STEP_MS
      );
      timersRef.current.push(t);
    });
  }, []);

  // ── Forge handler ──
  const onForge = async () => {
    if (!account) {
      setToast({ kind: "error", msg: "WALLET_NOT_CONNECTED — use [ CONNECT_WALLET ] in the header." });
      return;
    }
    if (["validating", "awaiting_wallet", "pending_tx"].includes(phase)) return;

    setToast(null);
    setTxHash(null);
    setPhase("validating");
    runValidation();

    const animDuration = CHECKS.length * STEP_MS + 400;
    const t = setTimeout(async () => {
      setPhase("awaiting_wallet");
      try {
        const supplyRaw = BigInt(supply.replace(/,/g, "") || "1000000000");

        const transaction = prepareContractCall({
          contract: swarmContract,
          method:   "function mintTo(address to, uint256 amount)",
          params:   [account.address, toWei(supplyRaw.toString())],
        });

        setPhase("pending_tx");

        sendTx(transaction, {
          onSuccess: (receipt) => {
            setTxHash(receipt.transactionHash);
            setPhase("complete");
            // Trigger balance refetch
            setBalanceRefresh((n) => n + 1);
            // Notify parent (MonitorView TX log)
            onTxSuccess?.({
              hash:   receipt.transactionHash,
              block:  Number(receipt.blockNumber ?? 0),
              gas:    receipt.gasUsed
                        ? (Number(receipt.gasUsed) / 1e9).toFixed(5)
                        : "—",
              status: "OK",
              t:      new Date().toISOString().slice(11, 19),
              event:  "TokenForged",
            });
          },
          onError: (err: Error) => {
            const classified = classifyError(err);
            setToast(classified);
            setPhase("error");
          },
        });
      } catch (err: any) {
        setToast(classifyError(err));
        setPhase("error");
      }
    }, animDuration);
    timersRef.current.push(t);
  };

  const onReset = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setPhase("idle");
    setStepsDone(0);
    setTxHash(null);
  };

  useEffect(() => () => { timersRef.current.forEach(clearTimeout); }, []);

  // ── Determine button state ──
  const isBusy      = ["validating", "awaiting_wallet", "pending_tx"].includes(phase) || isPending;
  const buttonLabel = isBusy
    ? phase === "pending_tx" || isPending
      ? "CONFIRMING…"
      : "FORGING…"
    : "FORGE_ON_SOMNIA";

  // ── Render validation / result overlay ──
  if (["validating", "awaiting_wallet", "pending_tx", "complete", "error"].includes(phase)) {
    return (
      <>
        <ValidationScreen
          ticker={ticker}
          supply={supply}
          narrative={narrative}
          stepsDone={stepsDone}
          phase={phase}
          txHash={txHash}
          isPending={isPending}
          onReset={onReset}
        />
        {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}
      </>
    );
  }

  // ── Idle input screen ──
  return (
    <>
      <div className="min-h-full flex items-center justify-center px-4 sm:px-6 py-8 sm:py-12 blueprint-grid-fine">
        <div className="w-full max-w-3xl">

          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-white pb-3 sm:pb-4 mb-8 sm:mb-12">
            <div className="text-[10px] sm:text-[11px] tracking-[0.4em] text-white/60 truncate">
              // DEPLOYMENT_FORGE
            </div>
            <div className="font-mono text-[9px] sm:text-[10px] tracking-[0.3em] text-white/60 shrink-0">
              SOMNIA · v9.21
            </div>
          </div>

          {/* Wallet / balance row */}
          {!account ? (
            <div className="mb-8 border border-white/30 px-4 py-3 font-mono text-[10px] tracking-[0.3em] text-white/50 text-center animate-pulse">
              ⬡ CONNECT_WALLET_TO_FORGE — use header button
            </div>
          ) : (
            <div className="mb-8 border border-white/20 px-4 py-2.5 font-mono text-[10px] tracking-[0.25em] grid grid-cols-2 gap-2">
              <div className="flex items-center justify-between gap-2 border-r border-white/15 pr-2">
                <span className="text-white/40">OPERATOR</span>
                <span className="text-white">
                  {account.address.slice(0, 8)}…{account.address.slice(-5)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 pl-2">
                <span className="text-white/40">BALANCE</span>
                <span className="text-white tabular-nums">
                  {balance !== null ? `${balance} TKN` : "—"}
                </span>
              </div>
            </div>
          )}

          {/* Narrative */}
          <label className="block mb-12">
            <div className="font-mono text-[11px] tracking-[0.4em] text-white/60 mb-3">
              TOKEN_NARRATIVE
            </div>
            <input
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              placeholder="THE FUTURE IS UNWRITTEN"
              className="w-full bg-transparent border-0 border-b border-white px-0 py-4 font-display text-4xl md:text-6xl tracking-tight text-white placeholder-white/20 outline-none focus:border-white"
              style={{ borderRadius: 0 }}
            />
          </label>

          {/* Supply */}
          <label className="block mb-16">
            <div className="font-mono text-[11px] tracking-[0.4em] text-white/60 mb-3">
              SUPPLY
            </div>
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

          {/* Forge button — shows spinner when busy */}
          <button
            onClick={onForge}
            disabled={!account || isBusy}
            className={[
              "relative w-full overflow-hidden border border-white px-8 py-10",
              "font-display text-3xl md:text-5xl tracking-[0.15em] text-center transition-colors",
              "flex items-center justify-center gap-2",
              account && !isBusy
                ? "bg-white text-black hover:bg-black hover:text-white cursor-pointer"
                : isBusy
                ? "bg-black text-white cursor-wait"
                : "bg-white/10 text-white/30 cursor-not-allowed",
            ].join(" ")}
            style={{ borderRadius: 0 }}
          >
            {isBusy && <Spinner />}
            {buttonLabel}
          </button>

          {/* Footer stats */}
          <div className="mt-6 grid grid-cols-3 font-mono text-[10px] tracking-[0.3em] text-white/50">
            <span>GAS_EST: 0.0042 STT</span>
            <span className="text-center">
              STATUS:{" "}
              <span className={isBusy ? "text-white animate-pulse" : "text-white"}>
                {isBusy ? "PROCESSING" : account ? "READY" : "NO_WALLET"}
              </span>
            </span>
            <span className="text-right">
              CONTRACT: <span className="text-white">…807893</span>
            </span>
          </div>
        </div>
      </div>

      {/* Toast portal */}
      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}
    </>
  );
}

// ─── ValidationScreen ─────────────────────────────────────────────────────────
interface VSProps {
  ticker: string; supply: string; narrative: string;
  stepsDone: number; phase: Phase; txHash: string | null;
  isPending: boolean; onReset: () => void;
}

function ValidationScreen({
  ticker, supply, narrative, stepsDone, phase, txHash, isPending, onReset,
}: VSProps) {
  const complete = phase === "complete";
  const isError  = phase === "error";
  const waiting  = ["awaiting_wallet", "pending_tx"].includes(phase) || isPending;

  return (
    <div className="min-h-full flex items-center justify-center px-4 sm:px-6 py-8 sm:py-12 blueprint-grid-fine">
      <div className="w-full max-w-2xl space-y-8">

        {/* Title */}
        <div className="flex items-center justify-between gap-3 border-b border-white pb-3">
          <div className="text-[10px] tracking-[0.4em] text-white/60">
            //{" "}
            {complete ? "DEPLOYMENT_SUCCESS"
              : isError  ? "DEPLOYMENT_FAILED"
              : waiting  ? "AWAITING_SIGNATURE"
              : "DEPLOYMENT_SEQUENCE"}
          </div>
          <div className="font-mono text-[9px] tracking-[0.3em] text-white/60">
            ${ticker} · CHAIN_50312
          </div>
        </div>

        {/* Checklist */}
        <div className="space-y-3 font-mono text-sm">
          {CHECKS.map((check, i) => {
            const done    = i < stepsDone;
            const current = i === stepsDone && !complete && !isError && !waiting;
            return (
              <div
                key={check}
                className={[
                  "flex items-center gap-4 px-4 py-3 border transition-all duration-300",
                  done    ? "border-white bg-white/10 text-white"
                  : current ? "border-white/60 text-white/80 animate-pulse"
                  : "border-white/15 text-white/30",
                ].join(" ")}
              >
                <span className="text-lg leading-none shrink-0">
                  {done ? "■" : current ? "▶" : "□"}
                </span>
                <span className="tracking-[0.2em] text-[11px] sm:text-sm">{check}</span>
              </div>
            );
          })}
        </div>

        {/* Waiting — spinner + status */}
        {waiting && (
          <div className="border border-white/40 px-6 py-5 font-mono text-[11px] tracking-[0.3em] text-white/70">
            <div className="flex items-center gap-4">
              <svg
                className="w-5 h-5 animate-spin shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <circle cx="12" cy="12" r="10" strokeOpacity={0.25} />
                <path d="M12 2 a10 10 0 0 1 10 10" strokeLinecap="square" />
              </svg>
              <span className="animate-pulse">
                {phase === "pending_tx" || isPending
                  ? "TX_BROADCAST — WAITING FOR CONFIRMATION…"
                  : "AWAITING_METAMASK_SIGNATURE…"}
              </span>
            </div>
            {phase === "pending_tx" && (
              <div className="mt-3 text-white/40 text-[10px]">
                Do not close this tab. Somnia L1 is finalising your block.
              </div>
            )}
          </div>
        )}

        {/* Error — handled by Toast in parent; show reset button here too */}
        {isError && (
          <div className="border border-white/40 px-6 py-5 font-mono text-[11px] tracking-[0.25em] space-y-3 text-white/60">
            <div className="text-white font-bold tracking-[0.35em]">▲ TX_FAILED</div>
            <div className="text-[10px]">
              Check the notification at the bottom-right for details.
            </div>
            <button
              onClick={onReset}
              className="border border-white text-white px-4 py-2 text-xs tracking-[0.3em] hover:bg-white hover:text-black transition-colors"
              style={{ borderRadius: 0 }}
            >
              [ RETRY ]
            </button>
          </div>
        )}

        {/* Success */}
        {complete && (
          <div className="flex flex-col items-center gap-6 animate-fade-in">
            <Holo3D ticker={ticker} />

            <div className="text-center font-mono text-[11px] tracking-[0.35em] text-white/70 space-y-2 w-full">
              <div className="text-white font-bold text-sm">TOKEN_MINTED // SOMNIA_L1</div>
              <div className="truncate max-w-md mx-auto">
                "{narrative.toUpperCase() || "THE FUTURE IS UNWRITTEN"}"
              </div>
              <div className="text-white/50">
                SUPPLY: {supply || "1,000,000,000"} · TICKER: ${ticker}
              </div>

              {/* ── Explorer link ── */}
              {txHash && (
                <div className="pt-2">
                  <a
                    href={`${EXPLORER}/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 border border-white px-5 py-3
                               font-mono text-[11px] tracking-[0.3em] text-white
                               hover:bg-white hover:text-black transition-colors"
                    style={{ borderRadius: 0 }}
                  >
                    <span>↗</span>
                    <span>VIEW_ON_EXPLORER</span>
                  </a>
                </div>
              )}

              {/* Short tx hash display */}
              {txHash && (
                <div className="text-white/30 text-[9px] tracking-[0.2em] pt-1">
                  TX: {txHash.slice(0, 14)}…{txHash.slice(-8)}
                </div>
              )}
            </div>

            <button
              onClick={onReset}
              className="border border-white/50 px-6 py-3 font-mono text-xs tracking-[0.3em]
                         text-white/70 hover:border-white hover:text-white hover:bg-white/5
                         transition-colors"
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

// ─── Holo3D ───────────────────────────────────────────────────────────────────
function Holo3D({ ticker }: { ticker: string }) {
  const ringChars = useMemo(
    () => Array.from({ length: 24 }, (_, i) => "01"[i % 2]).join(" "),
    []
  );
  return (
    <div
      className="relative w-56 h-56 sm:w-72 sm:h-72 flex items-center justify-center"
      style={{ perspective: "900px" }}
    >
      <div className="absolute inset-0 border border-white/40 animate-holo-spin"
           style={{ transform: "rotateX(70deg)", borderRadius: 0 }} />
      <div className="absolute inset-6 border border-white/25 animate-holo-spin-rev"
           style={{ transform: "rotateX(70deg)", borderRadius: 0 }} />
      <div className="absolute inset-0 flex items-center justify-center font-mono
                      text-[10px] tracking-[0.4em] text-white/60 animate-holo-spin"
           style={{ transform: "rotateX(70deg)" }}>
        <span className="whitespace-nowrap">{ringChars}</span>
      </div>
      <div className="relative animate-holo-tilt" style={{ transformStyle: "preserve-3d" }}>
        <div
          className="border border-white bg-black px-6 py-4 font-display text-3xl sm:text-4xl
                     tracking-[0.2em] text-white relative"
          style={{ borderRadius: 0, boxShadow: "0 0 0 1px #fff inset, 0 0 24px rgba(255,255,255,0.25)" }}
        >
          <span className="relative z-10">${ticker}</span>
          <div
            className="pointer-events-none absolute inset-0 opacity-40 mix-blend-screen"
            style={{ backgroundImage: "repeating-linear-gradient(0deg,rgba(255,255,255,0.18) 0 1px,transparent 1px 3px)" }}
          />
        </div>
        <div className="absolute inset-0 border border-white/40"
             style={{ transform: "translateZ(-8px) translate(4px,4px)", borderRadius: 0 }} />
        <div className="absolute inset-0 border border-white/20"
             style={{ transform: "translateZ(-16px) translate(8px,8px)", borderRadius: 0 }} />
      </div>
      {["top-0 left-0 border-t border-l","top-0 right-0 border-t border-r",
        "bottom-0 left-0 border-b border-l","bottom-0 right-0 border-b border-r"].map((c, i) => (
        <span key={i} className={`absolute w-4 h-4 border-white ${c}`} />
      ))}
    </div>
  );
}
