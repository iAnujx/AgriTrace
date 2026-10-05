import { useEffect, useState, type ReactNode } from "react";
import { Gavel, Loader2, MapPin, Package, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { Empty, Stat, inr } from "@/components/chain/ui";
import type { Holding } from "@/chain/types";
import {
  listRecs,
  putRec,
  removeRec,
  type Bid,
  type Listing,
  type Need,
  type Rec,
  type StockInfo,
} from "@/lib/extras";

const profileName = (): string => {
  try {
    return JSON.parse(localStorage.getItem("distributor-profile") ?? "{}").name ?? "";
  } catch {
    return "";
  }
};

/* ---------------- stock details: warehouse, packaging, quality check, prices, transport, waste, dispatch ---------------- */
export function StockDetailsDialog({
  h,
  account,
  rec,
  trigger,
  onSaved,
}: {
  h: Holding;
  account: string;
  rec?: Rec<StockInfo> | undefined;
  trigger: ReactNode;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    warehouse: "",
    packaging: "",
    qualityRating: "",
    qualityNotes: "",
    sellingPrice: "",
    transportCost: "",
    wasted: "",
    vehicle: "",
    dispatchTo: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  useEffect(() => {
    if (!open) return;
    const d = rec?.data;
    setF({
      warehouse: d?.warehouse ?? "",
      packaging: d?.packaging ?? "",
      qualityRating: d?.qualityRating?.toString() ?? "",
      qualityNotes: d?.qualityNotes ?? "",
      sellingPrice: d?.sellingPrice?.toString() ?? "",
      transportCost: d?.transportCost?.toString() ?? "",
      wasted: d?.wasted?.toString() ?? "",
      vehicle: d?.vehicle ?? "",
      dispatchTo: d?.dispatchTo ?? "",
    });
  }, [open, rec]);

  const rating = f.qualityRating === "" ? null : Number(f.qualityRating);
  const num = (s: string) => (s === "" ? undefined : Number(s));
  const problem =
    rating != null && !(rating >= 0 && rating <= 5)
      ? "Quality rating must be between 0 and 5"
      : [f.sellingPrice, f.transportCost, f.wasted].some((s) => s !== "" && !(Number(s) >= 0))
        ? "Prices, cost and waste must be numbers (0 or more)"
        : num(f.wasted) !== undefined && Number(f.wasted) > h.received
          ? `Wasted cannot be more than the ${h.received} kg received`
          : "";

  const save = async () => {
    setBusy(true);
    try {
      const data: StockInfo = {
        fragmentId: h.fragmentId,
        batchId: h.batchId,
        farmer: h.farmer,
        warehouse: f.warehouse,
        packaging: f.packaging,
        qualityRating: rating,
        qualityNotes: f.qualityNotes,
        sellingPrice: num(f.sellingPrice) ?? null,
        transportCost: num(f.transportCost) ?? 0,
        wasted: num(f.wasted) ?? 0,
        vehicle: f.vehicle,
        dispatchTo: f.dispatchTo,
        ...(rec?.data.dispatchAt ? { dispatchAt: rec.data.dispatchAt } : {}),
      };
      await putRec("stock", account, String(h.fragmentId), data, { unique: true, merge: true });
      toast.success("Stock details saved");
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
            <DialogTitle>
              Stock details: {h.cropName} #{h.fragmentId}
            </DialogTitle>
            <DialogDescription>
              Your own records for this stock. Farmers see only the quality rating and notes.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Warehouse</Label>
              <Input
                value={f.warehouse}
                onChange={(e) => set("warehouse", e.target.value)}
                placeholder="Name · city"
              />
            </div>
            <div>
              <Label>Packaging</Label>
              <Input
                value={f.packaging}
                onChange={(e) => set("packaging", e.target.value)}
                placeholder="25 kg jute bags"
              />
            </div>
            <div>
              <Label>Farmer quality rating (0–5)</Label>
              <Input
                inputMode="decimal"
                value={f.qualityRating}
                onChange={(e) => set("qualityRating", e.target.value)}
              />
            </div>
            <div>
              <Label>Selling price (₹/kg)</Label>
              <Input
                inputMode="decimal"
                value={f.sellingPrice}
                onChange={(e) => set("sellingPrice", e.target.value)}
                placeholder={`You paid ${inr(h.paidPrice)}`}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Quality check notes</Label>
              <Textarea
                value={f.qualityNotes}
                onChange={(e) => set("qualityNotes", e.target.value)}
                placeholder="Moisture, grading, damage…"
              />
            </div>
            <div>
              <Label>Transportation cost (₹)</Label>
              <Input
                inputMode="decimal"
                value={f.transportCost}
                onChange={(e) => set("transportCost", e.target.value)}
              />
            </div>
            <div>
              <Label>Wasted (kg)</Label>
              <Input
                inputMode="decimal"
                value={f.wasted}
                onChange={(e) => set("wasted", e.target.value)}
              />
            </div>
            <div>
              <Label>Vehicle</Label>
              <Input
                value={f.vehicle}
                onChange={(e) => set("vehicle", e.target.value)}
                placeholder="MH12 AB 1234"
              />
            </div>
            <div>
              <Label>Dispatched to</Label>
              <Input
                value={f.dispatchTo}
                onChange={(e) => set("dispatchTo", e.target.value)}
                placeholder="Shop / city"
              />
            </div>
          </div>
          {problem && <p className="text-sm text-destructive">{problem}</p>}
          <Button
            className="btn-primary w-full"
            disabled={busy || !!problem}
            onClick={() => void save()}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Called after an on-chain offer to a shop succeeds: remembers where and when it was dispatched. */
export async function recordDispatch(account: string, h: Holding, destination: string) {
  try {
    await putRec(
      "stock",
      account,
      String(h.fragmentId),
      {
        fragmentId: h.fragmentId,
        batchId: h.batchId,
        farmer: h.farmer,
        dispatchTo: destination,
        dispatchAt: new Date().toISOString(),
      } as StockInfo,
      { unique: true, merge: true },
    );
  } catch {
    /* extras are best-effort; the blockchain record is what counts */
  }
}

export function StockSummary({
  holdings,
  recs,
  shippedKg,
}: {
  holdings: Holding[];
  recs: Rec<StockInfo>[];
  shippedKg: number;
}) {
  const by = new Map(recs.map((r) => [r.ref, r.data]));
  let wasted = 0,
    transport = 0,
    buy = 0,
    sell = 0,
    rs = 0,
    rn = 0;
  for (const h of holdings) {
    const d = by.get(String(h.fragmentId));
    wasted += d?.wasted ?? 0;
    transport += d?.transportCost ?? 0;
    buy += h.received * h.paidPrice;
    sell += h.received * (d?.sellingPrice ?? h.paidPrice);
    if (d?.qualityRating != null) {
      rs += Number(d.qualityRating);
      rn++;
    }
  }
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      <Stat label="Buying cost" value={inr(buy)} icon={<Package className="h-8 w-8" />} />
      <Stat label="Selling value" value={inr(sell)} icon={<Package className="h-8 w-8" />} />
      <Stat label="Dispatched (kg)" value={shippedKg} icon={<Package className="h-8 w-8" />} />
      <Stat label="Wasted (kg)" value={wasted} icon={<Trash2 className="h-8 w-8" />} />
      <Stat label="Transport cost" value={inr(transport)} icon={<Star className="h-8 w-8" />} />
      {rn > 0 && (
        <p className="col-span-full text-sm text-muted-foreground">
          Average quality rating you gave: {(rs / rn).toFixed(1)} / 5
        </p>
      )}
    </div>
  );
}

/* ---------------- crop needs (what distributors are looking for) ---------------- */
export function CropNeedsPanel({
  account,
  readOnly,
}: {
  account?: string | undefined;
  readOnly?: boolean;
}) {
  const [needs, setNeeds] = useState<Rec<Need>[] | null>(null);
  const [f, setF] = useState({ crop: "", quantity: "", maxPrice: "", neededBy: "" });
  const load = () => void listRecs<Need>("need").then(setNeeds);
  useEffect(load, []);
  const add = async () => {
    if (!account) return;
    const q = Number(f.quantity);
    if (!f.crop.trim() || !(q > 0)) return void toast.error("Enter a crop and a quantity");
    try {
      await putRec("need", account, "", {
        crop: f.crop.trim(),
        quantity: q,
        maxPrice: f.maxPrice ? Number(f.maxPrice) : null,
        neededBy: f.neededBy || null,
        distributorName: profileName(),
      } as Need);
      setF({ crop: "", quantity: "", maxPrice: "", neededBy: "" });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  };
  return (
    <Card className="card-modern">
      <CardHeader>
        <CardTitle>Crop needed</CardTitle>
        <CardDescription>
          {readOnly
            ? "What distributors are looking to buy."
            : "Tell farmers what you want to buy."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!readOnly && (
          <div className="grid gap-2 sm:grid-cols-5">
            <Input
              className="sm:col-span-2"
              placeholder="Crop (e.g. Basmati rice)"
              value={f.crop}
              onChange={(e) => setF({ ...f, crop: e.target.value })}
            />
            <Input
              inputMode="numeric"
              placeholder="Quantity (kg)"
              value={f.quantity}
              onChange={(e) => setF({ ...f, quantity: e.target.value })}
            />
            <Input
              inputMode="numeric"
              placeholder="Max ₹/kg"
              value={f.maxPrice}
              onChange={(e) => setF({ ...f, maxPrice: e.target.value })}
            />
            <Button className="btn-primary" onClick={() => void add()}>
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </div>
        )}
        {needs === null ? (
          <Empty>Loading…</Empty>
        ) : needs.length === 0 ? (
          <Empty>No crop needs posted yet.</Empty>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {needs.map((n) => (
              <div
                key={n.id}
                className="flex items-start justify-between gap-2 rounded-2xl border border-border/60 p-4"
              >
                <div>
                  <p className="font-semibold">{n.data.crop}</p>
                  <p className="text-sm text-muted-foreground">
                    {n.data.quantity} kg
                    {n.data.maxPrice ? ` · up to ${inr(n.data.maxPrice)}/kg` : ""}
                  </p>
                  {n.data.distributorName && (
                    <p className="text-xs text-muted-foreground">{n.data.distributorName}</p>
                  )}
                </div>
                {!readOnly && account && n.owner === account.toLowerCase() && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Delete"
                    onClick={() => void removeRec("need", n.id).then(load)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- marketplace board: farmer listings, distributors can bid ---------------- */
function BidDialog({
  l,
  account,
  onClose,
}: {
  l: Rec<Listing> | null;
  account: string;
  onClose: () => void;
}) {
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (l) {
      setPrice(String(l.data.price));
      setQty(String(Math.min(100, l.data.quantity)));
    }
  }, [l]);
  const p = Number(price),
    q = Number(qty);
  const bad = !(p > 0) || !(q > 0) || !Number.isInteger(q) || !Number.isInteger(p);
  const send = async () => {
    if (!l) return;
    setBusy(true);
    try {
      await putRec("bid", account, l.id, {
        listingId: l.id,
        batchId: l.data.batchId,
        farmer: l.data.farmer,
        bidder: account,
        bidderName: profileName(),
        cropName: l.data.cropName,
        price: p,
        quantity: q,
        status: "open",
      } as Bid);
      toast.success("Bid sent to the farmer");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send the bid");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={!!l} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bid on {l?.data.cropName}</DialogTitle>
          <DialogDescription>
            Asking {inr(l?.data.price ?? 0)} / kg. If the farmer accepts, they send you an on-chain
            offer at your price.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Your price (₹ per kg, whole number)</Label>
            <Input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div>
            <Label>Quantity (kg)</Label>
            <Input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <p className="rounded-xl bg-muted p-3 text-sm">
            Total: <b>{inr((bad ? 0 : p) * (bad ? 0 : q))}</b>
          </p>
          <Button className="btn-primary w-full" disabled={busy || bad} onClick={() => void send()}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Gavel className="mr-2 h-4 w-4" />
            Place bid
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function MarketBoard({
  account,
  canBid,
}: {
  account?: string | undefined;
  canBid: boolean;
}) {
  const [rows, setRows] = useState<Rec<Listing>[] | null>(null);
  const [q, setQ] = useState("");
  const [bid, setBid] = useState<Rec<Listing> | null>(null);
  useEffect(() => void listRecs<Listing>("listing").then(setRows), []);
  const shown = (rows ?? []).filter((r) =>
    `${r.data.cropName} ${r.data.cropType} ${r.data.location}`
      .toLowerCase()
      .includes(q.trim().toLowerCase()),
  );
  return (
    <div className="space-y-4">
      <Input
        className="h-11 rounded-2xl"
        placeholder="Search crops or places…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {rows === null ? (
        <Empty>Loading…</Empty>
      ) : shown.length === 0 ? (
        <Empty>No crops listed yet. Farmers appear here after they register a batch.</Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((r) => (
            <Card key={r.id} className="card-modern overflow-hidden">
              <div className="aspect-[16/9] bg-muted">
                {r.data.image ? (
                  <img
                    src={r.data.image}
                    alt={r.data.cropName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="grid h-full place-items-center">
                    <Package className="h-9 w-9 text-muted-foreground" />
                  </div>
                )}
              </div>
              <CardContent className="space-y-1 p-4">
                <p className="text-xs capitalize text-muted-foreground">{r.data.cropType}</p>
                <p className="font-semibold">{r.data.cropName}</p>
                <p className="flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {r.data.location}
                </p>
                <div className="flex items-end justify-between pt-2">
                  <div>
                    <p className="text-lg font-semibold text-primary">{inr(r.data.price)}/kg</p>
                    <p className="text-xs text-muted-foreground">up to {r.data.quantity} kg</p>
                  </div>
                  {canBid && account && (
                    <Button size="sm" variant="outline" onClick={() => setBid(r)}>
                      <Gavel className="mr-1 h-4 w-4" />
                      Bid
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {account && <BidDialog l={bid} account={account} onClose={() => setBid(null)} />}
    </div>
  );
}
