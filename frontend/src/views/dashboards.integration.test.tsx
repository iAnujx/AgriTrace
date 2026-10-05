// Renders the real dashboards against a REAL local chain and clicks through the whole supply chain.
// Same setup as src/chain/api.integration.test.ts (set CHAIN_TEST_DEPLOYMENT); skipped otherwise.
import { forwardRef, type ReactNode } from "react";
import { existsSync, readFileSync } from "node:fs";
import { JsonRpcProvider, type JsonRpcSigner } from "ethers";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as api from "@/chain/api";
import { makeContracts, type Contracts } from "@/chain/contracts";
import type { Addresses } from "@/chain/config";

// ---- the screens talk to this fake wallet context (backed by a real chain) ----
const state: { chain: unknown } = { chain: null };
vi.mock("@/ContractContext", () => ({ useChain: () => state.chain }));
vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@tanstack/react-router", () => ({
  Link: forwardRef<HTMLAnchorElement, { children?: ReactNode }>(({ children }, ref) => <a ref={ref}>{children}</a>),
  useSearch: () => ({}),
}));

import FarmerDashboard from "./FarmerDashboard";
import DistributorDashboard from "./DistributorDashboard";
import RetailerDashboard from "./RetailerDashboard";
import ConsumerDashboard from "./ConsumerDashboard";
import PublicTrace from "./PublicTrace";

const DEPLOYMENT = process.env["CHAIN_TEST_DEPLOYMENT"];
const RPC = process.env["CHAIN_TEST_RPC"] || "http://127.0.0.1:8545";
async function nodeIsUp() {
  try {
    await new JsonRpcProvider(RPC).getBlockNumber();
    return true;
  } catch {
    return false;
  }
}
const enabled = !!DEPLOYMENT && existsSync(DEPLOYMENT) && (await nodeIsUp());

// a new crop name per run, so the test can be repeated on the same chain
const CROP = `Wheat${Date.now().toString().slice(-6)}`;

