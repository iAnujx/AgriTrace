import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Boxes, Check, Route as RouteIcon, Send, ShieldCheck, Store, Truck, X, ClipboardList } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CropNeedsPanel, MarketBoard, StockDetailsDialog, StockSummary, recordDispatch } from "@/components/extras/DistributorExtras";
import { SharedNotice } from "@/components/extras/SharedNotice";
import { listRecs, type StockInfo } from "@/lib/extras";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import DashboardLayout from "@/components/DashboardLayout";
import { OfferDialog } from "@/components/chain/OfferDialog";
import { Addr, Empty, ErrorNote, Loading, OfferBadge, ProfileCard, Stat, fmtDate, inr, useTx } from "@/components/chain/ui";
import { useAsync } from "@/components/chain/useAsync";
import { WalletGate, useReady } from "@/components/chain/WalletGate";
import {
  acceptFarmerOffer,
  cancelRetailerOffer,
  cropOf,
  fetchHoldings,
  fetchIncomingOffers,
  fetchOutgoingOffers,
  offerToRetailer,
  rejectFarmerOffer,
  setTrustedFarmer,
  trustsDistributor,
  trustsFarmer,
} from "@/chain/api";
import { ADDRESSES, isAddress } from "@/chain/config";

const SHOPS_KEY = "known-shops";
const loadShops = (): { label: string; address: string }[] => {
  try {
    return JSON.parse(localStorage.getItem(SHOPS_KEY) ?? "[]");
  } catch {
    return [];
  }
};
const rememberShop = (address: string) => {
  const all = loadShops();
  if (!all.some((s) => s.address.toLowerCase() === address.toLowerCase())) {
    localStorage.setItem(SHOPS_KEY, JSON.stringify([...all, { label: `Shop ${address.slice(0, 6)}…${address.slice(-4)}`, address }].slice(-5)));
  }
};

