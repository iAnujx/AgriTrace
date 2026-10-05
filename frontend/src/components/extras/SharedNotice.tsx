import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { extrasShared, onExtrasMode } from "@/lib/extras";

/** Shows only when the shared database table is missing, so people know why bids/photos stay on this device. */
export function SharedNotice() {
  const [shared, setShared] = useState(extrasShared());
  useEffect(() => onExtrasMode(() => setShared(extrasShared())), []);
  if (shared) return null;
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-xl border border-border bg-muted p-3 text-sm text-muted-foreground"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        Shared data is not set up yet, so photos, bids and notes are saved on this device only. Run{" "}
        <code>supabase/migrations/20261004000000_app_records.sql</code> once to share them between
        users.
      </span>
    </div>
  );
}
