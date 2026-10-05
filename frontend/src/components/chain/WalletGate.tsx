import { createContext, useContext, useState, type ReactNode } from "react";
import { Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { useChain } from "@/ContractContext";
import { CHAIN_NAME } from "@/chain/config";
import { errorMessage } from "@/chain/api";
import type { Contracts } from "@/chain/contracts";

interface Ready {
  /** wallet-connected contracts (can send transactions) */
  c: Contracts;
  account: string;
}
const ReadyContext = createContext<Ready | null>(null);

/** Inside a <WalletGate>, the connected account and contracts (never null). */
export function useReady(): Ready {
  const r = useContext(ReadyContext);
  if (!r) throw new Error("useReady must be used inside <WalletGate>");
  return r;
}

function Notice({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Card className="card-modern mx-auto max-w-lg">
      <CardContent className="space-y-4 p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <Wallet className="h-7 w-7 text-primary" />
        </div>
        <CardTitle>{title}</CardTitle>
        <CardDescription className="text-base">{children}</CardDescription>
        {action}
      </CardContent>
    </Card>
  );
}

/** Shows what is missing (config / wallet / network) until blockchain actions can work. */
export function WalletGate({ children }: { children: ReactNode }) {
  const chain = useChain();
  const [busy, setBusy] = useState(false);

  const attempt = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (chain.missing.length > 0) {
    return (
      <Notice title="Contracts are not configured">
        Add these to your <code>.env</code> file (see <code>.env.example</code>) and restart:
        <span className="mt-2 block font-mono text-xs">{chain.missing.join(", ")}</span>
      </Notice>
    );
  }
  if (!chain.hasWallet) {
    return <Notice title="Wallet needed">Install MetaMask (or another browser wallet) to use the blockchain features.</Notice>;
  }
  if (!chain.account) {
    return (
      <Notice
        title="Connect your wallet"
        action={
          <Button className="btn-primary" disabled={busy} onClick={() => void attempt(chain.connect)}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Connect wallet
          </Button>
        }
      >
        Your wallet address is your identity in the supply chain.
      </Notice>
    );
  }
  if (chain.wrongNetwork || !chain.contracts) {
    return (
      <Notice
        title={`Switch to ${CHAIN_NAME}`}
        action={
          <Button className="btn-primary" disabled={busy} onClick={() => void attempt(chain.switchNetwork)}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Switch network
          </Button>
        }
      >
        The contracts live on {CHAIN_NAME}. Your wallet is on a different network.
      </Notice>
    );
  }
  return <ReadyContext.Provider value={{ c: chain.contracts, account: chain.account }}>{children}</ReadyContext.Provider>;
}
