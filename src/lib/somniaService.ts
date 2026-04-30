/**
 * somniaService.ts
 * SwarmForge · Somnia Shannon Testnet (Chain ID: 50312)
 *
 * Responsibilities:
 *  1. Viem public client  → read chain / watch blocks
 *  2. listenToSwarmEvents() → watch contract events → sync Supabase
 *  3. forgeToken()         → wallet write (MetaMask / WalletConnect)
 */

import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  parseAbi,
  parseEther,
  type Hash,
  type Log as ViemLog,
  type Chain,
} from "viem";
import { upsertAgent } from "./supabaseClient";
import type { AgentStatus, DnaPattern } from "./supabaseClient";

// ─── Somnia Shannon Testnet chain definition ──────────────────────────────────
export const somniaTestnet: Chain = {
  id: 50312,
  name: "Somnia Shannon Testnet",
  nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://dream-rpc.somnia.network"] },
    public:  { http: ["https://dream-rpc.somnia.network"] },
  },
  blockExplorers: {
    default: {
      name: "Somnia Explorer",
      url: "https://shannon-explorer.somnia.network",
    },
  },
  testnet: true,
};

// ─── Public (read-only) client ────────────────────────────────────────────────
export const publicClient = createPublicClient({
  chain: somniaTestnet,
  transport: http("https://dream-rpc.somnia.network", {
    retryCount: 3,
    retryDelay: 1500,
  }),
});

// ─── SwarmForge contract ABI (minimal) ───────────────────────────────────────
//
// Replace CONTRACT_ADDRESS with your deployed contract.
// The ABI covers the two events emitted by the swarm contract:
//   AgentUpdated  → fires when an agent's on-chain state changes
//   TokenForged   → fires when FORGE_ON_SOMNIA mint succeeds
//
export const SWARM_CONTRACT_ADDRESS =
  (import.meta as any).env?.VITE_CONTRACT_ADDRESS as `0x${string}` ??
  "0x0000000000000000000000000000000000000000";

export const SWARM_ABI = parseAbi([
  // Events
  "event AgentUpdated(uint256 indexed agentId, uint8 status, uint8 reputation, bytes32 dna)",
  "event TokenForged(address indexed forger, string ticker, uint256 supply, address contractAddr)",

  // Read
  "function getAgent(uint256 agentId) view returns (uint8 status, uint8 reputation, bytes32 dna, bytes32 lastTx)",
  "function totalForged() view returns (uint256)",

  // Write
  "function forgeToken(string calldata ticker, uint256 supply, string calldata narrative) payable returns (address)",
  "function updateAgent(uint256 agentId, uint8 status) returns (bool)",
]);

// ─── Helpers: map on-chain uint8 → domain types ──────────────────────────────

const ON_CHAIN_STATUS: Record<number, AgentStatus> = {
  0: "OFFLINE",
  1: "IDLE",
  2: "SYNC",
  3: "ACTIVE",
  4: "DEGRADED",
  5: "ELITE",
};

const ON_CHAIN_DNA: Record<number, DnaPattern> = {
  0: "empty",
  1: "dots",
  2: "stripes",
  3: "checker",
  4: "grid",
  5: "solid",
};

function statusFromChain(raw: number): AgentStatus {
  return ON_CHAIN_STATUS[raw] ?? "OFFLINE";
}

function dnaFromBytes32(raw: `0x${string}`): DnaPattern {
  // We use the last byte of the bytes32 as a DNA index (0-5)
  const lastByte = parseInt(raw.slice(-2), 16) % 6;
  return ON_CHAIN_DNA[lastByte] ?? "dots";
}

function reputationFromChain(raw: number): number {
  return Math.min(100, Math.max(0, raw));
}

// ─── TX Log entry (used by MonitorView) ──────────────────────────────────────
export interface TxLogEntry {
  hash: string;
  block: number;
  gas: string;
  status: "OK" | "REVERT";
  t: string;
  agentId?: string;
  event?: "AgentUpdated" | "TokenForged";
}

// ─── listenToSwarmEvents ──────────────────────────────────────────────────────
/**
 * Subscribes to on-chain events from the SwarmForge contract.
 * On each AgentUpdated event → upserts the agent row in Supabase.
 * Returns a teardown function for useEffect cleanup.
 *
 * @param onTx   called with a log entry for the TX_LOG_STREAM table
 * @param onError called on watch error
 */
