import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { MapPin, Package, Route as RouteIcon, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Empty, inr } from "@/components/chain/ui";
import { batchKey, listRecs, ratingsByBatch, type Listing, type Rec } from "@/lib/extras";

/**
 * Consumer catalog. Shows only: photo, rating, price, place and category.
 * No farmer name or contact number is ever shown here.
 */
export function Catalog() {
  const [rows, setRows] = useState<Rec<Listing>[] | null>(null);
  const [ratings, setRatings] = useState<Awaited<ReturnType<typeof ratingsByBatch>>>(new Map());
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  useEffect(() => {
    void listRecs<Listing>("listing").then(setRows);
    void ratingsByBatch().then(setRatings);
  }, []);
  const cats = ["all", ...new Set((rows ?? []).map((r) => r.data.cropType))];
  const shown = (rows ?? []).filter(
    (r) =>
      (cat === "all" || r.data.cropType === cat) &&
      `${r.data.cropName} ${r.data.cropType} ${r.data.location}`
        .toLowerCase()
        .includes(q.trim().toLowerCase()),
  );
  return (
    <div className="space-y-4">
      <Input
        className="h-12 rounded-2xl"
        placeholder="Search crops, vegetables, grains or places…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {cats.map((c) => (
          <Button
            key={c}
            size="sm"
            variant={cat === c ? "default" : "outline"}
            className="rounded-full capitalize"
            onClick={() => setCat(c)}
          >
            {c}
          </Button>
        ))}
      </div>
      {rows === null ? (
        <Empty>Loading…</Empty>
      ) : shown.length === 0 ? (
        <Empty>Nothing listed yet.</Empty>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((r) => {
            const rt = ratings.get(batchKey(r.data.farmer, r.data.batchId));
            return (
              <Card key={r.id} className="card-modern overflow-hidden">
                <div className="aspect-square bg-muted">
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
                <CardContent className="space-y-1 p-3">
                  <Badge variant="secondary" className="capitalize">
                    {r.data.cropType}
                  </Badge>
                  <p className="font-semibold">{r.data.cropName}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {r.data.location}
                  </p>
                  <p className="flex items-center gap-1 text-sm">
                    <Star className="h-4 w-4 fill-primary text-primary" />
                    {rt ? rt.avg.toFixed(1) : "New"}
                  </p>
                  <p className="font-semibold text-primary">{inr(r.data.price)}/kg</p>
                  <Button asChild size="sm" variant="outline" className="w-full">
                    <Link to="/traceability" search={{ f: r.data.rootFragmentId }}>
                      <RouteIcon className="mr-1 h-4 w-4" />
                      View journey
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
