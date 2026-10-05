import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** Scans a pack's QR code with the camera (works in any modern browser) and hands back the raw text. */
export function QrScanDialog({
  open,
  onOpenChange,
  onResult,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onResult: (text: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [manual, setManual] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    let active = true;
    let raf = 0;
    let stream: MediaStream | null = null;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const tick = () => {
      const v = video.current;
      if (!active || !v || !ctx) return;
      if (v.readyState === v.HAVE_ENOUGH_DATA && v.videoWidth) {
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        ctx.drawImage(v, 0, 0);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
        if (code?.data) {
          active = false;
          onResult(code.data);
          onOpenChange(false);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };

    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia)
        return setError("This device has no camera access. Type the product number instead.");
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
        if (!active) return stream.getTracks().forEach((x) => x.stop());
        const v = video.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();
        raf = requestAnimationFrame(tick);
      } catch {
        setError(
          "Camera access was blocked. Allow it in your browser, or type the product number.",
        );
      }
    })();

    return () => {
      active = false;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((x) => x.stop());
    };
  }, [open, onOpenChange, onResult]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Scan the pack's QR code</DialogTitle>
          <DialogDescription>Hold the code inside the frame.</DialogDescription>
        </DialogHeader>
        <div className="relative aspect-square overflow-hidden rounded-2xl bg-black/90">
          <video ref={video} muted playsInline className="h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-10 rounded-2xl border-2 border-primary" />
        </div>
        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) {
              onResult(manual.trim());
              onOpenChange(false);
            }
          }}
        >
          <Input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Or type a product number / paste link"
          />
          <Button type="submit" variant="outline">
            Go
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