export function listenToSwarmEvents(
  onTx: (entry: TxLogEntry) => void,
  onError?: (err: Error) => void
): () => void {
  // Watch AgentUpdated
  const unsubAgent = publicClient.watchContractEvent({
    address: SWARM_CONTRACT_ADDRESS,
    abi: SWARM_ABI,
    eventName: "AgentUpdated",
    onLogs: async (logs) => {
      for (const log of logs) {
        const { agentId, status, reputation, dna } = log.args as {
          agentId: bigint;
          status: number;
          reputation: number;
          dna: `0x${string}`;
        };

        const id = `AG_${String(Number(agentId) + 1).padStart(3, "0")}`;

        // 1. Push to Supabase
        try {
          await upsertAgent({
            id,
            dna: dnaFromBytes32(dna),
            status: statusFromChain(status),
            reputation: reputationFromChain(reputation),
            last_tx: log.transactionHash ?? null,
          });
        } catch (err) {
          console.error("[somniaService] Supabase upsert failed:", err);
        }

        // 2. Push to TX log stream
        onTx({
          hash: log.transactionHash ?? "0x???",
          block: Number(log.blockNumber ?? 0),
          gas: "—",
          status: "OK",
          t: new Date().toISOString().slice(11, 19),
          agentId: id,
          event: "AgentUpdated",
        });
      }
    },
    onError: (err) => {
      console.error("[somniaService] AgentUpdated watch error:", err);
      onError?.(err);
    },
  });

  // Watch TokenForged
  const unsubForge = publicClient.watchContractEvent({
    address: SWARM_CONTRACT_ADDRESS,
    abi: SWARM_ABI,
    eventName: "TokenForged",
    onLogs: (logs) => {
      for (const log of logs) {
        onTx({
          hash: log.transactionHash ?? "0x???",
          block: Number(log.blockNumber ?? 0),
          gas: "—",
          status: "OK",
          t: new Date().toISOString().slice(11, 19),
          event: "TokenForged",
        });
      }
    },
    onError: (err) => {
      console.error("[somniaService] TokenForged watch error:", err);
      onError?.(err);
    },
  });

  return () => {
    unsubAgent();
    unsubForge();
  };
}

// ─── forgeToken ───────────────────────────────────────────────────────────────
/**
 * Calls the `forgeToken` write function via MetaMask (window.ethereum).
 * Switches to Somnia Testnet automatically if needed.
 *
 * @returns transaction hash
 */
export interface ForgeParams {
  ticker: string;
  supply: bigint;
  narrative: string;
  /** STT value to send (forge fee) — defaults to 0.0042 STT */
  value?: bigint;
}

export async function forgeToken(params: ForgeParams): Promise<Hash> {
  if (typeof window === "undefined" || !(window as any).ethereum) {
    throw new Error("MetaMask not found. Please install MetaMask.");
  }

  const ethereum = (window as any).ethereum;

  // 1. Request account access
  await ethereum.request({ method: "eth_requestAccounts" });

  // 2. Switch / add Somnia Testnet
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: `0x${somniaTestnet.id.toString(16)}` }],
    });
  } catch (switchError: any) {
    // 4902 = chain not added yet
    if (switchError.code === 4902) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: `0x${somniaTestnet.id.toString(16)}`,
            chainName: somniaTestnet.name,
            nativeCurrency: somniaTestnet.nativeCurrency,
            rpcUrls: ["https://dream-rpc.somnia.network"],
            blockExplorerUrls: ["https://shannon-explorer.somnia.network"],
          },
        ],
      });
    } else {
      throw switchError;
    }
  }

  // 3. Create wallet client from injected provider
  const walletClient = createWalletClient({
    chain: somniaTestnet,
    transport: custom(ethereum),
  });

  const [address] = await walletClient.getAddresses();

  // 4. Send the transaction
  const hash = await walletClient.writeContract({
    address: SWARM_CONTRACT_ADDRESS,
    abi: SWARM_ABI,
    functionName: "forgeToken",
    args: [params.ticker, params.supply, params.narrative],
    value: params.value ?? parseEther("0.0042"),
    account: address,
  });

  return hash;
}

// ─── getChainStats ────────────────────────────────────────────────────────────
/** Fetch current block number + total forged count */
export async function getChainStats(): Promise<{
  blockNumber: number;
  totalForged: number;
}> {
  const [blockNumber, totalForged] = await Promise.all([
    publicClient.getBlockNumber(),
    publicClient.readContract({
      address: SWARM_CONTRACT_ADDRESS,
      abi: SWARM_ABI,
      functionName: "totalForged",
    }) as Promise<bigint>,
  ]);

  return {
    blockNumber: Number(blockNumber),
    totalForged: Number(totalForged),
  };
}
