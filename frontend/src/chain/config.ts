// All blockchain settings in one place. Fill them in `.env` (see `.env.example`).
interface Env {
  VITE_CHAIN_ID?: string;
  VITE_CHAIN_NAME?: string;
  VITE_RPC_URL?: string;
  VITE_EXPLORER_URL?: string;
  VITE_TRACKER_ADDRESS?: string;
  VITE_FARMER_ADDRESS?: string;
  VITE_DISTRIBUTOR_ADDRESS?: string;
  VITE_VIEWER_ADDRESS?: string;
  VITE_RETAILER_ADDRESS?: string;
}
const env = ((import.meta as unknown as { env?: Env }).env ?? {}) as Env;

export const CHAIN_ID = Number(env.VITE_CHAIN_ID || 11155111); // Sepolia
export const CHAIN_NAME = env.VITE_CHAIN_NAME || (CHAIN_ID === 11155111 ? "Sepolia" : `Chain ${CHAIN_ID}`);
// Public read-only RPC: lets the QR/trace page work for people with no wallet.
export const RPC_URL =
  env.VITE_RPC_URL || (CHAIN_ID === 11155111 ? "https://ethereum-sepolia-rpc.publicnode.com" : "");
export const EXPLORER_URL = env.VITE_EXPLORER_URL || (CHAIN_ID === 11155111 ? "https://sepolia.etherscan.io" : "");

export interface Addresses {
  tracker: string;
  farmer: string;
  distributor: string;
  viewer: string;
  /** default shop (Retailer contract). Retailers can also create their own from the UI. */
  retailer: string;
}

export const ADDRESSES: Addresses = {
  tracker: env.VITE_TRACKER_ADDRESS ?? "",
  farmer: env.VITE_FARMER_ADDRESS ?? "",
  distributor: env.VITE_DISTRIBUTOR_ADDRESS ?? "",
  viewer: env.VITE_VIEWER_ADDRESS ?? "",
  retailer: env.VITE_RETAILER_ADDRESS ?? "",
};

const ADDR = /^0x[0-9a-fA-F]{40}$/;
export const isAddress = (v: string | null | undefined): v is string => !!v && ADDR.test(v);

/** names of the .env variables that are still missing (tracker/farmer/distributor/viewer are required) */
export function missingConfig(a: Addresses = ADDRESSES): string[] {
  const need: [keyof Addresses, string][] = [
    ["tracker", "VITE_TRACKER_ADDRESS"],
    ["farmer", "VITE_FARMER_ADDRESS"],
    ["distributor", "VITE_DISTRIBUTOR_ADDRESS"],
    ["viewer", "VITE_VIEWER_ADDRESS"],
  ];
  return need.filter(([k]) => !isAddress(a[k])).map(([, name]) => name);
}

export const txUrl = (hash: string) => (EXPLORER_URL ? `${EXPLORER_URL}/tx/${hash}` : "");
export const addressUrl = (addr: string) => (EXPLORER_URL ? `${EXPLORER_URL}/address/${addr}` : "");
