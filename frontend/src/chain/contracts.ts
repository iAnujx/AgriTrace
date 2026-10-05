import { Contract, type ContractRunner, type Interface } from "ethers";
import farmerAbi from "@/ABI/Farmer.json";
import distributorAbi from "@/ABI/distributor.json";
import retailerAbi from "@/ABI/Retailer.json";
import trackerAbi from "@/ABI/CropTracker.json";
import viewerAbi from "@/ABI/SupplyChainViewer.json";
import type { Addresses } from "./config";

export { farmerAbi, distributorAbi, retailerAbi, trackerAbi, viewerAbi };

// Every contract method returns a promise (reads give data, writes give a transaction).
// Listing the methods we use keeps the rest of the app type-safe and documents the API.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fn = (...args: any[]) => Promise<any>;
interface Base {
  interface: Interface;
  getAddress(): Promise<string>;
}

export interface FarmerContract extends Base {
  create_batch: Fn;
  get_all_batches: Fn;
  batch_root_fragment: Fn;
  delete_recent_batch: Fn;
  find_batch: Fn;
  farmer_profile_name: Fn;
  offer_batch: Fn;
  accept_offer: Fn;
  reject_offer: Fn;
  cancel_offer: Fn;
  set_auto_accept: Fn;
  auto_accept: Fn;
  get_offers_by_farmer: Fn;
  get_offers_for_distributor: Fn;
}

export interface DistributorContract extends Base {
  offer_batch: Fn;
  accept_offer: Fn;
  reject_offer: Fn;
  cancel_offer: Fn;
  set_auto_accept: Fn;
  auto_accept: Fn;
  get_offers_by_sender: Fn;
  get_offers_for_retailer: Fn;
}

export interface TrackerContract extends Base {
  getFragment: Fn;
}

export interface ViewerContract extends Base {
  getProductDetails: Fn;
  verifyLabel: Fn;
}

export interface ShopContract extends Base {
  owner: Fn;
  get_all_inventory: Fn;
  set_price: Fn;
  mark_as_final: Fn;
  report_damaged: Fn;
}

export interface Contracts {
  farmer: FarmerContract;
  distributor: DistributorContract;
  tracker: TrackerContract;
  viewer: ViewerContract;
  addresses: Addresses;
  runner: ContractRunner;
  /** a Retailer contract ("shop") at the given address */
  shop: (address: string) => ShopContract;
}

export function makeContracts(addresses: Addresses, runner: ContractRunner): Contracts {
  const make = <T>(address: string, abi: unknown) => new Contract(address, abi as never, runner) as unknown as T;
  return {
    farmer: make<FarmerContract>(addresses.farmer, farmerAbi),
    distributor: make<DistributorContract>(addresses.distributor, distributorAbi),
    tracker: make<TrackerContract>(addresses.tracker, trackerAbi),
    viewer: make<ViewerContract>(addresses.viewer, viewerAbi),
    addresses,
    runner,
    shop: (address: string) => make<ShopContract>(address, retailerAbi),
  };
}
