// The product page: where it was grown, every hand it passed through, and whether its label is genuine.
// Used by the consumer dashboard, the traceability page and the public /trace page (QR code target).
import { listRecs, ratingsByBatch, batchKey, type Listing } from "@/lib/extras";
import { useEffect, useState } from "react";
import { BadgeCheck, MapPin, Package, ShieldAlert, Sprout, Star, Store, Truck, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { nameOf, verifyLabel } from "@/chain/api";
import type { Contracts } from "@/chain/contracts";
import type { JourneyStep, Product } from "@/chain/types";
import { Addr, ShelfBadge, fmtDate, inr } from "./ui";

export interface LabelClaim {
  batchId: number;
  offset: number;
  size: number;
}

/** What a printed QR link carries so the page can check it against the chain. */
export function buildTraceLink(origin: string, p: { id: number; batchId: number; offset: number; size: number }): string {
  const q = new URLSearchParams({ f: String(p.id), b: String(p.batchId), o: String(p.offset), s: String(p.size) });
  return `${origin}/trace?${q.toString()}`;
}

const STEP: Record<JourneyStep["kind"], { icon: typeof Sprout; title: string }> = {
  farm: { icon: Sprout, title: "Grown by the farmer" },
  distributor: { icon: Truck, title: "Bought by the distributor" },
  retailer: { icon: Store, title: "Received by the shop" },
  handler: { icon: Truck, title: "Passed to another handler" },
};

/** Consumers and anonymous scanners never see farmer identity (name, wallet). Supply-chain roles still do. */
const viewerIsInsider = () => {
  try {
    const r = JSON.parse(localStorage.getItem("agritrace-user") ?? "{}").role;
    return r === "farmer" || r === "distributor" || r === "retailer";
  } catch {
    return false;
  }
};

function CropExtras({ farmer, batchId }: { farmer: string; batchId: number }) {
  const [img, setImg] = useState<string | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    void listRecs<Listing>("listing", { owner: farmer, ref: String(batchId) }).then((x) => live && setImg(x[0]?.data.image ?? null));
    void ratingsByBatch().then((m) => live && setRating(m.get(batchKey(farmer, batchId))?.avg ?? null));
    return () => {
      live = false;
    };
  }, [farmer, batchId]);
  if (!img && rating == null) return null;
  return (
    <div className="flex items-center gap-4 px-6 pb-2">
      {img && <img src={img} alt="Crop" className="h-24 w-24 rounded-2xl object-cover" />}
      {rating != null && <span className="inline-flex items-center gap-1 text-sm font-medium"><Star className="h-4 w-4 fill-primary text-primary" />{rating.toFixed(1)} / 5 quality</span>}
    </div>
  );
}

function Holder({ c, address, hide }: { c: Contracts; address: string; hide?: boolean }) {
  const [name, setName] = useState("");
  useEffect(() => {
    if (hide) return;
    let live = true;
    void nameOf(c, address).then((n) => live && setName(n));
    return () => {
      live = false;
    };
  }, [c, address, hide]);
  if (hide) return <span className="text-muted-foreground">Verified farm (identity private)</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
      {name && !name.includes("…") && <span className="font-medium text-foreground">{name}</span>}
      <Addr a={address} />
    </span>
  );
}

function LabelCheck({ c, product, claim }: { c: Contracts; product: Product; claim?: LabelClaim | undefined }) {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    if (!claim) return;
    let live = true;
    verifyLabel(c, product.fragment.id, claim.batchId, claim.offset, claim.size)
      .then((r) => live && setOk(r))
      .catch(() => live && setOk(false));
    return () => {
      live = false;
    };
  }, [c, product, claim]);

  if (!claim) return null;
  if (ok === null) return <p className="text-sm text-muted-foreground">Checking the label on the blockchain…</p>;
  return ok ? (
    <div className="flex items-start gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
      <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <p className="font-semibold">Genuine label</p>
        <p className="text-sm">The batch, position and weight printed on this pack match the blockchain record.</p>
      </div>
    </div>
  ) : (
    <div className="flex items-start gap-3 rounded-lg border border-rose-300 bg-rose-50 p-4 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100">
      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <p className="font-semibold">Label does not match</p>
        <p className="text-sm">The details on this pack are not what the blockchain recorded. Do not trust this product.</p>
      </div>
    </div>
  );
}

export function ProductJourney({ c, product, claim }: { c: Contracts; product: Product; claim?: LabelClaim | undefined }) {
  const { fragment: f, origin, retail, journey } = product;
  return (
    <div className="space-y-6">
      <LabelCheck c={c} product={product} claim={claim} />

      <Card className="card-modern">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Package className="h-6 w-6 text-primary" />
              {origin.found ? origin.cropName : `Batch #${f.batchId}`}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {retail.atRetailer && <ShelfBadge status={retail.status} />}
              {f.isFinal && <Badge variant="outline">Final retail unit</Badge>}
            </div>
          </div>
          <CardDescription>
            Product #{f.id} · {f.size} kg · from farm batch #{f.batchId}
          </CardDescription>
        </CardHeader>
        {origin.found && <CropExtras farmer={origin.farmer} batchId={f.batchId} />}
        <CardContent className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <div>
            <p className="text-muted-foreground">Crop type</p>
            <p className="font-semibold capitalize">{origin.cropType || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Grown in</p>
            <p className="flex items-center gap-1 font-semibold">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              {origin.farmLocation || "—"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Harvested</p>
            <p className="font-semibold">{origin.harvestDate || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Shop price</p>
            <p className="font-semibold">{retail.atRetailer ? `${inr(retail.price)} / kg` : "Not on a shelf yet"}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="card-modern">
        <CardHeader>
          <CardTitle>Journey</CardTitle>
          <CardDescription>Every step is recorded on the blockchain and cannot be edited.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="relative space-y-6 border-l-2 border-primary/30 pl-6">
            {journey.map((s) => {
              const { icon: Icon, title } = STEP[s.kind];
              return (
                <li key={s.fragmentId} className="relative">
                  <span className="absolute -left-[37px] grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Icon className="h-4 w-4" />
                  </span>
                  <p className="font-semibold">{title}</p>
                  <div className="mt-1 text-sm text-muted-foreground">
                    <Holder c={c} address={s.holder} hide={s.kind === "farm" && !viewerIsInsider()} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {fmtDate(s.date)} · {s.size} kg{s.price > 0 && ` · ${inr(s.price)} / kg`}
                  </p>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