function DistributorBody() {
  const { c, account } = useReady();
  const { busy, run } = useTx();
  const [newFarmer, setNewFarmer] = useState("");

  const { data, loading, error, reload } = useAsync(async () => {
    const [incoming, holdings, outgoing] = await Promise.all([
      fetchIncomingOffers(c, account),
      fetchHoldings(c, account),
      fetchOutgoingOffers(c, account),
    ]);
    const farmers = [...new Set(incoming.map((o) => o.farmer))];
    const trust = await Promise.all(farmers.map((f) => trustsFarmer(c, account, f)));
    const crops: Record<string, string> = {};
    await Promise.all(
      incoming.map(async (o) => {
        crops[`${o.farmer}-${o.batchId}`] = (await cropOf(c, o.farmer, o.batchId)).cropName;
      }),
    );
    const stockRecs = await listRecs<StockInfo>("stock", { owner: account });
    return { incoming, holdings, outgoing, farmers, trust, crops, stockRecs };
  }, [c, account]);

  const stockRecs = data?.stockRecs ?? [];
  const recOf = (fragmentId: number) => stockRecs.find((r) => r.ref === String(fragmentId));
  const incoming = data?.incoming ?? [];
  const holdings = data?.holdings ?? [];
  const outgoing = data?.outgoing ?? [];
  const waiting = incoming.filter((o) => o.status === "pending");
  const stock = holdings.reduce((s, h) => s + h.available, 0);
  const toShopsPending = outgoing.filter((o) => o.status === "pending").reduce((s, o) => s + o.quantity, 0);
  const toShopsDone = outgoing.filter((o) => o.status === "accepted").reduce((s, o) => s + o.quantity, 0);
  const trustOf = (farmer: string) => data?.trust[data.farmers.indexOf(farmer)] ?? false;

  const shops = [
    ...(isAddress(ADDRESSES.retailer) ? [{ label: "Demo shop", address: ADDRESSES.retailer }] : []),
    ...loadShops(),
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Offers waiting for you" value={waiting.length} icon={<Boxes className="h-8 w-8" />} />
        <Stat label="Stock you hold (kg)" value={stock} icon={<Truck className="h-8 w-8" />} />
        <Stat label="Offered to shops (kg)" value={toShopsPending} icon={<Send className="h-8 w-8" />} />
        <Stat label="Delivered to shops (kg)" value={toShopsDone} icon={<Store className="h-8 w-8" />} />
      </div>
      <StockSummary holdings={holdings} recs={stockRecs} shippedKg={toShopsDone} />
      <ErrorNote message={error} />
      <SharedNotice />

      <Tabs defaultValue="offers">
        <TabsList className="flex-wrap">
          <TabsTrigger value="offers">Farmer offers</TabsTrigger>
          <TabsTrigger value="stock">Stock in hand</TabsTrigger>
          <TabsTrigger value="shops">Dispatch to shops</TabsTrigger>
          <TabsTrigger value="market">Buy crops (bid)</TabsTrigger>
          <TabsTrigger value="needs">Crop needed</TabsTrigger>
        </TabsList>
        <TabsContent value="offers" className="mt-4 space-y-6">
      <Card className="card-modern">
        <CardHeader>
          <CardTitle>Offers from farmers</CardTitle>
          <CardDescription>Nothing is yours until you accept. Rejecting leaves the stock with the farmer.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <Loading />
          ) : incoming.length === 0 ? (
            <Empty>No offers yet.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Farmer</TableHead>
                    <TableHead>Crop</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...incoming].reverse().map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>{o.id}</TableCell>
                      <TableCell>
                        <Addr a={o.farmer} />
                      </TableCell>
                      <TableCell>{data?.crops[`${o.farmer}-${o.batchId}`] ?? `Batch #${o.batchId}`}</TableCell>
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
                            <Button size="sm" className="btn-primary" disabled={busy} onClick={() => void run("Accept offer", () => acceptFarmerOffer(c, o.id), reload)}>
                              <Check className="mr-1 h-4 w-4" />
                              Accept
                            </Button>
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => void run("Reject offer", () => rejectFarmerOffer(c, o.id), reload)}>
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

      <Card className="card-modern">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Trusted farmers
          </CardTitle>
          <CardDescription>
            Tired of approving every offer? Switch a farmer on and their offers are accepted automatically. Off by default.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data?.farmers ?? []).map((f) => (
            <div key={f} className="flex items-center justify-between rounded-md border p-3">
              <Addr a={f} />
              <Switch checked={trustOf(f)} disabled={busy} onCheckedChange={(v) => void run(v ? "Trust farmer" : "Stop trusting farmer", () => setTrustedFarmer(c, f, v), reload)} />
            </div>
          ))}
          <div className="flex gap-2">
            <Input value={newFarmer} placeholder="Farmer wallet address (0x…)" onChange={(e) => setNewFarmer(e.target.value.trim())} />
            <Button
              variant="outline"
              disabled={busy || !isAddress(newFarmer)}
              onClick={() => void run("Trust farmer", () => setTrustedFarmer(c, newFarmer, true), () => { setNewFarmer(""); reload(); })}
            >
              Trust
            </Button>
          </div>
        </CardContent>
      </Card>

        </TabsContent>
        <TabsContent value="stock" className="mt-4 space-y-6">
      <Card className="card-modern">
        <CardHeader>
          <CardTitle>Stock you hold</CardTitle>
          <CardDescription>Offer it on to a shop. The shop owner must accept.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <Loading />
          ) : holdings.length === 0 ? (
            <Empty>No stock yet. Accept a farmer's offer to receive some.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Crop</TableHead>
                    <TableHead>From farmer</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead>Available</TableHead>
                    <TableHead>You paid</TableHead>
                    <TableHead>Selling</TableHead>
                    <TableHead>Warehouse · packaging</TableHead>
                    <TableHead>Quality</TableHead>
                    <TableHead>Dispatch</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holdings.map((h) => (
                    <TableRow key={h.fragmentId}>
                      <TableCell>#{h.fragmentId}</TableCell>
                      <TableCell>
                        <p className="font-medium">{h.cropName}</p>
                        <p className="text-xs text-muted-foreground">{h.location}</p>
                      </TableCell>
                      <TableCell>
                        <Addr a={h.farmer} />
                      </TableCell>
                      <TableCell>
                        {h.received} kg · {fmtDate(h.receivedAt)}
                      </TableCell>
                      <TableCell>{h.available} kg</TableCell>
                      <TableCell>{inr(h.paidPrice)} / kg</TableCell>
                      <TableCell>{recOf(h.fragmentId)?.data.sellingPrice ? `${inr(recOf(h.fragmentId)!.data.sellingPrice!)} / kg` : "—"}</TableCell>
                      <TableCell className="text-xs">
                        {recOf(h.fragmentId)?.data.warehouse || "—"}
                        <p className="text-muted-foreground">{recOf(h.fragmentId)?.data.packaging || ""}</p>
                        {!!recOf(h.fragmentId)?.data.wasted && <p className="text-destructive">{recOf(h.fragmentId)!.data.wasted} kg wasted</p>}
                      </TableCell>
                      <TableCell>{recOf(h.fragmentId)?.data.qualityRating != null ? `${recOf(h.fragmentId)!.data.qualityRating} / 5` : "—"}</TableCell>
                      <TableCell className="text-xs">
                        {recOf(h.fragmentId)?.data.dispatchAt ? new Date(recOf(h.fragmentId)!.data.dispatchAt!).toLocaleDateString() : "—"}
                        <p className="text-muted-foreground">{recOf(h.fragmentId)?.data.vehicle || ""}</p>
                        {!!recOf(h.fragmentId)?.data.transportCost && <p className="text-muted-foreground">Transport {inr(recOf(h.fragmentId)!.data.transportCost!)}</p>}
                      </TableCell>
                      <TableCell className="space-x-2 text-right">
                        <StockDetailsDialog h={h} account={account} rec={recOf(h.fragmentId)} onSaved={reload} trigger={<Button size="sm" variant="outline"><ClipboardList className="mr-1 h-4 w-4" />Details</Button>} />
                        <OfferDialog
                          trigger={
                            <Button size="sm" variant="outline" disabled={h.available === 0}>
                              <Send className="mr-1 h-4 w-4" />
                              Offer to shop
                            </Button>
                          }
                          title={`Offer ${h.cropName} to a shop`}
                          description="Paste the shop's contract address. The shop owner must accept before the stock moves."
                          targetLabel="Shop (Retailer contract) address"
                          targetPlaceholder="0x…"
                          suggestions={shops}
                          max={h.available}
                          defaultPrice={Math.ceil(h.paidPrice * 1.1)}
                          isTrusted={(shop) => trustsDistributor(c, shop, account)}
                          submit={async (shop, qty, price) => {
                            const r = await offerToRetailer(c, h.fragmentId, qty, shop, price);
                            rememberShop(shop);
                            await recordDispatch(account, h, shop);
                            return r;
                          }}
                          onDone={reload}
                        />
                        <Button asChild size="sm" variant="ghost" title="Trace">
                          <Link to="/traceability" search={{ f: h.fragmentId }}>
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

        </TabsContent>
        <TabsContent value="shops" className="mt-4 space-y-6">
      <Card className="card-modern">
        <CardHeader>
          <CardTitle>Offers you sent to shops</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <Loading />
          ) : outgoing.length === 0 ? (
            <Empty>You have not offered anything to a shop yet.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Shop</TableHead>
                    <TableHead>From product</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...outgoing].reverse().map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>{o.id}</TableCell>
                      <TableCell>
                        <Addr a={o.retailer} />
                      </TableCell>
                      <TableCell>#{o.parentFragmentId}</TableCell>
                      <TableCell>{o.quantity} kg</TableCell>
                      <TableCell>{inr(o.price)} / kg</TableCell>
                      <TableCell>{fmtDate(o.createdAt)}</TableCell>
                      <TableCell>
                        <OfferBadge status={o.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {o.status === "pending" && (
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => void run("Cancel offer", () => cancelRetailerOffer(c, o.id), reload)}>
                            Cancel
                          </Button>
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
        </TabsContent>
        <TabsContent value="market" className="mt-4"><MarketBoard account={account} canBid /></TabsContent>
        <TabsContent value="needs" className="mt-4"><CropNeedsPanel account={account} /></TabsContent>
      </Tabs>
    </>
  );
}

const DistributorDashboard = () => (
  <DashboardLayout title="Distributor Dashboard">
    <div className="space-y-6">
      <ProfileCard
        storageKey="distributor-profile"
        title="Distributor profile"
        description="Your business information (saved in this browser)"
        icon={<Truck className="h-5 w-5 text-primary" />}
        fields={[
          { key: "name", label: "Business name", placeholder: "Your company" },
          { key: "location", label: "Location", placeholder: "City" },
          { key: "contactNumber", label: "Contact number", placeholder: "+91…" },
          { key: "vehicles", label: "Vehicles", placeholder: "3" },
        ]}
      />
      <WalletGate>
        <DistributorBody />
      </WalletGate>
    </div>
  </DashboardLayout>
);

export default DistributorDashboard;
