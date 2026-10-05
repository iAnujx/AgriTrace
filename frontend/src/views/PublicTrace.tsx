// Target of the QR code on a pack: /trace?f=<product>&b=<batch>&o=<offset>&s=<size>
// Public page: no login, no wallet. Reads the blockchain and checks the label.
import { Link } from "@tanstack/react-router";
import { Sprout } from "lucide-react";
import { ProductJourney, type LabelClaim } from "@/components/chain/ProductJourney";
import { ErrorNote, Loading } from "@/components/chain/ui";
import { useAsync } from "@/components/chain/useAsync";
import { useChain } from "@/ContractContext";
import { fetchProduct } from "@/chain/api";

function readParams(): { id: number; claim?: LabelClaim | undefined } | null {
  const q = new URLSearchParams(window.location.search);
  const id = Number(q.get("f"));
  if (!Number.isInteger(id) || id <= 0) return null;
  const [b, o, s] = [q.get("b"), q.get("o"), q.get("s")];
  return { id, claim: b && o && s ? { batchId: Number(b), offset: Number(o), size: Number(s) } : undefined };
}

export default function PublicTrace() {
  const { read, missing } = useChain();
  const params = readParams();
  const { data, loading, error } = useAsync(
    () => (params && read ? fetchProduct(read, params.id) : Promise.resolve(undefined)),
    [params?.id, read],
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/80 px-4 py-3">
        <Link to="/" className="mx-auto flex max-w-3xl items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
            <Sprout className="h-5 w-5 text-primary-foreground" />
          </span>
          <span className="font-semibold">AgriTrace</span>
        </Link>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 p-4 py-8">
        <h1 className="text-2xl font-bold">Product journey</h1>
        {!params && <p>This QR code could not be read.</p>}
        {missing.length > 0 && <p className="text-muted-foreground">This site is not connected to the blockchain yet.</p>}
        {params && loading && <Loading text="Reading the blockchain…" />}
        <ErrorNote message={error ? (error.includes("Fragment not found") ? "This product does not exist on the blockchain." : error) : null} />
        {data && read && <ProductJourney c={read} product={data} claim={params?.claim} />}
      </main>
    </div>
  );
}
