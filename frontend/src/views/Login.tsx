import { useEffect, useState } from "react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowLeft,
  Leaf,
  Loader2,
  ShieldCheck,
  ShoppingBasket,
  Sprout,
  Store,
  Truck,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useNavigate } from "@/lib/router-compat";
import {
  getSession,
  homeFor,
  rememberRole,
  roleOfWallet,
  startSession,
  type Role,
} from "@/lib/session";
import { cn } from "@/lib/utils";

const ROLES: { id: Role; title: string; text: string; icon: typeof Leaf }[] = [
  { id: "farmer", title: "Farmer", text: "Register crops, get bids, track sales", icon: Leaf },
  {
    id: "distributor",
    title: "Distributor",
    text: "Buy crops, manage stock and dispatch",
    icon: Truck,
  },
  { id: "retailer", title: "Retailer", text: "Receive stock, set prices, sell", icon: Store },
  {
    id: "consumer",
    title: "Consumer",
    text: "Browse produce and verify its journey",
    icon: ShoppingBasket,
  },
];
const ethereum = () =>
  typeof window === "undefined"
    ? undefined
    : (
        window as unknown as {
          ethereum?: { request: (a: { method: string }) => Promise<string[]> };
        }
      ).ethereum;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * MetaMask is the only way in. The wallet address is the account:
 *  - a wallet we have seen before goes straight to the dashboard of the role it registered with;
 *  - a new wallet picks a role once, and that role is then fixed to the wallet.
 */
export default function Login() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [wallet, setWallet] = useState<string | null>(null); // set while a NEW wallet is choosing its role
  const [role, setRole] = useState<Role>("farmer");

  useEffect(() => {
    const mine = getSession();
    if (mine) navigate(homeFor(mine.role));
  }, [navigate]);

  const enter = (address: string, r: Role) => {
    startSession({ address, role: r, method: "wallet" });
    navigate(homeFor(r));
  };

  const connect = async () => {
    const eth = ethereum();
    if (!eth)
      return void toast.error(
        "MetaMask was not found. Install the MetaMask extension or app first.",
      );
    setBusy(true);
    try {
      const accounts = await eth.request({ method: "eth_requestAccounts" });
      const address = accounts[0];
      if (!address) throw new Error("No wallet account was shared.");
      const known = await roleOfWallet(address);
      if (known) {
        toast.success(`Welcome back. Opening your ${known} dashboard.`);
        enter(address, known); // returning wallet: straight to its own dashboard
      } else {
        setWallet(address); // new wallet: choose a role once
      }
    } catch (e) {
      toast.error(
        (e as { code?: number }).code === 4001
          ? "You cancelled the wallet request."
          : e instanceof Error
            ? e.message
            : "Could not connect the wallet.",
      );
    } finally {
      setBusy(false);
    }
  };

  const register = async () => {
    if (!wallet) return;
    setBusy(true);
    try {
      await rememberRole(wallet, role); // locks this wallet to this role from now on
      toast.success(`Registered as ${role}.`);
      enter(wallet, role);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen p-4">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-3xl border border-border/40 bg-card/85 shadow-xl backdrop-blur-md lg:grid-cols-[1.05fr_.95fr]">
          <section className="gradient-primary relative hidden min-h-[640px] overflow-hidden p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
            <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute -bottom-20 -left-16 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/15">
                <Sprout />
              </span>
              <span className="text-xl font-semibold">AgriTrace</span>
            </div>
            <div className="relative">
              <p className="mb-4 text-sm font-medium uppercase tracking-wide">
                Farm to table, verified
              </p>
              <h1 className="max-w-lg text-5xl font-semibold leading-tight">
                Every crop has a story worth trusting.
              </h1>
              <p className="mt-5 max-w-md text-primary-foreground/85">
                Your MetaMask wallet is your account. No passwords, nothing to remember.
              </p>
            </div>
            <p className="relative text-sm text-primary-foreground/75">
              Built for India's agricultural supply chain.
            </p>
          </section>

          <section className="p-6 sm:p-10">
            <div className="flex justify-end">
              <LanguageSwitcher />
            </div>
            <div className="mx-auto mt-2 max-w-md">
              {!wallet ? (
                <>
                  <h2 className="text-3xl font-semibold">Sign in with MetaMask</h2>
                  <p className="mt-2 text-muted-foreground">
                    Connect your wallet. If you have used it before you go straight to your own
                    dashboard. If it is new, you will choose a role once.
                  </p>
                  <Button
                    className="btn-primary mt-6 w-full py-6 text-lg"
                    disabled={busy}
                    onClick={() => void connect()}
                  >
                    {busy ? (
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : (
                      <Wallet className="mr-2 h-5 w-5" />
                    )}
                    {busy ? "Connecting…" : "Connect MetaMask"}
                  </Button>
                  <details className="mt-6 rounded-xl border border-border/60 p-3 text-sm text-muted-foreground">
                    <summary className="cursor-pointer font-medium text-foreground">
                      On your phone?
                    </summary>
                    <div className="mt-3 text-center">
                      <div className="mx-auto w-fit rounded-xl bg-white p-3">
                        <QRCodeSVG
                          value={`https://metamask.app.link/dapp/${typeof window === "undefined" ? "" : window.location.host}/login`}
                          size={140}
                          level="M"
                        />
                      </div>
                      <p className="mt-2">
                        Scan with your phone camera. It opens this site inside the MetaMask app.
                      </p>
                    </div>
                  </details>
                </>
              ) : (
                <>
                  <button
                    className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                    onClick={() => setWallet(null)}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Use a different wallet
                  </button>
                  <h2 className="text-3xl font-semibold">Choose your role</h2>
                  <p className="mt-2 text-muted-foreground">
                    New wallet <span className="font-mono">{short(wallet)}</span>. Pick the role
                    this wallet will use.
                  </p>
                  <div className="mt-5 grid grid-cols-2 gap-2">
                    {ROLES.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        aria-pressed={role === r.id}
                        onClick={() => setRole(r.id)}
                        className={cn(
                          "rounded-2xl border p-3 text-left transition-colors hover:border-primary/60",
                          role === r.id ? "border-primary bg-primary/10" : "border-border bg-card",
                        )}
                      >
                        <r.icon
                          className={cn(
                            "mb-1 h-5 w-5",
                            role === r.id ? "text-primary" : "text-muted-foreground",
                          )}
                        />
                        <p className="text-sm font-medium">{r.title}</p>
                        <p className="text-xs text-muted-foreground">{r.text}</p>
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 flex items-start gap-2 rounded-xl bg-muted p-3 text-xs text-muted-foreground">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    This wallet will always open the {role} dashboard. To act in another role, use
                    another wallet.
                  </p>
                  <Button
                    className="btn-primary mt-4 w-full"
                    disabled={busy}
                    onClick={() => void register()}
                  >
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Continue as {role}
                  </Button>
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
