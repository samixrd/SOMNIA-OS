/**
 * ForgeView.tsx  (Thirdweb v5 integration)
 *
 * FORGE_ON_SOMNIA button calls the ERC-20 contract's `mintTo` function
 * via Thirdweb v5 hooks:
 *   - useActiveAccount()    → connected wallet
 *   - useSendTransaction()  → sends the prepared tx
 *   - prepareContractCall() → encodes the mint call
 *
 * Contract: 0xFD585f3225DE051B55206B875Ee8B9a318807893
 * Network:  Somnia Shannon Testnet (50312)
 */

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useActiveAccount, useSendTransaction } from "thirdweb/react";
import { getContract, prepareContractCall, toWei } from "thirdweb";
import { thirdwebClient } from "@/components/WalletConnect";
import { somniaChain } from "@/routes/__root";
import type { TxLogEntry } from "@/lib/somniaService";

// ─── Contract ─────────────────────────────────────────────────────────────────
export const SWARM_CONTRACT_ADDRESS =
  "0xFD585f3225DE051B55206B875Ee8B9a318807893" as const;

const swarmContract = getContract({
  client: thirdwebClient,
  chain: somniaChain,
  address: SWARM_CONTRACT_ADDRESS,
});

// ─── Types ────────────────────────────────────────────────────────────────────
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

function useBeep() {
  const [pulse, setPulse] = useState(0);
  const trigger = () => setPulse((p) => p + 1);
  return { pulse, trigger };
}

interface ForgeViewProps {
  /** Optional callback so MonitorView TX log syncs instantly on success */
  onTxSuccess?: (entry: TxLogEntry) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function ForgeView({ onTxSuccess }: ForgeViewProps = {}) {
  const account = useActiveAccount();
  const { mutate: sendTx, isPending } = useSendTransaction();

  const [narrative, setNarrative] = useState("");
  const [supply, setSupply]       = useState("");
  const [phase, setPhase]         = useState<Phase>("idle");
  const [stepsDone, setStepsDone] = useState(0);
  const [txHash, setTxHash]       = useState<string | null>(null);
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const beep = useBeep();

  const ticker = useMemo(
    () =>
      narrative
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w[0] || "")
        .join("")
        .toUpperCase()
        .slice(0, 4) || "SMNX",
    [narrative]
  );

