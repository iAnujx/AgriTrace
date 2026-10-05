import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { QRCodeSVG } from "qrcode.react";
import { AlertTriangle, BadgeDollarSign, Check, CheckCircle2, Loader2, Package, QrCode, Route as RouteIcon, ShieldCheck, Store, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import DashboardLayout from "@/components/DashboardLayout";
import { buildTraceLink } from "@/components/chain/ProductJourney";
import { Addr, Empty, ErrorNote, Loading, OfferBadge, ProfileCard, ShelfBadge, Stat, fmtDate, inr, useTx } from "@/components/chain/ui";
import { useAsync } from "@/components/chain/useAsync";
import { WalletGate, useReady } from "@/components/chain/WalletGate";
import {
  acceptRetailerOffer,
  deployShop,
  fetchInventory,
  fetchLabel,
  fetchShopOffers,
  markFinal,
  rejectRetailerOffer,
  reportDamaged,
  sameAddr,
  setShelfPrice,
  setTrustedDistributor,
  shopOwner,
  trustsDistributor,
} from "@/chain/api";
import type { Contracts } from "@/chain/contracts";
import { ADDRESSES, isAddress } from "@/chain/config";

// ---------------------------------------------------------------- which shop is mine?
function useShop(c: Contracts, account: string) {
  const key = `shop:${account.toLowerCase()}`;
  const [shop, setShop] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let live = true;
    setChecking(true);
    (async () => {
      const candidates = [localStorage.getItem(key), ADDRESSES.retailer].filter(isAddress);
      for (const a of candidates) {
        const owner = await shopOwner(c, a).catch(() => null);
        if (live && sameAddr(owner, account)) {
          setShop(a);
          return;
        }
      }
      if (live) setShop(null);
    })().finally(() => live && setChecking(false));
    return () => {
      live = false;
    };
  }, [c, account, key]);

  const adopt = useCallback(
    async (address: string) => {
      const owner = await shopOwner(c, address).catch(() => {
        throw new Error("That address is not a shop contract.");
      });
      if (!sameAddr(owner, account)) throw new Error("This wallet is not the owner of that shop.");
      localStorage.setItem(key, address);
      setShop(address);
    },
    [c, account, key],
  );

  return { shop, checking, adopt };
}

