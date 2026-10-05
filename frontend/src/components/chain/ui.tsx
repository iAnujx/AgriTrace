import { scopedKey } from "@/lib/session";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, Loader2, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addressUrl } from "@/chain/config";
import { errorMessage, shortAddr } from "@/chain/api";
import type { OfferStatus, ShelfStatus } from "@/chain/types";

export const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
export const fmtDate = (unixSeconds: number) =>
  unixSeconds ? new Date(unixSeconds * 1000).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

/** short address with copy + explorer link */
export function Addr({ a, label }: { a: string; label?: string }) {
  const url = addressUrl(a);
  return (
    <span className="inline-flex items-center gap-1 font-mono text-xs">
      <span title={a}>{label ?? shortAddr(a)}</span>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground"
        aria-label="Copy address"
        onClick={() => {
          void navigator.clipboard?.writeText(a);
          toast.success("Address copied");
        }}
      >
        <Copy className="h-3 w-3" />
      </button>
      {url && (
        <a href={url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="Open in explorer">
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </span>
  );
}

const OFFER_STYLE: Record<OfferStatus, string> = {
  pending: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  accepted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  rejected: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
  cancelled: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};
export const OfferBadge = ({ status }: { status: OfferStatus }) => (
  <Badge variant="secondary" className={`capitalize ${OFFER_STYLE[status]}`}>
    {status}
  </Badge>
);

const SHELF_STYLE: Record<ShelfStatus, string> = {
  in_transit: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  on_shelf: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  finalized: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200",
  damaged: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
};
const SHELF_LABEL: Record<ShelfStatus, string> = {
  in_transit: "In transit",
  on_shelf: "On shelf",
  finalized: "Ready for sale",
  damaged: "Damaged",
};
export const ShelfBadge = ({ status }: { status: ShelfStatus }) => (
  <Badge variant="secondary" className={SHELF_STYLE[status]}>
    {SHELF_LABEL[status]}
  </Badge>
);

export function Stat({ label, value, icon }: { label: string; value: ReactNode; icon: ReactNode }) {
  return (
    <Card className="card-modern">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
          <div className="text-primary">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => (
  <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>
);

export const Loading = ({ text = "Loading from the blockchain…" }: { text?: string }) => (
  <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
    <Loader2 className="h-4 w-4 animate-spin" />
    {text}
  </p>
);

export const ErrorNote = ({ message }: { message: string | null }) =>
  message ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{message}</p> : null;

/**
 * Wraps a blockchain action: shows a toast while it runs, reports the revert
 * reason if it fails, and calls `after` (usually a reload) when it succeeds.
 */
export function useTx() {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (label: string, action: () => Promise<unknown>, after?: () => void): Promise<boolean> => {
    setBusy(true);
    const id = toast.loading(`${label}… confirm in your wallet`);
    try {
      await action();
      toast.success(`${label}: done`, { id });
      after?.();
      return true;
    } catch (e) {
      toast.error(`${label} failed`, { id, description: errorMessage(e) });
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, run };
}

interface Field {
  key: string;
  label: string;
  placeholder?: string;
}

/** Name/location/contact card. Kept in this browser only (nothing here goes on-chain). */
export function ProfileCard({
  storageKey,
  title,
  description,
  icon,
  fields,
}: {
  storageKey: string;
  title: string;
  description: string;
  icon: ReactNode;
  fields: Field[];
}) {
  const [profile, setProfile] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);

  // one profile per person per role (never shared between accounts or roles)
  const key = scopedKey(storageKey);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) setProfile(JSON.parse(saved));
    } catch {
      /* ignore */
    }
  }, [key]);

  const save = () => {
    localStorage.setItem(key, JSON.stringify(profile));
    setEditing(false);
    toast.success("Profile saved");
  };

  return (
    <Card className="card-modern">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            {icon}
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing(!editing)}>
          <Pencil className="mr-2 h-4 w-4" />
          {editing ? "Cancel" : "Edit"}
        </Button>
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="space-y-4">
            {fields.map((f) => (
              <div key={f.key}>
                <Label htmlFor={`${storageKey}-${f.key}`}>{f.label}</Label>
                <Input
                  id={`${storageKey}-${f.key}`}
                  value={profile[f.key] ?? ""}
                  placeholder={f.placeholder}
                  onChange={(e) => setProfile({ ...profile, [f.key]: e.target.value })}
                />
              </div>
            ))}
            <Button className="btn-primary" onClick={save}>
              Save profile
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {fields.map((f) => (
              <div key={f.key}>
                <p className="text-sm text-muted-foreground">{f.label}</p>
                <p className="font-medium">{profile[f.key] || "Not set"}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