  const runValidationAnimation = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setStepsDone(0);
    CHECKS.forEach((_, i) => {
      const t = setTimeout(() => {
        setStepsDone(i + 1);
        beep.trigger();
      }, (i + 1) * STEP_MS);
      timersRef.current.push(t);
    });
  }, []);

  const onForge = async () => {
    if (!account) {
      setErrorMsg("WALLET_NOT_CONNECTED — use [ CONNECT_WALLET ] in the header.");
      setPhase("error");
      return;
    }
    if (["validating", "awaiting_wallet", "pending_tx"].includes(phase)) return;

    setErrorMsg(null);
    setTxHash(null);
    setPhase("validating");
    runValidationAnimation();

    const animDuration = CHECKS.length * STEP_MS + 400;
    const t = setTimeout(async () => {
      setPhase("awaiting_wallet");
      try {
        const supplyRaw = BigInt(supply.replace(/,/g, "") || "1000000000");

        // mintTo(address to, uint256 amount) — standard Thirdweb ERC-20 extension
        const transaction = prepareContractCall({
          contract: swarmContract,
          method: "function mintTo(address to, uint256 amount)",
          params: [account.address, toWei(supplyRaw.toString())],
        });

        setPhase("pending_tx");

        sendTx(transaction, {
          onSuccess: (receipt) => {
            setTxHash(receipt.transactionHash);
            setPhase("complete");
            onTxSuccess?.({
              hash: receipt.transactionHash,
              block: Number(receipt.blockNumber ?? 0),
              gas: receipt.gasUsed
                ? (Number(receipt.gasUsed) / 1e9).toFixed(5)
                : "—",
              status: "OK",
              t: new Date().toISOString().slice(11, 19),
              event: "TokenForged",
            });
          },
          onError: (err: Error) => {
            setErrorMsg(err?.message ?? "Transaction failed");
            setPhase("error");
          },
        });
      } catch (err: any) {
        setErrorMsg(err?.message ?? "Unknown error");
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
    setErrorMsg(null);
  };

  useEffect(() => () => { timersRef.current.forEach(clearTimeout); }, []);

  if (["validating","awaiting_wallet","pending_tx","complete","error"].includes(phase)) {
    return (
      <ValidationScreen
        ticker={ticker}
        supply={supply}
        narrative={narrative}
        stepsDone={stepsDone}
        phase={phase}
        txHash={txHash}
        errorMsg={errorMsg}
        beepPulse={beep.pulse}
        isPending={isPending}
        onReset={onReset}
      />
    );
  }

  return (
    <div className="min-h-full flex items-center justify-center px-4 sm:px-6 py-8 sm:py-12 blueprint-grid-fine">
      <div className="w-full max-w-3xl">

        <div className="flex items-center justify-between gap-3 border-b border-white pb-3 sm:pb-4 mb-8 sm:mb-12">
          <div className="text-[10px] sm:text-[11px] tracking-[0.4em] text-white/60 truncate">
            // DEPLOYMENT_FORGE
          </div>
          <div className="font-mono text-[9px] sm:text-[10px] tracking-[0.3em] text-white/60 shrink-0">
            SOMNIA · v9.21
          </div>
        </div>

        {/* Wallet status */}
        {!account ? (
          <div className="mb-8 border border-white/30 px-4 py-3 font-mono text-[10px] tracking-[0.3em] text-white/50 text-center animate-pulse">
            ⬡ CONNECT_WALLET_TO_FORGE — use header button
          </div>
        ) : (
          <div className="mb-8 border border-white/20 px-4 py-2 font-mono text-[10px] tracking-[0.25em] text-white/40 flex items-center justify-between gap-3">
            <span>OPERATOR</span>
            <span className="text-white truncate">
              {account.address.slice(0, 10)}…{account.address.slice(-6)}
            </span>
          </div>
        )}

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

        <button
          onClick={onForge}
          disabled={!account}
          className={[
            "relative w-full overflow-hidden border border-white px-8 py-10",
            "font-display text-3xl md:text-5xl tracking-[0.15em] text-center transition-colors",
            account
              ? "bg-white text-black hover:bg-black hover:text-white cursor-pointer"
              : "bg-white/10 text-white/30 cursor-not-allowed",
          ].join(" ")}
          style={{ borderRadius: 0 }}
        >
          FORGE_ON_SOMNIA
        </button>

        <div className="mt-6 grid grid-cols-3 font-mono text-[10px] tracking-[0.3em] text-white/50">
          <span>GAS_EST: 0.0042 STT</span>
          <span className="text-center">
            STATUS:{" "}
            <span className="text-white">{account ? "READY" : "NO_WALLET"}</span>
          </span>
          <span className="text-right">
            CONTRACT: <span className="text-white">…807893</span>
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── ValidationScreen ─────────────────────────────────────────────────────────
interface VSProps {
  ticker: string; supply: string; narrative: string;
  stepsDone: number; phase: Phase; txHash: string | null;
  errorMsg: string | null; beepPulse: number; isPending: boolean;
  onReset: () => void;
}

function ValidationScreen({
  ticker, supply, narrative, stepsDone, phase,
  txHash, errorMsg, beepPulse, isPending, onReset,
}: VSProps) {
  const complete = phase === "complete";
  const isError  = phase === "error";
  const waiting  = ["awaiting_wallet","pending_tx"].includes(phase) || isPending;

  return (
    <div className="min-h-full flex items-center justify-center px-4 sm:px-6 py-8 sm:py-12 blueprint-grid-fine">
      <div className="w-full max-w-2xl space-y-8">

        <div className="flex items-center justify-between gap-3 border-b border-white pb-3">
          <div className="text-[10px] tracking-[0.4em] text-white/60">
            //{" "}
            {complete ? "DEPLOYMENT_SUCCESS"
              : isError ? "DEPLOYMENT_FAILED"
              : waiting ? "AWAITING_SIGNATURE"
              : "DEPLOYMENT_SEQUENCE"}
          </div>
          <div className="font-mono text-[9px] tracking-[0.3em] text-white/60">
            ${ticker} · CHAIN_50312
          </div>
        </div>

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
                <span className="text-lg leading-none">
                  {done ? "■" : current ? "▶" : "□"}
                </span>
                <span className="tracking-[0.2em] text-[11px] sm:text-sm">{check}</span>
              </div>
            );
          })}
        </div>

        {waiting && (
          <div className="border border-white/40 px-6 py-4 font-mono text-[11px] tracking-[0.3em] text-white/70 animate-pulse text-center">
            ⬡{" "}
            {phase === "pending_tx" || isPending
              ? "TX_BROADCAST — WAITING FOR CONFIRMATION…"
              : "AWAITING_METAMASK_SIGNATURE…"}
          </div>
        )}

        {isError && (
          <div className="border border-white px-6 py-5 font-mono text-[11px] tracking-[0.25em] space-y-3">
            <div className="font-bold tracking-[0.3em]">▲ TX_FAILED</div>
            <div className="text-white/60 break-all text-[10px]">{errorMsg}</div>
            <button
              onClick={onReset}
              className="border border-white px-4 py-2 text-xs tracking-[0.3em] hover:bg-white hover:text-black transition-colors"
              style={{ borderRadius: 0 }}
            >
              [ RETRY ]
            </button>
          </div>
        )}

        {complete && (
          <div className="flex flex-col items-center gap-6 animate-fade-in">
            <Holo3D ticker={ticker} />
            <div className="text-center font-mono text-[11px] tracking-[0.35em] text-white/70 space-y-2">
              <div className="text-white font-bold">TOKEN_MINTED // SOMNIA_L1</div>
              <div className="truncate max-w-md">
                "{narrative.toUpperCase() || "THE FUTURE IS UNWRITTEN"}"
              </div>
              <div className="text-white/50">
                SUPPLY: {supply || "1,000,000,000"} · TICKER: ${ticker}
              </div>
              {txHash && (
                <div className="pt-1">
                  <a
                    href={`https://shannon-explorer.somnia.network/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white underline underline-offset-2 text-[10px] tracking-[0.2em] hover:text-white/70"
                  >
                    VIEW_TX ↗ {txHash.slice(0, 20)}…
                  </a>
                </div>
              )}
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
      <div className="absolute inset-0 border border-white/40 animate-holo-spin" style={{ transform: "rotateX(70deg)", borderRadius: 0 }} />
      <div className="absolute inset-6 border border-white/25 animate-holo-spin-rev" style={{ transform: "rotateX(70deg)", borderRadius: 0 }} />
      <div className="absolute inset-0 flex items-center justify-center font-mono text-[10px] tracking-[0.4em] text-white/60 animate-holo-spin" style={{ transform: "rotateX(70deg)" }}>
        <span className="whitespace-nowrap">{ringChars}</span>
      </div>
      <div className="relative animate-holo-tilt" style={{ transformStyle: "preserve-3d" }}>
        <div
          className="border border-white bg-black px-6 py-4 font-display text-3xl sm:text-4xl tracking-[0.2em] text-white relative"
          style={{ borderRadius: 0, boxShadow: "0 0 0 1px #fff inset, 0 0 24px rgba(255,255,255,0.25)" }}
        >
          <span className="relative z-10">${ticker}</span>
          <div className="pointer-events-none absolute inset-0 opacity-40 mix-blend-screen" style={{ backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,0.18) 0 1px, transparent 1px 3px)" }} />
        </div>
        <div className="absolute inset-0 border border-white/40" style={{ transform: "translateZ(-8px) translate(4px,4px)", borderRadius: 0 }} />
        <div className="absolute inset-0 border border-white/20" style={{ transform: "translateZ(-16px) translate(8px,8px)", borderRadius: 0 }} />
      </div>
      {["top-0 left-0 border-t border-l","top-0 right-0 border-t border-r","bottom-0 left-0 border-b border-l","bottom-0 right-0 border-b border-r"].map((c, i) => (
        <span key={i} className={`absolute w-4 h-4 border-white ${c}`} />
      ))}
    </div>
  );
}
