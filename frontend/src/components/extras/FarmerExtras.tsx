import { useEffect, useState, type ReactNode } from "react";
import { Check, Lightbulb, Loader2, Pencil, Star, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Addr, Empty, fmtDate, inr, useTx } from "@/components/chain/ui";
import { PhotoField } from "./PhotoField";
import { nameOf, offerToDistributor } from "@/chain/api";
import type { Contracts } from "@/chain/contracts";
import type { FarmBatch, FarmerOffer } from "@/chain/types";
import {
  batchKey,
  listRecs,
  putRec,
  ratingsByBatch,
  type Bid,
  type Listing,
  type Rec,
} from "@/lib/extras";
import { suggestPrice } from "@/lib/pricing";

/** Edit the asking price and photo shown on the marketplace. (Crop, quantity, place and date are on-chain and fixed.) */
export function EditListingDialog({
  batch,
  account,
  listing,
  trigger,
  onSaved,
}: {
  batch: FarmBatch;
  account: string;
  listing?: Rec<Listing> | undefined;
  trigger: ReactNode;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setPrice(String(listing?.data.price ?? batch.expectedPrice));
    setImage(listing?.data.image ?? null);
  }, [open, listing, batch]);
  const hint = suggestPrice(batch.cropName, batch.cropType, batch.location);
  const p = Number(price);
  const bad = !Number.isFinite(p) || p <= 0;

  const save = async () => {
    setBusy(true);
    try {
      const data: Listing = {
        batchId: batch.id,
        rootFragmentId: batch.rootFragmentId,
        farmer: account,
        cropName: batch.cropName,
        cropType: batch.cropType,
        location: batch.location,
        harvestDate: batch.harvestDate,
        quantity: batch.total,
        price: p,
        image,
      };
      await putRec("listing", account, String(batch.id), data, { unique: true });
      toast.success("Listing updated");
      setOpen(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit listing: {batch.cropName}</DialogTitle>
            <DialogDescription>
              Change the asking price and photo buyers see. The registered crop details are on the
              blockchain and cannot change.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="el-price">Asking price (₹ per kg)</Label>
              <Input
                id="el-price"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
              {hint && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Suggested for {batch.location}: ₹{hint.price} ({hint.reason}) ·{" "}
                  <button
                    type="button"
                    className="text-primary underline"
                    onClick={() => setPrice(String(hint.price))}
                  >
                    use
                  </button>
                </p>
              )}
              {!bad && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Total for {batch.total} kg: {inr(p * batch.total)}
                </p>
              )}
            </div>
            <PhotoField value={image} onChange={setImage} />
            <Button
              className="btn-primary w-full"
              disabled={busy || bad}
              onClick={() => void save()}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Bids distributors placed on this farmer's listings. Accepting sends an on-chain offer at the bid price; the distributor then accepts it. */
export function FarmerBidsPanel({
  c,
  account,
  batches,
  reloadKey,
  onChanged,
}: {
  c: Contracts;
  account: string;
  batches: FarmBatch[];
  reloadKey: number;
  onChanged: () => void;
}) {
  const [bids, setBids] = useState<Rec<Bid>[] | null>(null);
  const { busy, run } = useTx();
  const load = () =>
    void listRecs<Bid>("bid").then((r) =>
      setBids(r.filter((b) => b.data.farmer.toLowerCase() === account.toLowerCase())),
    );
  useEffect(load, [account, reloadKey]);

  const left = (id: number) => batches.find((b) => b.id === id)?.left ?? 0;
  const setStatus = async (b: Rec<Bid>, status: Bid["status"]) => {
    await putRec("bid", b.owner, b.ref, { status }, { id: b.id, merge: true });
    load();
    onChanged();
  };
  const accept = (b: Rec<Bid>) =>
    void run("Accept bid", async () => {
      if (b.data.quantity > left(b.data.batchId))
        throw new Error(`Only ${left(b.data.batchId)} kg left in this batch`);
      await offerToDistributor(c, b.data.batchId, b.data.quantity, b.data.bidder, b.data.price);
      await setStatus(b, "accepted");
    });

  return (
    <Card className="card-modern">
      <CardHeader>
        <CardTitle>Bids on your crops</CardTitle>
        <CardDescription>
          Accepting a bid sends the distributor an offer at their price. The stock moves once they
          accept it on the blockchain.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {bids === null ? (
          <Empty>Loading…</Empty>
        ) : bids.length === 0 ? (
          <Empty>No bids yet.</Empty>
        ) : (
          bids.map((b) => (
            <div
              key={b.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 p-4"
            >
              <div>
                <p className="font-medium">
                  {b.data.cropName}{" "}
                  <span className="text-xs text-muted-foreground">batch #{b.data.batchId}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {b.data.bidderName || "Distributor"} · <Addr a={b.data.bidder} /> ·{" "}
                  {new Date(b.created_at).toLocaleString()}
                </p>
                <p className="mt-1 text-sm">
                  {b.data.quantity} kg × {inr(b.data.price)} ={" "}
                  <b>{inr(b.data.quantity * b.data.price)}</b>
                </p>
              </div>
              {b.data.status === "open" ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="btn-primary"
                    disabled={busy}
                    onClick={() => accept(b)}
                  >
                    <Check className="mr-1 h-4 w-4" />
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void setStatus(b, "rejected")}
                  >
                    <X className="mr-1 h-4 w-4" />
                    Reject
                  </Button>
                </div>
              ) : (
                <Badge variant="outline" className="capitalize">
                  {b.data.status}
                </Badge>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function BuyerName({ c, a }: { c: Contracts; a: string }) {
  const [n, setN] = useState("");
  useEffect(() => {
    let live = true;
    void nameOf(c, a).then((x) => live && setN(x));
    return () => {
      live = false;
    };
  }, [c, a]);
  return <span>{n && !n.includes("…") ? n : "—"}</span>;
}

/** Who bought the crop, when, and at what price (read from accepted on-chain offers). */
export function TractionPanel({
  c,
  offers,
  batches,
}: {
  c: Contracts;
  offers: FarmerOffer[];
  batches: FarmBatch[];
}) {
  const sold = offers
    .filter((o) => o.status === "accepted")
    .sort((a, b) => b.createdAt - a.createdAt);
  const crop = (id: number) => batches.find((b) => b.id === id)?.cropName ?? `Batch #${id}`;
  return (
    <Card className="card-modern">
      <CardHeader>
        <CardTitle>Traction details</CardTitle>
        <CardDescription>
          Distributor, date sold and account for every accepted sale. Only you see this.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {sold.length === 0 ? (
          <Empty>No sales yet.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Distributor</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Date sold</TableHead>
                <TableHead>Crop</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Sold price</TableHead>
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sold.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <BuyerName c={c} a={o.distributor} />
                  </TableCell>
                  <TableCell>
                    <Addr a={o.distributor} />
                  </TableCell>
                  <TableCell>{fmtDate(o.createdAt)}</TableCell>
                  <TableCell>{crop(o.batchId)}</TableCell>
                  <TableCell>{o.quantity} kg</TableCell>
                  <TableCell>{inr(o.price)} / kg</TableCell>
                  <TableCell>{inr(o.price * o.quantity)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/** Quality feedback from distributors plus practical tips. */
export function ImprovePanel({ account, batches }: { account: string; batches: FarmBatch[] }) {
  const [rows, setRows] = useState<
    { crop: string; avg: number; count: number; notes: string[] }[] | null
  >(null);
  useEffect(() => {
    void ratingsByBatch().then((m) =>
      setRows(
        batches
          .map((b) => ({ b, r: m.get(batchKey(account, b.id)) }))
          .filter((x) => x.r)
          .map((x) => ({ crop: x.b.cropName, ...x.r! })),
      ),
    );
  }, [account, batches]);
  const all = rows ?? [];
  const avg = all.length
    ? all.reduce((s, r) => s + r.avg * r.count, 0) / all.reduce((s, r) => s + r.count, 0)
    : null;
  return (
    <Card className="card-modern">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-primary" />
          Improve your solution
        </CardTitle>
        <CardDescription>
          Quality ratings and notes that distributors gave your crops.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl bg-muted p-4">
          <p className="text-sm text-muted-foreground">Average quality rating</p>
          <p className="flex items-center gap-2 text-3xl font-semibold">
            {avg == null ? (
              "—"
            ) : (
              <>
                <Star className="h-6 w-6 fill-primary text-primary" />
                {avg.toFixed(1)} / 5
              </>
            )}
          </p>
        </div>
        {avg != null && avg < 3.5 && (
          <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
            Your rating is low. Check grading, drying and storage before you hand the crop over.
          </p>
        )}
        {all.map((r) => (
          <div key={r.crop} className="rounded-xl border border-border/60 p-3 text-sm">
            <p className="font-medium">
              {r.crop}: {r.avg.toFixed(1)} / 5{" "}
              <span className="text-muted-foreground">
                ({r.count} rating{r.count > 1 ? "s" : ""})
              </span>
            </p>
            {r.notes.map((n, i) => (
              <p key={i} className="text-muted-foreground">
                “{n}”
              </p>
            ))}
          </div>
        ))}
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Grade and sort before listing: clean, even produce gets higher bids.</li>
          <li>Add a clear, well-lit photo of the real crop.</li>
          <li>Record the exact growing place. Premium regions earn better prices.</li>
          <li>Reply to bids quickly; distributors move on to the next farmer.</li>
        </ul>
      </CardContent>
    </Card>
  );
}

export { Pencil as EditIcon };
