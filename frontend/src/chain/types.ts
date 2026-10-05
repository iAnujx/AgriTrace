export type OfferStatus = "pending" | "accepted" | "rejected" | "cancelled";
export type ShelfStatus = "in_transit" | "on_shelf" | "finalized" | "damaged";

export interface FarmBatch {
  id: number;
  cropName: string;
  cropType: string;
  location: string;
  harvestDate: string;
  expectedPrice: number; // per kg
  left: number; // kg the farmer still holds
  total: number; // kg harvested
  rootFragmentId: number;
}

export interface FarmerOffer {
  id: number;
  farmer: string;
  distributor: string;
  batchId: number;
  quantity: number;
  price: number;
  status: OfferStatus;
  fragmentId: number;
  createdAt: number; // unix seconds
}

export interface RetailerOffer {
  id: number;
  sender: string;
  retailer: string;
  parentFragmentId: number;
  batchId: number;
  quantity: number;
  price: number;
  status: OfferStatus;
  fragmentId: number;
  createdAt: number;
}

export interface Holding {
  fragmentId: number;
  batchId: number;
  cropName: string;
  location: string;
  farmer: string;
  received: number; // kg
  available: number; // kg not yet offered/sold on
  paidPrice: number; // per kg, what the distributor paid the farmer
  receivedAt: number;
}

export interface ShelfItem {
  fragmentId: number;
  batchId: number;
  quantity: number;
  distributor: string;
  price: number;
  status: ShelfStatus;
  receivedAt: number;
  cropName: string;
  location: string;
}

export interface FragmentInfo {
  id: number;
  batchId: number;
  farmer: string;
  parentId: number;
  offset: number;
  size: number;
  allocated: number;
  canSplit: boolean; // MF
  isFinal: boolean; // DF
  owner: string;
  createdAt: number;
}

export interface JourneyStep {
  kind: "farm" | "distributor" | "retailer" | "handler";
  fragmentId: number;
  holder: string;
  size: number;
  date: number;
  price: number; // per kg paid for this hop (0 = unknown / none)
}

export interface Product {
  fragment: FragmentInfo;
  unallocated: number;
  journey: JourneyStep[];
  custody: { holder: string; timestamp: number }[];
  origin: {
    found: boolean;
    farmer: string;
    cropName: string;
    cropType: string;
    farmLocation: string;
    harvestDate: string;
    expectedPricePerKg: number;
  };
  retail: {
    atRetailer: boolean;
    retailer: string;
    distributor: string;
    status: ShelfStatus;
    price: number;
    receivedAt: number;
  };
}
