import { createFileRoute } from "@tanstack/react-router";
import Page from "@/views/Traceability";

export const Route = createFileRoute("/traceability")({
  ssr: false,
  // /traceability?f=12 opens product #12
  validateSearch: (search: Record<string, unknown>): { f?: number } => {
    const n = Number(search["f"]);
    return Number.isInteger(n) && n > 0 ? { f: n } : {};
  },
  head: () => ({
    meta: [
      { title: "Traceability — AgriTrace" },
      { name: "description", content: "AgriTrace Traceability: blockchain-backed farm-to-table produce traceability." },
      { property: "og:title", content: "Traceability — AgriTrace" },
      { property: "og:description", content: "AgriTrace Traceability: blockchain-backed farm-to-table produce traceability." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});
