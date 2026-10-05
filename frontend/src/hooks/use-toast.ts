import { toast as sonner } from "sonner";

type ToastArgs = { title?: string; description?: string; variant?: "default" | "destructive" };

export function toast({ title, description, variant }: ToastArgs) {
  if (variant === "destructive") sonner.error(title, { description });
  else sonner.success(title, { description });
}

export function useToast() {
  return { toast };
}
