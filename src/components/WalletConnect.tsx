/**
 * WalletConnect.tsx
 * SwarmForge · Somnia Shannon Testnet
 *
 * Thirdweb v5 ConnectButton styled to match the monochrome SwarmForge UI.
 * Drop this into the header in index.tsx.
 *
 * Usage:
 *   import { WalletConnect } from "@/components/WalletConnect";
 *   <WalletConnect />
 */

import { ConnectButton } from "thirdweb/react";
import { createThirdwebClient } from "thirdweb";
import { somniaChain } from "@/routes/__root";
import { inAppWallet, createWallet } from "thirdweb/wallets";

// ─── Thirdweb client (singleton) ─────────────────────────────────────────────
export const thirdwebClient = createThirdwebClient({
  clientId: import.meta.env.VITE_THIRDWEB_CLIENT_ID,
});

// ─── Supported wallets ────────────────────────────────────────────────────────
const WALLETS = [
  createWallet("io.metamask"),
  createWallet("com.coinbase.wallet"),
  createWallet("me.rainbow"),
  inAppWallet({
    auth: { options: ["email", "google"] },
  }),
];

// ─── Component ────────────────────────────────────────────────────────────────
export function WalletConnect() {
  return (
    <ConnectButton
      client={thirdwebClient}
      chain={somniaChain}
      wallets={WALLETS}
      // ── Visual overrides to match the black/white SwarmForge aesthetic ──
      connectButton={{
        label: "[ CONNECT_WALLET ]",
        style: {
          background: "transparent",
          border: "1px solid rgba(255,255,255,0.6)",
          borderRadius: 0,
          color: "rgba(255,255,255,0.8)",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "10px",
          letterSpacing: "0.3em",
          padding: "6px 14px",
          height: "auto",
          cursor: "pointer",
          transition: "all 0.15s",
        },
      }}
      connectModal={{
        title: "SWARMFORGE_AUTH",
        titleIcon: "",
        size: "compact",
        showThirdwebBranding: false,
      }}
      detailsButton={{
        style: {
          background: "transparent",
          border: "1px solid rgba(255,255,255,0.4)",
          borderRadius: 0,
          color: "rgba(255,255,255,0.8)",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "10px",
          letterSpacing: "0.25em",
          padding: "6px 14px",
          height: "auto",
        },
      }}
    />
  );
}
