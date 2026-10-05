# AgriTrace backend

Solidity 0.8.30 + Hardhat. See the main [README](../README.md) for the full flow.

```bash
npm install
npm test                  # 125 tests
npm run node              # local chain
npm run deploy:local      # deploys everything, prints the VITE_* lines for the frontend
npm run deploy:sepolia    # needs .env (copy .env.example)
```

Contracts: `CropTracker` (who holds which kg), `Farmer`, `distributor`, `Retailer`, `SupplyChainViewer` (read-only, one call for the whole journey).
