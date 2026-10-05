import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createBatch, fetchBatches } from "@/chain/api";
import { PhotoField } from "@/components/extras/PhotoField";
import { putRec, type Listing } from "@/lib/extras";
import { suggestPrice } from "@/lib/pricing";
import { toast } from "sonner";
import { useReady } from "./WalletGate";
import { useTx } from "./ui";

const CROP_TYPES = ["rabi", "kharif", "zaid", "vegetable", "fruit", "other"];
const today = () => new Date().toISOString().slice(0, 10);

/** Registers a harvest on the blockchain. The batch id is created by the contract. */
export function NewBatchForm({ onCreated }: { onCreated?: (batchId: number) => void }) {
  const { c, account } = useReady();
  const [image, setImage] = useState<string | null>(null);
  const { busy, run } = useTx();
  const [form, setForm] = useState({
    cropName: "",
    cropType: "rabi",
    quantity: "",
    expectedPrice: "",
    location: "",
    harvestDate: today(),
  });
  const set = (k: keyof typeof form, v: string) => setForm({ ...form, [k]: v });
  const hint = suggestPrice(form.cropName, form.cropType, form.location);

  const quantity = Number(form.quantity);
  const price = Number(form.expectedPrice);
  const problem = !form.cropName.trim()
    ? "Enter the crop name"
    : !Number.isInteger(quantity) || quantity <= 0
      ? "Quantity must be a whole number of kg"
      : !Number.isInteger(price) || price < 0
        ? "Price must be a whole number (₹ per kg)"
        : !form.location.trim()
          ? "Enter where it was grown"
          : "";

  const submit = async () => {
    let id = 0;
    const ok = await run(
      "Register batch",
      async () => {
        id = await createBatch(c, {
          cropName: form.cropName.trim(),
          cropType: form.cropType,
          quantity,
          expectedPrice: price,
          location: form.location.trim(),
          harvestDate: form.harvestDate,
        });
      },
      () => onCreated?.(id),
    );
    if (ok) {
      // Publish a marketplace listing (photo + asking price). Best-effort: the blockchain record already exists.
      try {
        const mine = (await fetchBatches(c)).find((b) => b.id === id);
        const data: Listing = { batchId: id, rootFragmentId: mine?.rootFragmentId ?? 0, farmer: account, cropName: form.cropName.trim(), cropType: form.cropType, location: form.location.trim(), harvestDate: form.harvestDate, quantity, price, image };
        await putRec("listing", account, String(id), data, { unique: true });
      } catch (e) {
        toast.warning("Registered on the blockchain, but the marketplace listing could not be saved", { description: e instanceof Error ? e.message : undefined });
      }
      setForm({ ...form, cropName: "", quantity: "", expectedPrice: "", location: "" });
      setImage(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="nb-name">Crop name</Label>
          <Input id="nb-name" value={form.cropName} placeholder="e.g. Wheat" onChange={(e) => set("cropName", e.target.value)} />
        </div>
        <div>
          <Label>Crop type</Label>
          <Select value={form.cropType} onValueChange={(v) => set("cropType", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CROP_TYPES.map((t) => (
                <SelectItem key={t} value={t} className="capitalize">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="nb-qty">Quantity (kg)</Label>
          <Input id="nb-qty" inputMode="numeric" value={form.quantity} placeholder="1000" onChange={(e) => set("quantity", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="nb-price">Expected price (₹ per kg)</Label>
          <Input id="nb-price" inputMode="numeric" value={form.expectedPrice} placeholder="25" onChange={(e) => set("expectedPrice", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="nb-loc">Grown at</Label>
          <Input id="nb-loc" value={form.location} placeholder="Village / city" onChange={(e) => set("location", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="nb-date">Harvest date</Label>
          <Input id="nb-date" type="date" value={form.harvestDate} onChange={(e) => set("harvestDate", e.target.value)} />
        </div>
      </div>
      {hint && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-accent p-3 text-sm">
          <span>
            Suggested price for this place: <b>₹{hint.price}/kg</b> <span className="text-muted-foreground">({hint.reason})</span>
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => set("expectedPrice", String(hint.price))}>Use this</Button>
        </div>
      )}
      {Number.isInteger(quantity) && quantity > 0 && Number.isInteger(price) && price > 0 && (
        <p className="text-sm text-muted-foreground">Total expected: ₹{(quantity * price).toLocaleString("en-IN")}</p>
      )}
      <PhotoField value={image} onChange={setImage} />
      {problem && <p className="text-sm text-muted-foreground">{problem}</p>}
      <Button className="btn-primary w-full" disabled={busy || !!problem} onClick={() => void submit()}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Register on blockchain
      </Button>
    </div>
  );
}
