# AgriTrace

Blockchain-backed farm-to-table traceability. Farmers, distributors, retailers and consumers each get their own dashboard and profile.

* **Trust layer (on-chain, Solidity/Hardhat)** in `backend/`: harvest batches, offers that the receiver must accept, retail shelf, label check. Money and stock ownership live here only.
* **App (TanStack Start + React)** in `frontend/`: dashboards, marketplace, QR scan, language switcher, settings.
* **Shared extras (Supabase)**: crop photos, bids, crop needs, warehouse and quality notes. Optional: without it the app still works and keeps extras on the device.

## Sign-in
MetaMask is the only login. The wallet address is the account.
* A new wallet picks a role once (farmer, distributor, retailer or consumer). That wallet is then tied to that role.
* A wallet seen before goes straight to its own role dashboard on every login, on any device (the role is also saved in the shared table when step 3 is done).
* Switching account inside MetaMask while signed in follows the new wallet's own role, or returns to the login screen if the wallet is new.
* Anyone can still open a QR trace link (`/trace`) without signing in.

## Launch in 4 steps
1. **Deploy the contracts** (once). Needs 3 funded Sepolia accounts. See `backend/README.md`.
   ```bash
   cd backend && npm install && cp .env.example .env   # fill keys + SEPOLIA_RPC_URL
   npm run deploy:sepolia                              # prints the 4 contract addresses
   ```
2. **Configure the app.**
   ```bash
   cd ../frontend && npm install && cp .env.example .env
   # paste the addresses into VITE_TRACKER_ADDRESS, VITE_FARMER_ADDRESS, VITE_DISTRIBUTOR_ADDRESS, VITE_VIEWER_ADDRESS
   # (VITE_SUPABASE_* are already filled for your project)
   ```
3. **Turn on shared extras** in Supabase (1 minute):
   * SQL editor: run `frontend/supabase/migrations/20261004000000_app_records.sql`.
4. **Run or publish.**
   ```bash
   npm run dev          # http://localhost:8080
   npm run build        # production build in .output (Cloudflare/Node target); or press Publish in Lovable
   ```
   Set the same `VITE_*` variables in your host's environment settings.

Try it without Sepolia: in `backend/` run `npx hardhat node`, then `npm run deploy:local` (prints the addresses). In `frontend/.env` also set `VITE_CHAIN_ID=31337` and `VITE_RPC_URL=http://127.0.0.1:8545`, and add that network in MetaMask (chain id 31337). Not tested here: I could not run Hardhat in this environment.

## What lives where
| Feature | Stored |
|---|---|
| Batches, offers, accept/reject, shelf, label check | blockchain |
| Crop photo, asking price, bids, crop needs | Supabase `app_records` (or this device) |
| Warehouse, packaging, quality rating, waste, transport, dispatch notes | Supabase `app_records` (or this device) |
| Profiles, settings, language | this device, per account and role |

## Known limits
* Extras are not tamper-proof: login is wallet/account based and the shared table has open write access (size-limited). Treat extras as hints; verify payments and ownership on chain.
* Bids are off-chain. Accepting a bid creates a normal on-chain offer; the distributor still has to accept it.
* Language switching uses Google Translate, so it needs internet access.
