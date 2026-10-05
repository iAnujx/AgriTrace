// Wallet + blockchain state for the whole app.
// `useChain()` gives the connected account, the network status and ready-to-use contracts.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { BrowserProvider, JsonRpcProvider, getAddress, type Eip1193Provider } from "ethers";
import { ADDRESSES, CHAIN_ID, CHAIN_NAME, EXPLORER_URL, RPC_URL, missingConfig } from "@/chain/config";
import { makeContracts, type Contracts } from "@/chain/contracts";
import { endSession, getSession, homeFor, roleOfWallet, startSession } from "@/lib/session";

interface Ethereum extends Eip1193Provider {
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

const getEthereum = (): Ethereum | undefined =>
  typeof window === "undefined" ? undefined : (window as unknown as { ethereum?: Ethereum }).ethereum;

export interface ChainState {
  hasWallet: boolean;
  account: string | null;
  chainId: number | null;
  wrongNetwork: boolean;
  /** names of missing .env variables (empty = configured) */
  missing: string[];
  /** wallet-connected contracts; null until a wallet is connected on the right network */
  contracts: Contracts | null;
  /** read-only contracts (public RPC, or the wallet): usable without logging in */
  read: Contracts | null;
  connect: () => Promise<void>;
  switchNetwork: () => Promise<void>;
}

const ChainContext = createContext<ChainState | undefined>(undefined);

export const ContractProvider = ({ children }: { children: ReactNode }) => {
  const [hasWallet, setHasWallet] = useState(false);
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [contracts, setContracts] = useState<Contracts | null>(null);

  const missing = useMemo(() => missingConfig(), []);
  const wrongNetwork = chainId !== null && chainId !== CHAIN_ID;

  const refresh = useCallback(async () => {
    const eth = getEthereum();
    if (!eth) return;
    const provider = new BrowserProvider(eth);
    const accounts = (await eth.request({ method: "eth_accounts" })) as string[];
    const net = await provider.getNetwork();
    const id = Number(net.chainId);
    setChainId(id);

    const first = accounts[0];
    if (!first) {
      setAccount(null);
      setContracts(null);
      return;
    }
    const addr = getAddress(first);
    setAccount(addr);

    // keep the login session in step with the wallet that is actually connected
    const session = getSession();
    if (session && session.address.toLowerCase() !== addr.toLowerCase()) {
      if (session.address) {
        // the user switched accounts inside MetaMask: follow that wallet's own role, or sign out if it is new
        const role = await roleOfWallet(addr);
        if (role) {
          startSession({ ...session, address: addr, role, method: "wallet" });
          if (role !== session.role) window.location.assign(homeFor(role));
        } else {
          await endSession();
          window.location.assign("/login");
          return;
        }
      } else {
        startSession({ ...session, address: addr });
      }
    }

    if (id === CHAIN_ID && missing.length === 0) {
      const signer = await provider.getSigner(addr);
      setContracts(makeContracts(ADDRESSES, signer));
    } else {
      setContracts(null);
    }
  }, [missing]);

  useEffect(() => {
    const eth = getEthereum();
    setHasWallet(!!eth);
    if (!eth) return;
    void refresh();
    const onChange = () => void refresh();
    eth.on?.("accountsChanged", onChange);
    eth.on?.("chainChanged", onChange);
    return () => {
      eth.removeListener?.("accountsChanged", onChange);
      eth.removeListener?.("chainChanged", onChange);
    };
  }, [refresh]);

  const connect = useCallback(async () => {
    const eth = getEthereum();
    if (!eth) throw new Error("No wallet found. Install MetaMask to continue.");
    await eth.request({ method: "eth_requestAccounts" });
    await refresh();
  }, [refresh]);

  const switchNetwork = useCallback(async () => {
    const eth = getEthereum();
    if (!eth) throw new Error("No wallet found.");
    const hex = "0x" + CHAIN_ID.toString(16);
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
    } catch (e) {
      // 4902 = the wallet does not know this network yet
      if ((e as { code?: number }).code === 4902 && RPC_URL) {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: hex,
              chainName: CHAIN_NAME,
              rpcUrls: [RPC_URL],
              nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
              blockExplorerUrls: EXPLORER_URL ? [EXPLORER_URL] : undefined,
            },
          ],
        });
      } else {
        throw e;
      }
    }
    await refresh();
  }, [refresh]);

  // reads that need no wallet (consumer / QR page): public RPC first, wallet as fallback
  const read = useMemo(() => {
    if (missing.length > 0) return null;
    if (RPC_URL) return makeContracts(ADDRESSES, new JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: true }));
    return contracts;
  }, [missing, contracts]);

  const value: ChainState = {
    hasWallet,
    account,
    chainId,
    wrongNetwork,
    missing,
    contracts,
    read,
    connect,
    switchNetwork,
  };
  return <ChainContext.Provider value={value}>{children}</ChainContext.Provider>;
};

export const useChain = (): ChainState => {
  const ctx = useContext(ChainContext);
  if (!ctx) throw new Error("useChain must be used within a ContractProvider");
  return ctx;
};