describe.skipIf(!enabled)("dashboards on a real chain", () => {
  let provider: JsonRpcProvider;
  let addresses: Addresses;
  let farmerW: JsonRpcSigner, distW: JsonRpcSigner, shopW: JsonRpcSigner;
  let read: Contracts;
  let shop = "";

  const as = (w: JsonRpcSigner | null) => {
    const contracts = w ? makeContracts(addresses, w) : null;
    state.chain = {
      hasWallet: true,
      account: w ? w.address : null,
      chainId: 31337,
      wrongNetwork: false,
      missing: [],
      contracts,
      read,
      connect: async () => undefined,
      switchNetwork: async () => undefined,
    };
    return contracts!;
  };
  beforeAll(async () => {
    const d = JSON.parse(readFileSync(DEPLOYMENT!, "utf8"));
    provider = new JsonRpcProvider(RPC, undefined, { cacheTimeout: -1 });
    addresses = {
      tracker: d.contracts.CropTracker,
      farmer: d.contracts.Farmer,
      distributor: d.contracts.distributor,
      viewer: d.contracts.SupplyChainViewer,
      retailer: d.contracts.Retailer,
    };
    read = makeContracts(addresses, provider);
    // accounts #4..#6 of the local node are unlocked, so no private keys are needed here
    [farmerW, distW, shopW] = (await Promise.all([4, 5, 6].map((i) => provider.getSigner(i)))) as [JsonRpcSigner, JsonRpcSigner, JsonRpcSigner];
    // the shop owner's shop, created exactly like the "Create my shop" button does
    shop = await api.deployShop(as(shopW));
    localStorage.setItem(`shop:${shopW.address.toLowerCase()}`, shop);
  }, 60_000);

  afterEach(cleanup);

  it("farmer registers a batch through the form", async () => {
    as(farmerW);
    render(<FarmerDashboard />);
    await screen.findByText(/your batches/i);

    fireEvent.click(screen.getByRole("button", { name: /register batch/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/crop name/i), { target: { value: CROP } });
    fireEvent.change(within(dialog).getByLabelText(/quantity/i), { target: { value: "1000" } });
    fireEvent.change(within(dialog).getByLabelText(/expected price/i), { target: { value: "20" } });
    fireEvent.change(within(dialog).getByLabelText(/grown at/i), { target: { value: "Meerut" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /register on blockchain/i }));

    expect(await screen.findByText(CROP, {}, { timeout: 15_000 })).toBeTruthy();
    expect(screen.getAllByText("1000 / 1000 kg").length).toBeGreaterThan(0);
  }, 40_000);

  it("distributor sees the farmer's offer, accepts it, and holds the stock", async () => {
    const f = as(farmerW);
    const batch = (await api.fetchBatches(f)).find((b) => b.cropName === CROP)!;
    await api.offerToDistributor(f, batch.id, 600, distW.address, 22);

    as(distW);
    render(<DistributorDashboard />);
    const accept = await screen.findByRole("button", { name: /accept/i }, { timeout: 15_000 });
    expect(screen.getAllByText("600 kg").length).toBeGreaterThan(0);
    fireEvent.click(accept);

    // the offer is now accepted, no Accept button is left, and the stock table lists the crop
    await waitFor(() => expect(screen.queryByRole("button", { name: /^accept$/i })).toBeNull(), { timeout: 20_000 });
    expect((await screen.findAllByText(CROP, {}, { timeout: 20_000 })).length).toBeGreaterThan(0);
    expect(screen.getAllByText("accepted").length).toBeGreaterThan(0);
    const mine = (await api.fetchHoldings(as(distW), distW.address)).find((h) => h.cropName === CROP)!;
    expect(mine.available).toBe(600);
    as(distW);
  }, 60_000);

  it("shop owner accepts the distributor's offer and marks the stock ready for sale", async () => {
    const d = as(distW);
    const holding = (await api.fetchHoldings(d, distW.address)).find((h) => h.cropName === CROP)!;
    await api.offerToRetailer(d, holding.fragmentId, 200, shop, 28);

    as(shopW);
    render(<RetailerDashboard />);
    fireEvent.click(await screen.findByRole("button", { name: /accept/i }, { timeout: 20_000 }));

    const ready = await screen.findByRole("button", { name: /ready for sale/i }, { timeout: 20_000 });
    expect(screen.getByText("On shelf")).toBeTruthy();
    fireEvent.click(ready);

    await waitFor(() => expect(screen.queryByRole("button", { name: /ready for sale/i })).toBeNull(), { timeout: 20_000 });
    expect(await screen.findByText("Ready for sale")).toBeTruthy(); // the badge
    expect(screen.getByRole("button", { name: /qr/i })).toBeTruthy();
  }, 80_000);

  it("a consumer without a wallet traces the product and sees the whole journey", async () => {
    const inv = await api.fetchInventory(as(shopW), shop);
    const id = inv[0]!.fragmentId;

    as(null);
    render(<ConsumerDashboard />);
    fireEvent.change(screen.getByPlaceholderText(/trace\?f=/i), { target: { value: String(id) } });
    fireEvent.click(screen.getByRole("button", { name: /^trace$/i }));

    expect(await screen.findByText("Grown by the farmer", {}, { timeout: 15_000 })).toBeTruthy();
    expect(screen.getByText("Bought by the distributor")).toBeTruthy();
    expect(screen.getByText("Received by the shop")).toBeTruthy();
    expect(screen.getByText("Meerut")).toBeTruthy();
  }, 40_000);

  it("the QR page confirms a genuine label and flags a forged one", async () => {
    const inv = await api.fetchInventory(as(shopW), shop);
    const label = await api.fetchLabel(read, inv[0]!.fragmentId);

    as(null);
    window.history.pushState({}, "", `/trace?f=${label.id}&b=${label.batchId}&o=${label.offset}&s=${label.size}`);
    render(<PublicTrace />);
    expect(await screen.findByText("Genuine label", {}, { timeout: 15_000 })).toBeTruthy();
    cleanup();

    window.history.pushState({}, "", `/trace?f=${label.id}&b=${label.batchId}&o=${label.offset}&s=${label.size + 50}`);
    render(<PublicTrace />);
    expect(await screen.findByText("Label does not match", {}, { timeout: 15_000 })).toBeTruthy();
  }, 40_000);
});
