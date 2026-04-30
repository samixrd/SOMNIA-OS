# SwarmForge

> AI-Agent Command Center · Built on Somnia Shannon Testnet

SwarmForge is a real-time dashboard for orchestrating a swarm of 128 autonomous AI agents deployed on the [Somnia Shannon Testnet](https://somnia.network). It combines on-chain token minting, live agent state telemetry, and PID-based stability monitoring into a single command interface.

---

## Features

- **Agent Matrix** — Live grid of 128 agents synced from Supabase in real time; each cell reflects on-chain DNA, status, and reputation
- **TX Log Stream** — Real-time feed of on-chain transactions from the SwarmForge contract
- **Stability Monitor** — PID controller metrics (Kp, Ti, error signal) streamed via Supabase Realtime
- **Forge on Somnia** — Mint ERC-20 tokens directly from the UI via MetaMask; balance updates automatically after each forge
- **Wallet Connect** — MetaMask, Coinbase Wallet, and email login via Thirdweb

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TanStack Start, Tailwind CSS v4 |
| Blockchain | [Somnia Shannon Testnet](https://somnia.network) (Chain ID: 50312) |
| Wallet / Contract | [Thirdweb v5](https://thirdweb.com) |
| Database / Realtime | [Supabase](https://supabase.com) |
| Blockchain Client | [viem](https://viem.sh) |

---

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/your-username/swarmforge.git
cd swarmforge
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

```env
VITE_THIRDWEB_CLIENT_ID=your_thirdweb_client_id
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_CONTRACT_ADDRESS=0xYourDeployedContractAddress
```

### 4. Set up the database

Run the migration in your Supabase SQL Editor:

```
supabase/migrations/001_swarmforge_schema.sql
```

### 5. Seed agents (first time only)

Open your browser console after starting the dev server and run:

```js
import { seedAgents } from './src/lib/supabaseClient'
await seedAgents()
```

### 6. Start the dev server

```bash
npm run dev
```

The app runs at `http://localhost:3000`.

---

## Environment Variables

| Variable | Description |
|---|---|
| `VITE_THIRDWEB_CLIENT_ID` | Thirdweb API key — [get one here](https://thirdweb.com/dashboard) |
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `VITE_CONTRACT_ADDRESS` | Deployed SwarmForge ERC-20 contract on Somnia |

---

## Project Structure

```
src/
├── components/
│   ├── WalletConnect.tsx       # Thirdweb ConnectButton
│   └── views/
│       ├── ArchitectView.tsx   # 01 — CORE_GENESIS
│       ├── MonitorView.tsx     # 02 — SWARM_HEARTBEAT (agent grid + TX log)
│       ├── StabilityView.tsx   # 03 — LOGIC_SYNAPSE (PID metrics)
│       └── ForgeView.tsx       # 04 — ASSET_FORGE (mint tokens)
├── hooks/
│   └── useSwarmData.ts         # useAgents, useStabilityMetrics hooks
├── lib/
│   ├── supabaseClient.ts       # Supabase client + realtime subscriptions
│   └── somniaService.ts        # viem client + on-chain event listener
└── routes/
    ├── __root.tsx              # ThirdwebProvider + app shell
    └── index.tsx               # Main layout + navigation
supabase/
└── migrations/
    └── 001_swarmforge_schema.sql
```

---

## Network Details

| | |
|---|---|
| Network | Somnia Shannon Testnet |
| Chain ID | `50312` |
| RPC URL | `https://dream-rpc.somnia.network` |
| Explorer | https://explorer-shannon.somnia.network |
| Faucet | https://testnet.somnia.network |

---

## Scripts

```bash
npm run dev       # Start development server
npm run build     # Production build
npm run preview   # Preview production build locally
npm run lint      # Run ESLint
npm run format    # Run Prettier
```

---

## License

MIT
