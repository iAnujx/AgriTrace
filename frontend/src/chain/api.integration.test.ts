// @vitest-environment node
// Runs the whole supply chain through src/chain/api.ts against a REAL chain.
//
//   1. cd backend && npx hardhat node                                     (terminal 1)
//   2. cd backend && npx hardhat run scripts/deployAll.js --network localhost
//   3. cd frontend && CHAIN_TEST_DEPLOYMENT=../backend/deployments/localhost.json npm test
//
// Without CHAIN_TEST_DEPLOYMENT (or without a node) the suite is skipped, so a plain `npm test` still passes.
import { existsSync, readFileSync } from "node:fs";
import { JsonRpcProvider, Wallet } from "ethers";
import { describe, expect, it, beforeAll } from "vitest";
import * as api from "./api";
import { makeContracts, type Contracts } from "./contracts";
import type { Addresses } from "./config";

const DEPLOYMENT = process.env["CHAIN_TEST_DEPLOYMENT"];
const RPC = process.env["CHAIN_TEST_RPC"] || "http://127.0.0.1:8545";

// the well-known Hardhat test accounts #0..#3 (never use them on a real network)
const KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // farmer
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // distributor
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // shop owner (deployed shop)
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // a second retailer
];

async function nodeIsUp() {
  try {
    await new JsonRpcProvider(RPC).getBlockNumber();
    return true;
  } catch {
    return false;
  }
}

const enabled = !!DEPLOYMENT && existsSync(DEPLOYMENT) && (await nodeIsUp());

