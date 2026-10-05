import { useEffect, useState, type ReactNode } from "react";
import { Loader2, Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isAddress } from "@/chain/config";
import { useTx } from "./ui";

/**
 * "Offer N kg to <someone> at ₹P per kg". Used by farmers (to a distributor wallet)
 * and by distributors (to a shop contract). Nothing moves until the receiver accepts,
 * unless the receiver has switched on auto-accept for the sender.
 */
export function OfferDialog({
  trigger,
  title,
  description,
  targetLabel,
  targetPlaceholder,
  suggestions = [],
  max,
  defaultPrice,
  isTrusted,
  submit,
  onDone,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  targetLabel: string;
  targetPlaceholder: string;
  suggestions?: { label: string; address: string }[];
  max: number;
  defaultPrice?: number;
  /** does this address accept my offers without asking? */
  isTrusted?: (address: string) => Promise<boolean>;
  submit: (target: string, quantity: number, price: number) => Promise<{ delivered: boolean }>;
  onDone: () => void;
}) {
  const { busy, run } = useTx();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState(defaultPrice !== undefined ? String(defaultPrice) : "");
  const [trusted, setTrusted] = useState(false);

  useEffect(() => {
    let live = true;
    setTrusted(false);
    if (isTrusted && isAddress(target)) {
      isTrusted(target)
        .then((t) => live && setTrusted(t))
        .catch(() => undefined);
    }
    return () => {
      live = false;
    };
  }, [target, isTrusted]);

  const q = Number(quantity);
  const p = Number(price);
  const problem = !isAddress(target)
    ? "Enter a valid wallet address (0x…)"
    : !Number.isInteger(q) || q <= 0
      ? "Quantity must be a whole number of kg"
      : q > max
        ? `You only have ${max} kg available`
        : !Number.isInteger(p) || p < 0
          ? "Price must be a whole number (₹ per kg)"
          : "";

  const send = async () => {
    const ok = await run(trusted ? "Send and deliver" : "Send offer", () => submit(target, q, p), onDone);
    if (ok) {
      setOpen(false);
      setQuantity("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="od-target">{targetLabel}</Label>
            <Input id="od-target" value={target} placeholder={targetPlaceholder} onChange={(e) => setTarget(e.target.value.trim())} />
            {suggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <Button key={s.address} type="button" variant="outline" size="sm" onClick={() => setTarget(s.address)}>
                    {s.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="od-qty">Quantity (kg, max {max})</Label>
              <Input id="od-qty" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="od-price">Price (₹ per kg)</Label>
              <Input id="od-price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </div>
          {trusted ? (
            <p className="flex items-center gap-2 rounded-md bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
              <ShieldCheck className="h-4 w-4" />
              This receiver trusts you: the stock will be delivered immediately.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">The receiver must accept before any stock moves.</p>
          )}
          {problem && <p className="text-sm text-muted-foreground">{problem}</p>}
          <Button className="btn-primary w-full" disabled={busy || !!problem} onClick={() => void send()}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            {trusted ? "Send and deliver" : "Send offer"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
