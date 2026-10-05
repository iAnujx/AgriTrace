import { useEffect, useState } from "react";
import { ScanLine, Search } from "lucide-react";
import { QrScanDialog } from "@/components/extras/QrScanDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useChain } from "@/ContractContext";
import { fetchProduct, parseFragmentInput } from "@/chain/api";
import { ProductJourney, type LabelClaim } from "./ProductJourney";
import { ErrorNote, Loading } from "./ui";
import { useAsync } from "./useAsync";

const RECENT_KEY = "recent-products";
const loadRecent = (): number[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
};

/** Type a product number (or paste a QR link) and see its full journey. Needs no wallet. */
export function ProductLookup({ initial }: { initial?: number | undefined }) {
  const { read, missing } = useChain();
  const [input, setInput] = useState(initial ? String(initial) : "");
  const [id, setId] = useState<number | null>(initial ?? null);
  const [claim, setClaim] = useState<LabelClaim | undefined>(undefined);
  const [recent, setRecent] = useState<number[]>([]);
  const [bad, setBad] = useState(false);
  const [scan, setScan] = useState(false);

  useEffect(() => setRecent(loadRecent()), []);
  useEffect(() => {
    if (initial) {
      setInput(String(initial));
      setId(initial);
    }
  }, [initial]);

  const { data, loading, error } = useAsync(
    () => (id && read ? fetchProduct(read, id) : Promise.resolve(undefined)),
    [id, read],
  );

  useEffect(() => {
    if (!data) return;
    const next = [data.fragment.id, ...loadRecent().filter((x) => x !== data.fragment.id)].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    setRecent(next);
  }, [data]);

  const search = (text: string) => {
    const n = parseFragmentInput(text);
    setBad(n === null);
    if (n === null) return;
    // a pasted QR link also carries the label numbers to check
    const q = new URLSearchParams(text.includes("?") ? text.slice(text.indexOf("?")) : "");
    const [b, o, s] = [q.get("b"), q.get("o"), q.get("s")];
    setClaim(b && o && s ? { batchId: Number(b), offset: Number(o), size: Number(s) } : undefined);
    setId(n);
  };

  if (missing.length > 0) {
    return (
      <Card className="card-modern">
        <CardContent className="p-6 text-sm text-muted-foreground">
          The contracts are not configured yet. Missing: <span className="font-mono">{missing.join(", ")}</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="card-modern">
        <CardHeader>
          <CardTitle>Find a product</CardTitle>
          <CardDescription>Enter the product number printed on the pack, or paste the link from its QR code.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              search(input);
            }}
          >
            <Input value={input} placeholder="e.g. 3  or  https://…/trace?f=3" onChange={(e) => setInput(e.target.value)} />
            <Button type="submit" className="btn-primary">
              <Search className="mr-2 h-4 w-4" />
              Trace
            </Button>
            <Button type="button" variant="outline" onClick={() => setScan(true)}>
              <ScanLine className="mr-2 h-4 w-4" />
              Scan QR
            </Button>
          </form>
          <QrScanDialog open={scan} onOpenChange={setScan} onResult={(t) => { setInput(t); search(t); }} />
          {bad && <p className="text-sm text-destructive">That is not a product number or a trace link.</p>}
          {recent.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Recent:</span>
              {recent.map((r) => (
                <Button key={r} size="sm" variant="outline" onClick={() => { setInput(String(r)); search(String(r)); }}>
                  #{r}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {id && loading && <Loading text="Reading the blockchain…" />}
      <ErrorNote message={error ? (error.includes("Fragment not found") ? `No product #${id} exists.` : error) : null} />
      {data && read && <ProductJourney c={read} product={data} claim={claim} />}
    </div>
  );
}
