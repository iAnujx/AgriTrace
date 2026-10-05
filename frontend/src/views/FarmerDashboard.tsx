import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ImageIcon, Package, Pencil, Plus, Route as RouteIcon, Send, Sprout, Trash2, Truck, Wheat } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EditListingDialog, FarmerBidsPanel, ImprovePanel, TractionPanel } from "@/components/extras/FarmerExtras";
import { SharedNotice } from "@/components/extras/SharedNotice";
import { listRecs, type Listing } from "@/lib/extras";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import DashboardLayout from "@/components/DashboardLayout";
import { NewBatchForm } from "@/components/chain/NewBatchForm";
import { OfferDialog } from "@/components/chain/OfferDialog";
import { Addr, Empty, ErrorNote, Loading, OfferBadge, ProfileCard, Stat, fmtDate, inr, useTx } from "@/components/chain/ui";
import { useAsync } from "@/components/chain/useAsync";
import { WalletGate, useReady } from "@/components/chain/WalletGate";
import { cancelFarmerOffer, deleteBatch, fetchBatches, fetchFarmerOffers, offerToDistributor, trustsFarmer } from "@/chain/api";

function FarmerBody() {
  const { c, account } = useReady();
  const { busy, run } = useTx();
  const { data, loading, error, reload } = useAsync(
    async () => ({ batches: await fetchBatches(c), offers: await fetchFarmerOffers(c, account), listings: await listRecs<Listing>("listing", { owner: account }) }),
    [c, account],
  );
  const [bidTick, setBidTick] = useState(0);
  const listings = data?.listings ?? [];
  const listingOf = (id: number) => listings.find((l) => l.ref === String(id));
  // average price actually paid for each batch (accepted offers only)
  const soldPrice = (id: number) => {
    const acc = offers.filter((o) => o.batchId === id && o.status === "accepted");
    const kg = acc.reduce((s, o) => s + o.quantity, 0);
    return kg ? Math.round(acc.reduce((s, o) => s + o.quantity * o.price, 0) / kg) : null;
  };

  const batches = data?.batches ?? [];
  const offers = data?.offers ?? [];
  const harvested = batches.reduce((s, b) => s + b.total, 0);
  const inStock = batches.reduce((s, b) => s + b.left, 0);
  const waiting = offers.filter((o) => o.status === "pending").reduce((s, o) => s + o.quantity, 0);
  const delivered = offers.filter((o) => o.status === "accepted").reduce((s, o) => s + o.quantity, 0);
  const crop = (batchId: number) => batches.find((b) => b.id === batchId)?.cropName ?? `Batch #${batchId}`;

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Harvested (kg)" value={harvested} icon={<Wheat className="h-8 w-8" />} />
        <Stat label="In your store (kg)" value={inStock} icon={<Package className="h-8 w-8" />} />
        <Stat label="Waiting for answer (kg)" value={waiting} icon={<Send className="h-8 w-8" />} />
        <Stat label="Delivered (kg)" value={delivered} icon={<Truck className="h-8 w-8" />} />
      </div>

      <SharedNotice />
      <Tabs defaultValue="batches">
        <TabsList className="flex-wrap">
          <TabsTrigger value="batches">Your batches</TabsTrigger>
          <TabsTrigger value="offers">Offers sent</TabsTrigger>
          <TabsTrigger value="bids">Bids</TabsTrigger>
          <TabsTrigger value="sales">Traction</TabsTrigger>
          <TabsTrigger value="improve">Improve</TabsTrigger>
        </TabsList>
        <TabsContent value="batches" className="mt-4">
      <Card className="card-modern">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Your batches</CardTitle>
            <CardDescription>Each harvest is registered once on the blockchain; its id is created automatically.</CardDescription>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button className="btn-primary">
                <Plus className="mr-2 h-4 w-4" />
                Register batch
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Register a new batch</DialogTitle>
                <DialogDescription>Details are stored on the blockchain and cannot be changed later.</DialogDescription>
              </DialogHeader>
              <NewBatchForm onCreated={reload} />
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <ErrorNote message={error} />
          {loading && !data ? (
            <Loading />
          ) : batches.length === 0 ? (
            <Empty>No batches yet. Register your first harvest.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch</TableHead>
                    <TableHead>Crop</TableHead>
                    <TableHead>Left / total</TableHead>
                    <TableHead>Expected price</TableHead>
                    <TableHead>Sold price</TableHead>
                    <TableHead>Grown at</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>#{b.id}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {listingOf(b.id)?.data.image ? <img src={listingOf(b.id)!.data.image!} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <span className="grid h-10 w-10 place-items-center rounded-lg bg-muted"><ImageIcon className="h-4 w-4 text-muted-foreground" /></span>}
                          <div>
                        <p className="font-medium">{b.cropName}</p>
                        <p className="text-xs capitalize text-muted-foreground">
                          {b.cropType} · {b.harvestDate}
                        </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {b.left} / {b.total} kg
                      </TableCell>
                      <TableCell>
                        {inr(b.expectedPrice)} / kg
                        <p className="text-xs text-muted-foreground">Total {inr(b.expectedPrice * b.total)}</p>
                        {listingOf(b.id) && listingOf(b.id)!.data.price !== b.expectedPrice && <p className="text-xs text-primary">Asking {inr(listingOf(b.id)!.data.price)}</p>}
                      </TableCell>
                      <TableCell>{soldPrice(b.id) ? `${inr(soldPrice(b.id)!)} / kg` : "—"}</TableCell>
                      <TableCell>{b.location}</TableCell>
                      <TableCell className="space-x-2 text-right">
                        <EditListingDialog batch={b} account={account} listing={listingOf(b.id)} onSaved={reload} trigger={<Button size="sm" variant="ghost" title="Edit price and photo"><Pencil className="h-4 w-4" /></Button>} />
                        <OfferDialog
                          trigger={
                            <Button size="sm" variant="outline" disabled={b.left === 0}>
                              <Send className="mr-1 h-4 w-4" />
                              Offer
                            </Button>
                          }
                          title={`Offer ${b.cropName} to a distributor`}
                          description="The distributor must accept before the stock moves to them."
                          targetLabel="Distributor wallet address"
                          targetPlaceholder="0x…"
                          max={b.left}
                          defaultPrice={b.expectedPrice}
                          isTrusted={(addr) => trustsFarmer(c, addr, account)}
                          submit={(to, qty, price) => offerToDistributor(c, b.id, qty, to, price)}
                          onDone={reload}
                        />
                        <Button asChild size="sm" variant="ghost" title="Trace this batch">
                          <Link to="/traceability" search={{ f: b.rootFragmentId }}>
                            <RouteIcon className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy || b.left !== b.total}
                          title={b.left !== b.total ? "Already delivered, cannot delete" : "Delete batch"}
                          onClick={() => void run("Delete batch", () => deleteBatch(c, b.id), reload)}
                        >
                          <Trash2 className="h-4 w-4" />
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
        <TabsContent value="offers" className="mt-4">
      <Card className="card-modern">
        <CardHeader>
          <CardTitle>Offers you sent</CardTitle>
          <CardDescription>Stock leaves your store only when the distributor accepts.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <Loading />
          ) : offers.length === 0 ? (
            <Empty>You have not sent any offers yet.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Crop</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...offers].reverse().map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>{o.id}</TableCell>
                      <TableCell>{crop(o.batchId)}</TableCell>
                      <TableCell>
                        <Addr a={o.distributor} />
                      </TableCell>
                      <TableCell>{o.quantity} kg</TableCell>
                      <TableCell>{inr(o.price)} / kg</TableCell>
                      <TableCell>{fmtDate(o.createdAt)}</TableCell>
                      <TableCell>
                        <OfferBadge status={o.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {o.status === "pending" && (
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => void run("Cancel offer", () => cancelFarmerOffer(c, o.id), reload)}>
                            Cancel
                          </Button>
                        )}
                        {o.status === "accepted" && (
                          <Button asChild size="sm" variant="ghost">
                            <Link to="/traceability" search={{ f: o.fragmentId }}>
                              <RouteIcon className="h-4 w-4" />
                            </Link>
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
        <TabsContent value="bids" className="mt-4"><FarmerBidsPanel c={c} account={account} batches={batches} reloadKey={bidTick} onChanged={() => { setBidTick((n) => n + 1); reload(); }} /></TabsContent>
        <TabsContent value="sales" className="mt-4"><TractionPanel c={c} offers={offers} batches={batches} /></TabsContent>
        <TabsContent value="improve" className="mt-4"><ImprovePanel account={account} batches={batches} /></TabsContent>
      </Tabs>
    </>
  );
}

const FarmerDashboard = () => (
  <DashboardLayout title="Farmer Dashboard">
    <div className="space-y-6">
      <ProfileCard
        storageKey="farmer-profile"
        title="Farmer profile"
        description="Your farming information (saved in this browser)"
        icon={<Sprout className="h-5 w-5 text-primary" />}
        fields={[
          { key: "name", label: "Name", placeholder: "Your name" },
          { key: "farmLocation", label: "Farm location", placeholder: "Village / city" },
          { key: "contactNumber", label: "Contact number", placeholder: "+91…" },
          { key: "farmSize", label: "Farm size (acres)", placeholder: "5" },
        ]}
      />
      <WalletGate>
        <FarmerBody />
      </WalletGate>
    </div>
  </DashboardLayout>
);

export default FarmerDashboard;
