import { createFileRoute } from "@tanstack/react-router";
import Page from "@/views/Marketplace";

export const Route = createFileRoute("/marketplace")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Marketplace — AgriTrace" },
      { name: "description", content: "AgriTrace Marketplace: blockchain-backed farm-to-table produce traceability." },
      { property: "og:title", content: "Marketplace — AgriTrace" },
      { property: "og:description", content: "AgriTrace Marketplace: blockchain-backed farm-to-table produce traceability." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});