function ShopSetup({ c, adopt }: { c: Contracts; adopt: (a: string) => Promise<void> }) {
  const { busy, run } = useTx();
  const [address, setAddress] = useState("");
  return (
    <Card className="card-modern mx-auto max-w-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Store className="h-5 w-5 text-primary" />
          Set up your shop
        </CardTitle>
        <CardDescription>
          A shop is your own contract on the blockchain. Only you can accept stock into it and mark it ready for sale.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button className="btn-primary w-full" disabled={busy} onClick={() => void run("Create shop", async () => adopt(await deployShop(c)))}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create my shop
        </Button>
        <div className="space-y-2">
          <Label htmlFor="shop-addr">…or use a shop you already created</Label>
          <div className="flex gap-2">
            <Input id="shop-addr" value={address} placeholder="0x…" onChange={(e) => setAddress(e.target.value.trim())} />
            <Button variant="outline" disabled={busy || !isAddress(address)} onClick={() => void run("Use shop", () => adopt(address))}>
              Use
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------- small dialogs
function PriceDialog({ current, onSave }: { current: number; onSave: (price: number) => Promise<unknown> }) {
  const { busy, run } = useTx();
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(String(current));
  const n = Number(price);
  const bad = !Number.isInteger(n) || n < 0;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <BadgeDollarSign className="mr-1 h-4 w-4" />
          Price
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Shelf price</DialogTitle>
          <DialogDescription>The price per kg customers see for this product.</DialogDescription>
        </DialogHeader>
        <Input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
        <Button className="btn-primary" disabled={busy || bad} onClick={() => void run("Set price", () => onSave(n), () => setOpen(false))}>
          Save price
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function DamagedDialog({ onSave }: { onSave: (reason: string) => Promise<unknown> }) {
  const { busy, run } = useTx();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title="Report damaged">
          <AlertTriangle className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report damaged stock</DialogTitle>
          <DialogDescription>The reason is stored on the blockchain. This cannot be undone.</DialogDescription>
        </DialogHeader>
        <Input value={reason} placeholder="e.g. Water damage in transit" onChange={(e) => setReason(e.target.value)} />
        <Button className="btn-primary" disabled={busy || !reason.trim()} onClick={() => void run("Report damaged", () => onSave(reason.trim()), () => setOpen(false))}>
          Report damaged
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function QrDialog({ c, fragmentId }: { c: Contracts; fragmentId: number }) {
  const [open, setOpen] = useState(false);
  const { data, loading, error } = useAsync(() => (open ? fetchLabel(c, fragmentId) : Promise.resolve(undefined)), [open, c, fragmentId]);
  const link = data ? buildTraceLink(window.location.origin, data) : "";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" title="QR label">
          <QrCode className="mr-1 h-4 w-4" />
          QR
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Label for product #{fragmentId}</DialogTitle>
          <DialogDescription>
            Print this QR on the pack. Customers scan it to see the journey, and the page checks the label against the blockchain.
          </DialogDescription>
        </DialogHeader>
        <ErrorNote message={error} />
        {loading || !data ? (
          <Loading text="Preparing label…" />
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-xl bg-white p-4">
              <QRCodeSVG value={link} size={220} />
            </div>
            <p className="break-all text-center text-xs text-muted-foreground">{link}</p>
            <Button variant="outline" onClick={() => void navigator.clipboard?.writeText(link)}>
              Copy link
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// --------------------------------------------------------------------------- the shop
function ShopBody({ c, shop }: { c: Contracts; shop: string }) {
  const { busy, run } = useTx();
  const { data, loading, error, reload } = useAsync(async () => {
    const [offers, inventory] = await Promise.all([fetchShopOffers(c, shop), fetchInventory(c, shop)]);
    const senders = [...new Set(offers.map((o) => o.sender))];
    const trust = await Promise.all(senders.map((s) => trustsDistributor(c, shop, s)));
    return { offers, inventory, senders, trust };
  }, [c, shop]);

  const offers = data?.offers ?? [];
  const inventory = data?.inventory ?? [];
  const kg = (status: string) => inventory.filter((i) => i.status === status).reduce((s, i) => s + i.quantity, 0);
  const trustOf = (s: string) => data?.trust[data.senders.indexOf(s)] ?? false;

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Your shop contract: <Addr a={shop} />
      </p>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Offers waiting" value={offers.filter((o) => o.status === "pending").length} icon={<Package className="h-8 w-8" />} />
        <Stat label="On shelf (kg)" value={kg("on_shelf")} icon={<Store className="h-8 w-8" />} />
        <Stat label="Ready for sale (kg)" value={kg("finalized")} icon={<CheckCircle2 className="h-8 w-8" />} />
        <Stat label="Damaged (kg)" value={kg("damaged")} icon={<AlertTriangle className="h-8 w-8" />} />
      </div>
      <ErrorNote message={error} />

      <Card className="card-modern">
        <CardHeader>
          <CardTitle>Offers from distributors</CardTitle>
          <CardDescription>Accepting puts the stock on your shelf automatically. Rejecting leaves it with the distributor.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <Loading />
          ) : offers.length === 0 ? (
            <Empty>No offers yet. Share your shop address with a distributor: {shop}</Empty>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Distributor</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...offers].reverse().map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>{o.id}</TableCell>
                      <TableCell>
                        <Addr a={o.sender} />
                      </TableCell>
                      <TableCell>{o.quantity} kg</TableCell>
                      <TableCell>{inr(o.price)} / kg</TableCell>
                      <TableCell>{inr(o.price * o.quantity)}</TableCell>
                      <TableCell>{fmtDate(o.createdAt)}</TableCell>
                      <TableCell>
                        <OfferBadge status={o.status} />
                      </TableCell>
                      <TableCell className="space-x-2 text-right">
                        {o.status === "pending" && (
                          <>
                            <Button size="sm" className="btn-primary" disabled={busy} onClick={() => void run("Accept offer", () => acceptRetailerOffer(c, o.id), reload)}>
                              <Check className="mr-1 h-4 w-4" />
                              Accept
                            </Button>
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => void run("Reject offer", () => rejectRetailerOffer(c, o.id), reload)}>
                              <X className="mr-1 h-4 w-4" />
                              Reject
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {(data?.senders.length ?? 0) > 0 && (
        <Card className="card-modern">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Trusted distributors
            </CardTitle>
            <CardDescription>Switch a distributor on and their offers go straight onto your shelf. Off by default.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data?.senders.map((s) => (
              <div key={s} className="flex items-center justify-between rounded-md border p-3">
                <Addr a={s} />
                <Switch checked={trustOf(s)} disabled={busy} onCheckedChange={(v) => void run(v ? "Trust distributor" : "Stop trusting distributor", () => setTrustedDistributor(c, shop, s, v), reload)} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="card-modern">
        <CardHeader>
          <CardTitle>Your inventory</CardTitle>
          <CardDescription>Set your price, then mark a product ready for sale. After that it can never be split again.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <Loading />
          ) : inventory.length === 0 ? (
            <Empty>Nothing on your shelf yet.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Crop</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventory.map((i) => (
                    <TableRow key={i.fragmentId}>
                      <TableCell>#{i.fragmentId}</TableCell>
                      <TableCell>
                        <p className="font-medium">{i.cropName}</p>
                        <p className="text-xs text-muted-foreground">{i.location}</p>
                      </TableCell>
                      <TableCell>{i.quantity} kg</TableCell>
                      <TableCell>{inr(i.price)} / kg</TableCell>
                      <TableCell>
                        <Addr a={i.distributor} />
                      </TableCell>
                      <TableCell>{fmtDate(i.receivedAt)}</TableCell>
                      <TableCell>
                        <ShelfBadge status={i.status} />
                      </TableCell>
                      <TableCell className="space-x-2 text-right">
                        {i.status === "on_shelf" && (
                          <>
                            <PriceDialog current={i.price} onSave={async (p) => { await setShelfPrice(c, shop, i.fragmentId, p); reload(); }} />
                            <Button size="sm" className="btn-primary" disabled={busy} onClick={() => void run("Mark ready for sale", () => markFinal(c, shop, i.fragmentId), reload)}>
                              Ready for sale
                            </Button>
                            <DamagedDialog onSave={async (r) => { await reportDamaged(c, shop, i.fragmentId, r); reload(); }} />
                          </>
                        )}
                        {i.status === "finalized" && <QrDialog c={c} fragmentId={i.fragmentId} />}
                        <Button asChild size="sm" variant="ghost" title="Trace">
                          <Link to="/traceability" search={{ f: i.fragmentId }}>
                            <RouteIcon className="h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function RetailerBody() {
  const { c, account } = useReady();
  const { shop, checking, adopt } = useShop(c, account);
  if (checking) return <Loading text="Looking for your shop…" />;
  if (!shop) return <ShopSetup c={c} adopt={adopt} />;
  return <ShopBody c={c} shop={shop} />;
}

const RetailerDashboard = () => (
  <DashboardLayout title="Retailer Dashboard">
    <div className="space-y-6">
      <ProfileCard
        storageKey="retailer-profile"
        title="Shop profile"
        description="Your store information (saved in this browser)"
        icon={<Store className="h-5 w-5 text-primary" />}
        fields={[
          { key: "name", label: "Store name", placeholder: "Your store" },
          { key: "location", label: "Location", placeholder: "City" },
          { key: "contactNumber", label: "Contact number", placeholder: "+91…" },
          { key: "license", label: "License number", placeholder: "FSSAI…" },
        ]}
      />
      <WalletGate>
        <RetailerBody />
      </WalletGate>
    </div>
  </DashboardLayout>
);

export default RetailerDashboard;
