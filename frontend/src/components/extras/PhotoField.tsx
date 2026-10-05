import { Camera, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { compressImage } from "@/lib/image";

/** Upload a crop photo or take one with the camera. Stored off-chain as a small JPEG. */
export function PhotoField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const pick = async (f: File | undefined) => {
    if (!f) return;
    try {
      onChange(await compressImage(f));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read that photo");
    }
  };
  const btn =
    "inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-accent";
  return (
    <div>
      <Label>Crop photo (optional)</Label>
      <div className="mt-2 overflow-hidden rounded-2xl border-2 border-dashed border-border">
        {value ? (
          <img src={value} alt="Crop" className="h-44 w-full object-cover" />
        ) : (
          <div className="grid h-32 place-items-center px-4 text-center text-sm text-muted-foreground">
            <div>
              <ImagePlus className="mx-auto mb-2 h-5 w-5 text-primary" />
              Upload or click a photo of your crop for verification.
            </div>
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <label className="inline-flex">
          <input
            hidden
            type="file"
            accept="image/*"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          <span className={btn}>
            <ImagePlus className="h-4 w-4" />
            Upload
          </span>
        </label>
        <label className="inline-flex">
          <input
            hidden
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          <span className={btn}>
            <Camera className="h-4 w-4" />
            Take photo
          </span>
        </label>
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}
