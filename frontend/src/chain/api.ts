// Every call to the smart contracts lives here, so the screens stay simple.
// Functions take a `Contracts` bundle (see contracts.ts) and return plain numbers/strings.
import { ContractFactory, type ContractTransactionReceipt, type Interface, type Signer } from "ethers";
import { makeContracts, retailerAbi, type Contracts } from "./contracts";
import retailerBytecode from "@/ABI/Retailer.bytecode.json";
import type {
  FarmBatch,
  FarmerOffer,
  FragmentInfo,
  Holding,
  JourneyStep,
  OfferStatus,
  Product,
  RetailerOffer,
  ShelfItem,
  ShelfStatus,
} from "./types";

// ----------------------------------------------------------------- helpers
const num = (v: bigint | number | string) => Number(v);
const OFFER_STATUS: OfferStatus[] = ["pending", "accepted", "rejected", "cancelled"];
const SHELF_STATUS: ShelfStatus[] = ["in_transit", "on_shelf", "finalized", "damaged"];
const offerStatus = (n: number): OfferStatus => OFFER_STATUS[n] ?? "pending";
const shelfStatus = (n: number): ShelfStatus => SHELF_STATUS[n] ?? "in_transit";

export const shortAddr = (a: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
export const sameAddr = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** Turn any wallet/contract error into one readable line. */
export function errorMessage(e: unknown): string {
  const err = e as {
    code?: string | number;
    reason?: string;
    shortMessage?: string;
    message?: string;
    info?: { error?: { code?: number; message?: string } };
    revert?: { args?: unknown[] };
  };
  if (err?.code === "ACTION_REJECTED" || err?.code === 4001 || err?.info?.error?.code === 4001) {
    return "You cancelled the request in your wallet.";
  }
  const reason = err?.reason || (err?.revert?.args?.[0] as string | undefined);
  if (reason) return reason;
  return err?.info?.error?.message || err?.shortMessage || err?.message || String(e);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function send(p: Promise<any>): Promise<ContractTransactionReceipt> {
  const tx = await p;
  const rc = await tx.wait();
  if (!rc || rc.status !== 1) throw new Error("Transaction failed");
  return rc;
}

/** value of `key` in the first event called `name` in a receipt (null if the event is absent) */
function eventNum(contract: { interface: Interface }, rc: ContractTransactionReceipt, name: string, key: string) {
  for (const log of rc.logs) {
    try {
      const parsed = contract.interface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed?.name === name) return Number(parsed.args.getValue(key));
    } catch {
      /* log from another contract */
    }
  }
  return null;
}

/** Accepts "12", "#12", or a link like https://site/trace?f=12 */
export function parseFragmentInput(text: string): number | null {
  const t = text.trim();
  const m = t.match(/[?&]f=(\d+)/) ?? t.match(/^#?(\d+)$/);
  const n = m ? Number(m[1]) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

const nameCache = new Map<string, string>();
/** profile name stored on-chain (Farmer.set_farmer_profile_name), falls back to a short address */
export async function nameOf(c: Contracts, address: string): Promise<string> {
  const key = address.toLowerCase();
  if (!nameCache.has(key)) {
    let name = "";
    try {
      name = await c.farmer.farmer_profile_name(address);
    } catch {
      /* ignore */
    }
    nameCache.set(key, name);
  }
  return nameCache.get(key) || shortAddr(address);
}

// ------------------------------------------------------------------ mappers
function mapFragment(f: any): FragmentInfo {
  return {
    id: num(f.id),
    batchId: num(f.identification),
    farmer: f.farmer,
    parentId: num(f.parentId),
    offset: num(f.offset),
    size: num(f.size),
    allocated: num(f.allocated),
    canSplit: f.mf,
    isFinal: f.df,
    owner: f.owner,
    createdAt: num(f.createdAt),
  };
}

function mapFarmerOffer(o: any): FarmerOffer {
  return {
    id: num(o.id),
    farmer: o.farmer,
    distributor: o.distributor,
    batchId: num(o.batch_id),
    quantity: num(o.quantity),
    price: num(o.price),
    status: offerStatus(num(o.status)),
    fragmentId: num(o.fragment_id),
    createdAt: num(o.created_at),
  };
}

function mapRetailerOffer(o: any): RetailerOffer {
  return {
    id: num(o.id),
    sender: o.sender,
    retailer: o.retailer,
    parentFragmentId: num(o.parent_fragment_id),
    batchId: num(o.batch_id),
    quantity: num(o.quantity),
    price: num(o.price),
    status: offerStatus(num(o.status)),
    fragmentId: num(o.fragment_id),
    createdAt: num(o.created_at),
  };
}

export async function cropOf(c: Contracts, farmer: string, batchId: number) {
  try {
    const [found, b] = await c.farmer.find_batch(farmer, batchId);
    if (found) return { cropName: b.crop_name as string, location: b.farm_city_location as string };
  } catch {
    /* ignore */
  }
  return { cropName: `Batch #${batchId}`, location: "" };
}

// ------------------------------------------------------------------- farmer
export interface NewBatch {
  cropName: string;
  cropType: string;
  quantity: number;
  expectedPrice: number;
  location: string;
  harvestDate: string;
}

export async function fetchBatches(c: Contracts): Promise<FarmBatch[]> {
  const raw = await c.farmer.get_all_batches(); // msg.sender = the connected wallet
  return Promise.all(
    raw.map(async (b: any) => {
      const id = num(b.batch_id);
      const rootFragmentId = num(await c.farmer.batch_root_fragment(id));
      const root = await c.tracker.getFragment(rootFragmentId);
      return {
        id,
        cropName: b.crop_name,
        cropType: b.typeof_crop,
        location: b.farm_city_location,
        harvestDate: b.harvest_date,
        expectedPrice: num(b.expected_p_kg_price),
        left: num(b.quantity),
        total: num(root.size),
        rootFragmentId,
      };
    }),
  );
}

export async function createBatch(c: Contracts, b: NewBatch): Promise<number> {
  const rc = await send(
    c.farmer.create_batch(b.cropName, b.quantity, b.expectedPrice, b.location, b.harvestDate, b.cropType),
  );
  return eventNum(c.farmer, rc, "batchregistered", "batch_id") ?? 0;
}

export async function deleteBatch(c: Contracts, batchId: number) {
  await send(c.farmer.delete_recent_batch(batchId));
}

/** returns the offer id and whether the distributor's auto-accept delivered it at once */
export async function offerToDistributor(
  c: Contracts,
  batchId: number,
  quantity: number,
  distributor: string,
  price: number,
): Promise<{ offerId: number; delivered: boolean }> {
  const rc = await send(c.farmer.offer_batch(batchId, quantity, distributor, price));
  return {
    offerId: eventNum(c.farmer, rc, "batchoffered", "offer_id") ?? 0,
    delivered: eventNum(c.farmer, rc, "batchsent", "fragment_id") !== null,
  };
}

export async function fetchFarmerOffers(c: Contracts, farmer: string): Promise<FarmerOffer[]> {
  return (await c.farmer.get_offers_by_farmer(farmer)).map(mapFarmerOffer);
}

export async function cancelFarmerOffer(c: Contracts, offerId: number) {
  await send(c.farmer.cancel_offer(offerId));
}

/** does `distributor` accept offers from `farmer` without asking? */
export async function trustsFarmer(c: Contracts, distributor: string, farmer: string): Promise<boolean> {
  return c.farmer.auto_accept(distributor, farmer);
}

// -------------------------------------------------------------- distributor
export async function fetchIncomingOffers(c: Contracts, distributor: string): Promise<FarmerOffer[]> {
  return (await c.farmer.get_offers_for_distributor(distributor)).map(mapFarmerOffer);
}

export async function acceptFarmerOffer(c: Contracts, offerId: number) {
  await send(c.farmer.accept_offer(offerId));
}

export async function rejectFarmerOffer(c: Contracts, offerId: number) {
  await send(c.farmer.reject_offer(offerId));
}

export async function setTrustedFarmer(c: Contracts, farmer: string, allowed: boolean) {
  await send(c.farmer.set_auto_accept(farmer, allowed));
}

/** stock the distributor received (accepted offers) and still holds */
export async function fetchHoldings(c: Contracts, distributor: string): Promise<Holding[]> {
  const accepted = (await fetchIncomingOffers(c, distributor)).filter((o) => o.status === "accepted" && o.fragmentId > 0);
  const rows = await Promise.all(
    accepted.map(async (o): Promise<Holding | null> => {
      const f = mapFragment(await c.tracker.getFragment(o.fragmentId));
      if (!sameAddr(f.owner, distributor)) return null; // handed on elsewhere
      const crop = await cropOf(c, o.farmer, o.batchId);
      return {
        fragmentId: f.id,
        batchId: o.batchId,
        cropName: crop.cropName,
        location: crop.location,
        farmer: o.farmer,
        received: f.size,
        available: f.isFinal ? 0 : f.size - f.allocated,
        paidPrice: o.price,
        receivedAt: o.createdAt,
      };
    }),
  );
  return rows.filter((r): r is Holding => r !== null);
}

export async function offerToRetailer(
  c: Contracts,
  fragmentId: number,
  quantity: number,
  shop: string,
  price: number,
): Promise<{ offerId: number; delivered: boolean }> {
  const rc = await send(c.distributor.offer_batch(fragmentId, quantity, shop, price));
  return {
    offerId: eventNum(c.distributor, rc, "batchoffered", "offer_id") ?? 0,
    delivered: eventNum(c.distributor, rc, "batchforwarded", "fragment_id") !== null,
  };
}

export async function fetchOutgoingOffers(c: Contracts, sender: string): Promise<RetailerOffer[]> {
  return (await c.distributor.get_offers_by_sender(sender)).map(mapRetailerOffer);
}

export async function cancelRetailerOffer(c: Contracts, offerId: number) {
  await send(c.distributor.cancel_offer(offerId));
}

// ----------------------------------------------------------------- retailer
export async function shopOwner(c: Contracts, shop: string): Promise<string> {
  return c.shop(shop).owner();
}

/** Create the caller's own shop (a Retailer contract) and return its address. */
export async function deployShop(c: Contracts): Promise<string> {
  const factory = new ContractFactory(retailerAbi, retailerBytecode.bytecode, c.runner as Signer);
  const contract = await factory.deploy(c.addresses.tracker, c.addresses.distributor);
  await contract.waitForDeployment();
  return contract.getAddress();
}

export async function fetchShopOffers(c: Contracts, shop: string): Promise<RetailerOffer[]> {
  return (await c.distributor.get_offers_for_retailer(shop)).map(mapRetailerOffer);
}

export async function acceptRetailerOffer(c: Contracts, offerId: number) {
  await send(c.distributor.accept_offer(offerId));
}

export async function rejectRetailerOffer(c: Contracts, offerId: number) {
  await send(c.distributor.reject_offer(offerId));
}

export async function trustsDistributor(c: Contracts, shop: string, sender: string): Promise<boolean> {
  return c.distributor.auto_accept(shop, sender);
}

export async function setTrustedDistributor(c: Contracts, shop: string, sender: string, allowed: boolean) {
  await send(c.distributor.set_auto_accept(shop, sender, allowed));
}

export async function fetchInventory(c: Contracts, shop: string): Promise<ShelfItem[]> {
  const items = await c.shop(shop).get_all_inventory();
  return Promise.all(
    items.map(async (it: any): Promise<ShelfItem> => {
      const f = await c.tracker.getFragment(it.fragmentId);
      const crop = await cropOf(c, f.farmer, num(it.batchId));
      return {
        fragmentId: num(it.fragmentId),
        batchId: num(it.batchId),
        quantity: num(it.quantity),
        distributor: it.distributor,
        price: num(it.price),
        status: shelfStatus(num(it.status)),
        receivedAt: num(it.receivedTimestamp),
        ...crop,
      };
    }),
  );
}

export async function setShelfPrice(c: Contracts, shop: string, fragmentId: number, price: number) {
  await send(c.shop(shop).set_price(fragmentId, price));
}

export async function markFinal(c: Contracts, shop: string, fragmentId: number) {
  await send(c.shop(shop).mark_as_final(fragmentId));
}

export async function reportDamaged(c: Contracts, shop: string, fragmentId: number, reason: string) {
  await send(c.shop(shop).report_damaged(fragmentId, reason));
}

// -------------------------------------------------------- trace / consumer
/** Everything about one product, in one call (works with a read-only provider too). */
export async function fetchProduct(c: Contracts, fragmentId: number): Promise<Product> {
  const d = await c.viewer.getProductDetails(fragmentId);
  const fragment = mapFragment(d.fragment);
  const retail = {
    atRetailer: d.retail.atRetailer as boolean,
    retailer: d.retail.retailer as string,
    distributor: d.retail.distributor as string,
    status: shelfStatus(num(d.retail.status)),
    price: num(d.retail.price),
    receivedAt: num(d.retail.receivedTimestamp),
  };

  // lineage is [fragment, parent, ..., root]: flip it so the journey reads farm -> shop
  const lineage = [...d.lineage].map(mapFragment).reverse();
  const prices = [...d.hopPrices].map(num).reverse();
  const journey: JourneyStep[] = lineage.map((f, i) => {
    let kind: JourneyStep["kind"] = "handler";
    if (i === 0) kind = "farm";
    else if (retail.atRetailer && i === lineage.length - 1 && sameAddr(f.owner, retail.retailer)) kind = "retailer";
    else if (i === 1) kind = "distributor";
    return {
      kind,
      fragmentId: f.id,
      holder: i === 0 ? f.farmer : f.owner,
      size: f.size,
      date: f.createdAt,
      price: prices[i] ?? 0,
    };
  });

  return {
    fragment,
    unallocated: num(d.unallocated),
    journey,
    custody: [...d.custody].map((x: any) => ({ holder: x.holder, timestamp: num(x.timestamp) })),
    origin: {
      found: d.origin.found,
      farmer: d.origin.farmer,
      cropName: d.origin.cropName,
      cropType: d.origin.cropType,
      farmLocation: d.origin.farmLocation,
      harvestDate: d.origin.harvestDate,
      expectedPricePerKg: num(d.origin.expectedPricePerKg),
    },
    retail,
  };
}

/** the numbers printed on a pack's label (and carried by its QR link) */
export async function fetchLabel(c: Contracts, fragmentId: number) {
  const f = mapFragment(await c.tracker.getFragment(fragmentId));
  return { id: f.id, batchId: f.batchId, offset: f.offset, size: f.size };
}

export async function verifyLabel(
  c: Contracts,
  fragmentId: number,
  batchId: number,
  offset: number,
  size: number,
): Promise<boolean> {
  return c.viewer.verifyLabel(fragmentId, batchId, offset, size);
}

// ----------------------------------------------------------- stakeholders
export interface Partner {
  address: string;
  name: string;
  role: "farmer" | "distributor" | "retailer";
  offers: number;
  kg: number; // kg actually handed over (accepted offers)
  lastAt: number;
}

function foldPartners(
  rows: { address: string; accepted: boolean; kg: number; at: number }[],
  role: Partner["role"],
): Omit<Partner, "name">[] {
  const map = new Map<string, Omit<Partner, "name">>();
  for (const r of rows) {
    const key = r.address.toLowerCase();
    const p = map.get(key) ?? { address: r.address, role, offers: 0, kg: 0, lastAt: 0 };
    p.offers += 1;
    if (r.accepted) p.kg += r.kg;
    p.lastAt = Math.max(p.lastAt, r.at);
    map.set(key, p);
  }
  return [...map.values()];
}

/** the people/shops this wallet has traded (or tried to trade) with */
export async function fetchPartners(
  c: Contracts,
  account: string,
  role: "farmer" | "distributor" | "retailer",
  shop?: string,
): Promise<Partner[]> {
  let found: Omit<Partner, "name">[] = [];
  if (role === "farmer") {
    const offers = await fetchFarmerOffers(c, account);
    found = foldPartners(
      offers.map((o) => ({ address: o.distributor, accepted: o.status === "accepted", kg: o.quantity, at: o.createdAt })),
      "distributor",
    );
  } else if (role === "distributor") {
    const [inc, out] = await Promise.all([fetchIncomingOffers(c, account), fetchOutgoingOffers(c, account)]);
    found = [
      ...foldPartners(
        inc.map((o) => ({ address: o.farmer, accepted: o.status === "accepted", kg: o.quantity, at: o.createdAt })),
        "farmer",
      ),
      ...foldPartners(
        out.map((o) => ({ address: o.retailer, accepted: o.status === "accepted", kg: o.quantity, at: o.createdAt })),
        "retailer",
      ),
    ];
  } else if (shop) {
    const offers = await fetchShopOffers(c, shop);
    found = foldPartners(
      offers.map((o) => ({ address: o.sender, accepted: o.status === "accepted", kg: o.quantity, at: o.createdAt })),
      "distributor",
    );
  }
  const named = await Promise.all(found.map(async (p) => ({ ...p, name: await nameOf(c, p.address) })));
  return named.sort((a, b) => b.lastAt - a.lastAt);
}

export { makeContracts };