describe.skipIf(!enabled)("chain api: farmer -> distributor -> shop -> consumer", () => {
  let provider: JsonRpcProvider;
  let addresses: Addresses;
  let shop: string;
  let farmer: Contracts, dist: Contracts, owner: Contracts, other: Contracts, reader: Contracts;
  let farmerW: Wallet, distW: Wallet, ownerW: Wallet, otherW: Wallet;
  let batchId = 0;
  let fragmentAtDistributor = 0;
  let fragmentAtShop = 0;

  beforeAll(() => {
    const d = JSON.parse(readFileSync(DEPLOYMENT!, "utf8"));
    provider = new JsonRpcProvider(RPC, undefined, { cacheTimeout: -1 });
    [farmerW, distW, ownerW, otherW] = KEYS.map((k) => new Wallet(k, provider)) as [Wallet, Wallet, Wallet, Wallet];
    addresses = {
      tracker: d.contracts.CropTracker,
      farmer: d.contracts.Farmer,
      distributor: d.contracts.distributor,
      viewer: d.contracts.SupplyChainViewer,
      retailer: d.contracts.Retailer,
    };
    shop = addresses.retailer;
    farmer = makeContracts(addresses, farmerW);
    dist = makeContracts(addresses, distW);
    owner = makeContracts(addresses, ownerW);
    other = makeContracts(addresses, otherW);
    reader = makeContracts(addresses, provider); // no wallet: what a consumer's browser uses
  });

  it("farmer registers a batch", async () => {
    batchId = await api.createBatch(farmer, {
      cropName: "wheat",
      cropType: "rabi",
      quantity: 1000,
      expectedPrice: 20,
      location: "meerut",
      harvestDate: "2026-09-01",
    });
    expect(batchId).toBeGreaterThan(0);

    const mine = (await api.fetchBatches(farmer)).find((b) => b.id === batchId)!;
    expect(mine.cropName).toBe("wheat");
    expect(mine.left).toBe(1000);
    expect(mine.total).toBe(1000);
  });

  it("farmer's offer waits for the distributor (nothing moves)", async () => {
    const r = await api.offerToDistributor(farmer, batchId, 600, distW.address, 22);
    expect(r.delivered).toBe(false);

    const offers = await api.fetchFarmerOffers(farmer, farmerW.address);
    const o = offers.find((x) => x.id === r.offerId)!;
    expect(o.status).toBe("pending");
    expect((await api.fetchBatches(farmer)).find((b) => b.id === batchId)!.left).toBe(1000);
    expect((await api.fetchHoldings(dist, distW.address)).some((h) => h.batchId === batchId)).toBe(false);
  });

  it("the wrong wallet cannot accept; the distributor can", async () => {
    const incoming = await api.fetchIncomingOffers(dist, distW.address);
    const pending = incoming.filter((o) => o.status === "pending");
    expect(pending.length).toBeGreaterThan(0);
    const offer = pending[pending.length - 1]!;

    await expect(api.acceptFarmerOffer(other, offer.id)).rejects.toSatisfy((e) =>
      api.errorMessage(e).includes("Not the distributor of this offer"),
    );

    await api.acceptFarmerOffer(dist, offer.id);
    const holdings = await api.fetchHoldings(dist, distW.address);
    const h = holdings.find((x) => x.batchId === batchId)!;
    expect(h.available).toBe(600);
    expect(h.cropName).toBe("wheat");
    expect(h.paidPrice).toBe(22);
    fragmentAtDistributor = h.fragmentId;

    expect((await api.fetchBatches(farmer)).find((b) => b.id === batchId)!.left).toBe(400);
  });

  it("distributor offers to the shop; the shop owner accepts; stock lands on the shelf", async () => {
    expect(await api.shopOwner(dist, shop)).toBe(ownerW.address);

    const r = await api.offerToRetailer(dist, fragmentAtDistributor, 200, shop, 28);
    expect(r.delivered).toBe(false);
    expect((await api.fetchInventory(owner, shop)).some((i) => i.batchId === batchId)).toBe(false);

    const pending = (await api.fetchShopOffers(owner, shop)).find((o) => o.id === r.offerId)!;
    expect(pending.status).toBe("pending");

    // the distributor himself may not accept on the shop's behalf
    await expect(api.acceptRetailerOffer(dist, r.offerId)).rejects.toSatisfy((e) =>
      api.errorMessage(e).includes("Not the retailer owner"),
    );

    await api.acceptRetailerOffer(owner, r.offerId);
    const item = (await api.fetchInventory(owner, shop)).find((i) => i.batchId === batchId)!;
    expect(item.status).toBe("on_shelf");
    expect(item.quantity).toBe(200);
    expect(item.price).toBe(28);
    expect(item.cropName).toBe("wheat");
    fragmentAtShop = item.fragmentId;

    const h = (await api.fetchHoldings(dist, distW.address)).find((x) => x.fragmentId === fragmentAtDistributor)!;
    expect(h.available).toBe(400);
  });

  it("shop sets a price and marks the unit final", async () => {
    await api.setShelfPrice(owner, shop, fragmentAtShop, 35);
    await api.markFinal(owner, shop, fragmentAtShop);
    const item = (await api.fetchInventory(owner, shop)).find((i) => i.fragmentId === fragmentAtShop)!;
    expect(item.status).toBe("finalized");
    expect(item.price).toBe(35);
  });

  it("a consumer (no wallet) sees the whole journey and can verify the label", async () => {
    const p = await api.fetchProduct(reader, fragmentAtShop);
    expect(p.journey.map((s) => s.kind)).toEqual(["farm", "distributor", "retailer"]);
    expect(p.journey.map((s) => s.price)).toEqual([0, 22, 28]);
    expect(p.journey[0]!.holder).toBe(farmerW.address);
    expect(p.journey[1]!.holder).toBe(distW.address);
    expect(p.journey[2]!.holder).toBe(shop);
    expect(p.origin).toMatchObject({ found: true, cropName: "wheat", farmLocation: "meerut", farmer: farmerW.address });
    expect(p.retail).toMatchObject({ atRetailer: true, status: "finalized", price: 35, distributor: distW.address });
    expect(p.fragment).toMatchObject({ isFinal: true, size: 200, owner: shop });

    expect(await api.verifyLabel(reader, p.fragment.id, p.fragment.batchId, p.fragment.offset, p.fragment.size)).toBe(true);
    expect(await api.verifyLabel(reader, p.fragment.id, p.fragment.batchId, p.fragment.offset, p.fragment.size + 1)).toBe(false);
  });

  it("farmer can cancel a pending offer; a delivered one cannot be deleted", async () => {
    const r = await api.offerToDistributor(farmer, batchId, 50, distW.address, 22);
    await api.cancelFarmerOffer(farmer, r.offerId);
    const o = (await api.fetchFarmerOffers(farmer, farmerW.address)).find((x) => x.id === r.offerId)!;
    expect(o.status).toBe("cancelled");

    await expect(api.deleteBatch(farmer, batchId)).rejects.toSatisfy((e) => api.errorMessage(e).includes("Batch already shipped"));
  });

  it("auto-accept (trusted farmer) delivers at once; rejecting leaves stock untouched", async () => {
    await api.setTrustedFarmer(dist, farmerW.address, true);
    expect(await api.trustsFarmer(dist, distW.address, farmerW.address)).toBe(true);
    const r = await api.offerToDistributor(farmer, batchId, 100, distW.address, 21);
    expect(r.delivered).toBe(true);
    await api.setTrustedFarmer(dist, farmerW.address, false);

    const r2 = await api.offerToDistributor(farmer, batchId, 100, distW.address, 21);
    expect(r2.delivered).toBe(false);
    await api.rejectFarmerOffer(dist, r2.offerId);
    const o = (await api.fetchIncomingOffers(dist, distW.address)).find((x) => x.id === r2.offerId)!;
    expect(o.status).toBe("rejected");
  });

  it("a new retailer can create their own shop and receive stock", async () => {
    const myShop = await api.deployShop(other);
    expect(await api.shopOwner(other, myShop)).toBe(otherW.address);

    const h = (await api.fetchHoldings(dist, distW.address)).find((x) => x.available >= 50)!;
    const r = await api.offerToRetailer(dist, h.fragmentId, 50, myShop, 30);
    await api.setTrustedDistributor(other, myShop, distW.address, true);
    expect(await api.trustsDistributor(other, myShop, distW.address)).toBe(true);
    await api.acceptRetailerOffer(other, r.offerId);

    const inv = await api.fetchInventory(other, myShop);
    expect(inv).toHaveLength(1);
    await api.reportDamaged(other, myShop, inv[0]!.fragmentId, "water damage");
    expect((await api.fetchInventory(other, myShop))[0]!.status).toBe("damaged");
  });

  it("partners are derived from the offers", async () => {
    const f = await api.fetchPartners(farmer, farmerW.address, "farmer");
    expect(f[0]).toMatchObject({ address: distW.address, role: "distributor" });
    expect(f[0]!.kg).toBeGreaterThanOrEqual(600);

    const d = await api.fetchPartners(dist, distW.address, "distributor");
    const roles = d.map((p) => p.role);
    expect(roles).toContain("farmer");
    expect(roles).toContain("retailer");

    const s = await api.fetchPartners(owner, ownerW.address, "retailer", shop);
    expect(s[0]).toMatchObject({ address: distW.address, role: "distributor" });
  });

  it("parseFragmentInput understands ids and QR links", () => {
    expect(api.parseFragmentInput("12")).toBe(12);
    expect(api.parseFragmentInput(" #7 ")).toBe(7);
    expect(api.parseFragmentInput("https://x.app/trace?f=33")).toBe(33);
    expect(api.parseFragmentInput("abc")).toBeNull();
    expect(api.parseFragmentInput("0")).toBeNull();
  });
});
